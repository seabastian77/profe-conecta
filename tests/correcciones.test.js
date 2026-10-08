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
const { hoyColombia } = require('../src/config/fechas');

// Devuelve fecha y hora de Colombia desplazadas las horas pedidas desde ahora.
function enColombia(horas) {
  const iso = new Date(Date.now() + horas * 3600000 - 5 * 3600000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

// Genera una franja futura distinta en cada corrida para no chocar con datos viejos.
function franjaUnica() {
  const n = Date.now() % 1000000;
  const anio = 2031 + (n % 7);
  const mes = String(1 + (n % 12)).padStart(2, '0');
  const dia = String(1 + (n % 28)).padStart(2, '0');
  const hh = String(6 + (n % 14)).padStart(2, '0');
  const mm = String(n % 60).padStart(2, '0');
  return { fecha: `${anio}-${mes}-${dia}`, hora: `${hh}:${mm}` };
}

// Pruebas de las correcciones de los defectos del Entregable 2; cada una falla con el código anterior.
describeSiHayBase('Correcciones de defectos', () => {
  let adminToken, doc1, doc2, mat1, mat2, docToken, est, estToken;

  // Devuelve una asignatura que el docente tiene registrada; las tutorías solo se aceptan en sus materias.
  async function materiaDe(docenteId) {
    const r = await db.pool.query(
      `SELECT a.nombre FROM docente_asignaturas da
       JOIN perfiles_docente pd ON pd.id = da.docente_id
       JOIN asignaturas a ON a.id = da.asignatura_id
       WHERE pd.usuario_id = $1 ORDER BY a.nombre LIMIT 1`, [docenteId]);
    return r.rows[0].nombre;
  }

  // Crea un estudiante nuevo con perfil y devuelve su id y su token.
  async function estudianteNuevo(prefijo) {
    const correo = `${prefijo}.${Date.now()}${Math.floor(Math.random() * 1000)}@amigo.edu.co`;
    const res = await request(app).post('/api/auth/registro').send({
      nombres: 'Prueba', apellidos: 'Correccion', correo, contrasena: 'Password123', rol: 'estudiante'
    });
    const token = res.body.token;
    await request(app).post('/api/perfil/estudiante').set('Authorization', `Bearer ${token}`)
      .send({ documento: '1098765432', programa: 'Ingeniería de Sistemas', semestre: '5', telefono: '3001234567' });
    return { id: res.body.usuario.id, correo, token };
  }

  beforeAll(async () => {
    const hash = await bcrypt.hash('AdminTest123', 12);
    const adm = await db.pool.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
       VALUES ('Test','Admin','admin.correcciones@amigo.edu.co',$1,'admin',1)
       ON CONFLICT (correo) DO UPDATE SET rol='admin', activo=1 RETURNING id`, [hash]);
    adminToken = generarToken({ id: adm.rows[0].id, correo: 'admin.correcciones@amigo.edu.co', rol: 'admin' });

    const docs = await db.pool.query(
      `SELECT DISTINCT u.id, u.correo FROM usuarios u
       JOIN perfiles_docente pd ON pd.usuario_id = u.id
       JOIN docente_asignaturas da ON da.docente_id = pd.id
       WHERE u.rol='docente' AND u.activo=1 ORDER BY u.id LIMIT 2`);
    doc1 = docs.rows[0].id;
    doc2 = docs.rows[1].id;
    mat1 = await materiaDe(doc1);
    mat2 = await materiaDe(doc2);
    docToken = generarToken({ id: doc1, correo: docs.rows[0].correo, rol: 'docente' });

    const nuevo = await estudianteNuevo('correcciones');
    est = nuevo.id;
    estToken = nuevo.token;
  });

  afterAll(async () => {
    await db.pool.end();
  });

  describe('Fechas de tutorías (RRN06, DEF-10)', () => {
    const base = () => ({ docente_id: doc1, asignatura: mat1, modalidad: 'Virtual' });

    test('rechaza una tutoría para hoy', async () => {
      const res = await request(app).post('/api/tutorias').set('Authorization', `Bearer ${estToken}`)
        .send({ ...base(), fecha: hoyColombia(), hora: '23:00' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/a partir de mañana/);
    });

    test.each([
      ['2027-13-45', '09:00'],
      ['mañana', '09:00'],
      ['2027-02-30', '09:00'],
      ['2027-03-10', '25:99'],
    ])('rechaza la fecha %s con la hora %s', async (fecha, hora) => {
      const res = await request(app).post('/api/tutorias').set('Authorization', `Bearer ${estToken}`)
        .send({ ...base(), fecha, hora });
      expect(res.status).toBe(400);
    });

    test('rechaza una modalidad inventada', async () => {
      const res = await request(app).post('/api/tutorias').set('Authorization', `Bearer ${estToken}`)
        .send({ ...base(), modalidad: 'Teletransporte', ...franjaUnica() });
      expect(res.status).toBe(400);
    });
  });

  test('un estudiante no queda con dos tutorías a la misma hora (DEF-09)', async () => {
    const franja = franjaUnica();
    const primera = await request(app).post('/api/tutorias').set('Authorization', `Bearer ${estToken}`)
      .send({ docente_id: doc1, asignatura: mat1, modalidad: 'Virtual', ...franja });
    expect(primera.status).toBe(201);
    const segunda = await request(app).post('/api/tutorias').set('Authorization', `Bearer ${estToken}`)
      .send({ docente_id: doc2, asignatura: mat2, modalidad: 'Presencial', ...franja });
    expect(segunda.status).toBe(409);
  });

  test('el administrador no programa asesorías para hoy (DEF-02)', async () => {
    const res = await request(app).post('/api/admin/programar-clase').set('Authorization', `Bearer ${adminToken}`)
      .send({ docente_id: doc1, estudiante_id: est, asignatura: mat1, fecha: hoyColombia(), hora: '23:30', modalidad: 'Virtual' });
    expect(res.status).toBe(400);
  });

  describe('Regla de 24 horas con la hora de Colombia (DEF-08)', () => {
    // Inserta una tutoría pendiente del estudiante a las horas indicadas desde ahora.
    async function tutoriaEn(horas) {
      const { fecha, hora } = enColombia(horas);
      const r = await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,'Prueba 24h','Virtual',$3,$4,'pendiente') RETURNING id`, [est, doc2, fecha, hora]);
      return r.rows[0].id;
    }

    test('con 26 horas de margen sí cancela', async () => {
      const id = await tutoriaEn(26);
      const res = await request(app).patch(`/api/tutorias/${id}/cancelar`).set('Authorization', `Bearer ${estToken}`);
      expect(res.status).toBe(200);
    });

    test('con 12 horas de margen no cancela y dice que faltan 12', async () => {
      const id = await tutoriaEn(12);
      const res = await request(app).patch(`/api/tutorias/${id}/cancelar`).set('Authorization', `Bearer ${estToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Faltan 12h/);
    });
  });

  test('una tutoría cancelada no se marca como realizada (DEF-06)', async () => {
    const r = await db.pool.query(
      `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
       VALUES ($1,$2,'Prueba estado','Virtual','2031-01-15','10:00','cancelada') RETURNING id`, [est, doc1]);
    const res = await request(app).patch(`/api/tutorias/${r.rows[0].id}/realizada`).set('Authorization', `Bearer ${docToken}`);
    expect(res.status).toBe(400);
    const estado = await db.pool.query('SELECT estado FROM tutorias WHERE id=$1', [r.rows[0].id]);
    expect(estado.rows[0].estado).toBe('cancelada');
  });

  test('la cuenta se bloquea después del tercer intento fallido (DEF-04)', async () => {
    const { correo } = await estudianteNuevo('bloqueo');
    for (let i = 0; i < 3; i++) {
      const fallo = await request(app).post('/api/auth/login').send({ correo, contrasena: 'Incorrecta123' });
      expect(fallo.status).toBe(401);
    }
    const cuarto = await request(app).post('/api/auth/login').send({ correo, contrasena: 'Password123' });
    expect(cuarto.status).toBe(429);
  });

  test('la base guarda las horas en la zona de Colombia (DEF-12)', async () => {
    const fila = await db.prepare('SHOW TimeZone').get();
    expect(fila.TimeZone || fila.timezone).toBe('America/Bogota');
  });

  describe('Promedio (DEF-14 y RF035)', () => {
    test('un estudiante nuevo queda sin promedio y no aparece en alerta', async () => {
      const nuevo = await estudianteNuevo('sinpromedio');
      const fila = await db.pool.query('SELECT promedio FROM perfiles_estudiante WHERE usuario_id=$1', [nuevo.id]);
      expect(fila.rows[0].promedio).toBeNull();
      const res = await request(app).get('/api/admin/usuarios?estado=alerta').set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.map(u => u.id)).not.toContain(nuevo.id);
    });

    test('el administrador registra el promedio y valida el rango', async () => {
      const nuevo = await estudianteNuevo('conpromedio');
      const datos = { nombres: 'Prueba', apellidos: 'Correccion', correo: nuevo.correo, rol: 'estudiante' };
      const malo = await request(app).put(`/api/admin/usuarios/${nuevo.id}`).set('Authorization', `Bearer ${adminToken}`)
        .send({ ...datos, promedio: 7 });
      expect(malo.status).toBe(400);
      const bueno = await request(app).put(`/api/admin/usuarios/${nuevo.id}`).set('Authorization', `Bearer ${adminToken}`)
        .send({ ...datos, promedio: 4.2 });
      expect(bueno.status).toBe(200);
      const fila = await db.pool.query('SELECT promedio FROM perfiles_estudiante WHERE usuario_id=$1', [nuevo.id]);
      expect(Number(fila.rows[0].promedio)).toBe(4.2);
    });

    test('el docente recibe el promedio real de sus estudiantes', async () => {
      await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,'Prueba promedio','Virtual','2031-02-20','11:00','pendiente')`, [est, doc1]);
      const res = await request(app).get('/api/tutorias').set('Authorization', `Bearer ${docToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('promedio');
    });
  });

  test('el documento del estudiante solo admite números', async () => {
    const res = await request(app).post('/api/perfil/estudiante').set('Authorization', `Bearer ${estToken}`)
      .send({ documento: ': 1098765432', programa: 'Ingeniería de Sistemas', semestre: '5', telefono: '3001234567' });
    expect(res.status).toBe(400);
  });
});
