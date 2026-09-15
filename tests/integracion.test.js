process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DOMINIO_CORREO = process.env.DOMINIO_CORREO || '@amigo.edu.co';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const bcrypt  = require('bcrypt');
const app = require('../src/app');
const { db } = require('../src/config/db');
const { generarToken } = require('../src/config/jwt');

// Prueba de extremo a extremo de todos los endpoints contra una base real.
describeSiHayBase('Integración de endpoints', () => {
  let adminId, adminToken, docId, docToken, estId, estToken, estCorreo;

  beforeAll(async () => {
    const admCorreo = 'admin.test@amigo.edu.co';
    const hash = await bcrypt.hash('AdminTest123', 12);
    const adm = await db.pool.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
       VALUES ('Test','Admin',$1,$2,'admin',1)
       ON CONFLICT (correo) DO UPDATE SET rol='admin', activo=1 RETURNING id`,
      [admCorreo, hash]
    );
    adminId = adm.rows[0].id;
    adminToken = generarToken({ id: adminId, correo: admCorreo, rol: 'admin' });

    const doc = await db.pool.query("SELECT id, correo FROM usuarios WHERE rol='docente' AND activo=1 LIMIT 1");
    const est = await db.pool.query("SELECT id, correo FROM usuarios WHERE rol='estudiante' AND activo=1 LIMIT 1");
    docId = doc.rows[0].id;
    docToken = generarToken({ id: docId, correo: doc.rows[0].correo, rol: 'docente' });
    estId = est.rows[0].id;
    estCorreo = est.rows[0].correo;
    estToken = generarToken({ id: estId, correo: estCorreo, rol: 'estudiante' });
  });

  afterAll(async () => {
    await db.pool.end();
  });

  describe('Registro y login', () => {
    const correo = `nuevo.${Date.now()}@amigo.edu.co`;

    test('registra un estudiante nuevo (201) y da token', async () => {
      const res = await request(app).post('/api/auth/registro').send({
        nombres: 'Nuevo', apellidos: 'Estudiante', correo,
        contrasena: 'Password123', rol: 'estudiante'
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
    });

    test('registrarse con el mismo correo devuelve 409, no 500', async () => {
      const res = await request(app).post('/api/auth/registro').send({
        nombres: 'Otro', apellidos: 'Igual', correo,
        contrasena: 'Password123', rol: 'estudiante'
      });
      expect(res.status).toBe(409);
    });

    test('login del recién creado funciona', async () => {
      const res = await request(app).post('/api/auth/login').send({ correo, contrasena: 'Password123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
    });
  });

  describe('Perfil', () => {
    test('el estudiante NO puede fijar su propio promedio', async () => {
      const antes = await db.pool.query('SELECT promedio FROM perfiles_estudiante WHERE usuario_id=$1', [estId]);
      const res = await request(app).post('/api/perfil/estudiante')
        .set('Authorization', `Bearer ${estToken}`)
        .send({ documento: '123', programa: 'Sistemas', semestre: '5', telefono: '3000000000', promedio: 5.0 });
      expect(res.status).toBe(200);
      const despues = await db.pool.query('SELECT promedio FROM perfiles_estudiante WHERE usuario_id=$1', [estId]);
      expect(Number(despues.rows[0].promedio)).not.toBe(5.0);
      if (antes.rows[0]) expect(Number(despues.rows[0].promedio)).toBe(Number(antes.rows[0].promedio));
    });

    test('un estudiante NO puede guardar perfil de docente (403)', async () => {
      const res = await request(app).post('/api/perfil/docente')
        .set('Authorization', `Bearer ${estToken}`)
        .send({ cedula: '999', facultad: 'X' });
      expect(res.status).toBe(403);
    });

    test('GET /perfil devuelve el usuario y su perfil', async () => {
      const res = await request(app).get('/api/perfil').set('Authorization', `Bearer ${estToken}`);
      expect(res.status).toBe(200);
      expect(res.body.correo).toBe(estCorreo);
    });
  });

  describe('Tutorías', () => {
    test('programar con docente inexistente devuelve 404, no 500', async () => {
      const res = await request(app).post('/api/tutorias')
        .set('Authorization', `Bearer ${estToken}`)
        .send({ docente_id: 999999, asignatura: 'X', modalidad: 'Virtual', fecha: '2027-01-01', hora: '10:00' });
      expect(res.status).toBe(404);
    });

    test('programar una tutoría válida devuelve 201 con id', async () => {
      // Franja horaria única para no chocar con corridas anteriores.
      const n = Date.now() % 100000;
      const anio = 2030 + (n % 5);
      const hh = String(6 + (n % 12)).padStart(2, '0');
      const mm = String(n % 60).padStart(2, '0');
      const res = await request(app).post('/api/tutorias')
        .set('Authorization', `Bearer ${estToken}`)
        .send({ docente_id: docId, asignatura: 'Programación I', modalidad: 'Virtual', fecha: `${anio}-03-15`, hora: `${hh}:${mm}` });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    test('listar tutorías del estudiante devuelve un arreglo', async () => {
      const res = await request(app).get('/api/tutorias').set('Authorization', `Bearer ${estToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('docentes-disponibles y buscar-estudiante responden', async () => {
      const d = await request(app).get('/api/tutorias/docentes-disponibles').set('Authorization', `Bearer ${estToken}`);
      expect(d.status).toBe(200);
      expect(Array.isArray(d.body)).toBe(true);
      const b = await request(app).get('/api/tutorias/buscar-estudiante?q=an').set('Authorization', `Bearer ${docToken}`);
      expect(b.status).toBe(200);
    });
  });

  describe('Asignaturas', () => {
    test('listar, por-áreas y buscar responden', async () => {
      const t = await request(app).get('/api/asignaturas/todas').set('Authorization', `Bearer ${estToken}`);
      expect(t.status).toBe(200);
      expect(Array.isArray(t.body)).toBe(true);
      const a = await request(app).get('/api/asignaturas/areas').set('Authorization', `Bearer ${estToken}`);
      expect(a.status).toBe(200);
      const q = await request(app).get('/api/asignaturas?q=program').set('Authorization', `Bearer ${estToken}`);
      expect(q.status).toBe(200);
    });
  });

  describe('Notificaciones', () => {
    test('listar y marcar todas como leídas', async () => {
      const l = await request(app).get('/api/notificaciones').set('Authorization', `Bearer ${estToken}`);
      expect(l.status).toBe(200);
      expect(Array.isArray(l.body)).toBe(true);
      const m = await request(app).patch('/api/notificaciones/leer-todas').set('Authorization', `Bearer ${estToken}`);
      expect(m.status).toBe(200);
    });
  });

  describe('Administración', () => {
    test('estadísticas devuelve números', async () => {
      const res = await request(app).get('/api/admin/estadisticas').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.total_usuarios).toBe('number');
    });

    test('listar usuarios devuelve arreglo', async () => {
      const res = await request(app).get('/api/admin/usuarios').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('crear usuario con contraseña válida (201/200) y débil (400)', async () => {
      const correo = `creado.${Date.now()}@amigo.edu.co`;
      const ok = await request(app).post('/api/admin/usuarios')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nombres: 'C', apellidos: 'R', correo, rol: 'estudiante', contrasena: 'Password123' });
      expect([200, 201]).toContain(ok.status);
      const debil = await request(app).post('/api/admin/usuarios')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nombres: 'C', apellidos: 'R', correo: `d.${Date.now()}@amigo.edu.co`, rol: 'estudiante', contrasena: '123' });
      expect(debil.status).toBe(400);
    });

    test('actualizar usuario con un correo ya usado devuelve 409, no 500', async () => {
      const res = await request(app).put(`/api/admin/usuarios/${estId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nombres: 'X', apellidos: 'Y', correo: 'admin.test@amigo.edu.co', rol: 'estudiante' });
      expect(res.status).toBe(409);
    });

    test('auditoría, asignaciones, configuración y períodos responden', async () => {
      const aud = await request(app).get('/api/admin/auditoria').set('Authorization', `Bearer ${adminToken}`);
      expect(aud.status).toBe(200);
      const asg = await request(app).get('/api/admin/asignaciones').set('Authorization', `Bearer ${adminToken}`);
      expect(asg.status).toBe(200);
      const cfg = await request(app).get('/api/admin/configuracion').set('Authorization', `Bearer ${adminToken}`);
      expect(cfg.status).toBe(200);
      const per = await request(app).get('/api/admin/periodos').set('Authorization', `Bearer ${adminToken}`);
      expect(per.status).toBe(200);
    });
  });
});
