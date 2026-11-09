process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';
process.env.DOMINIO_CORREO = process.env.DOMINIO_CORREO || '@amigo.edu.co';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/db');
const { unico, documentoUnico, crearUsuario, crearEstudiante, crearAdmin, borrarUsuarios } = require('./ayudas');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Pruebas de perfiles y de autenticación: validaciones, documentos únicos, fotos reales y recuperación de acceso.
afterAll(async () => {
  if (hayBase) await db.pool.end();
});

describeSiHayBase('Perfiles', () => {
  const creados = [];
  const como = (usuario, peticion) => peticion.set('Authorization', `Bearer ${usuario.token}`);

  afterAll(async () => {
    await borrarUsuarios(creados);
  });

  describe('Estudiante', () => {
    const datos = (cambio = {}) => ({ documento: documentoUnico(), programa: 'Ingeniería de Sistemas', semestre: '5', telefono: '3001234567', ...cambio });

    test('dos cuentas no pueden tener el mismo documento, pero la misma cuenta puede volver a guardarlo', async () => {
      const a = await crearUsuario('estudiante');
      const b = await crearUsuario('estudiante');
      creados.push(a.id, b.id);
      const documento = documentoUnico();

      expect((await como(a, request(app).post('/api/perfil/estudiante')).send(datos({ documento }))).status).toBe(200);
      expect((await como(a, request(app).post('/api/perfil/estudiante')).send(datos({ documento }))).status).toBe(200);

      const choque = await como(b, request(app).post('/api/perfil/estudiante')).send(datos({ documento }));
      expect(choque.status).toBe(409);
      expect(choque.body.error).toMatch(/otra cuenta/);
    });

    test.each([
      ['documento con letras', { documento: '12ab5678' }],
      ['semestre fuera de rango', { semestre: '13' }],
      ['semestre con texto', { semestre: 'décimo' }],
      ['programa con símbolos', { programa: '<img src=x>' }],
      ['programa que no es texto', { programa: { a: 1 } }],
      ['teléfono corto', { telefono: '123' }]
    ])('rechaza %s', async (_nombre, cambio) => {
      const alumno = await crearUsuario('estudiante');
      creados.push(alumno.id);
      const res = await como(alumno, request(app).post('/api/perfil/estudiante')).send(datos(cambio));
      expect(res.status).toBe(400);
    });

    test('un estudiante no puede guardar el perfil de otro rol', async () => {
      const alumno = await crearUsuario('estudiante');
      creados.push(alumno.id);
      expect((await como(alumno, request(app).post('/api/perfil/admin')).send({ cedula: documentoUnico(), cargo: 'X' })).status).toBe(403);
    });
  });

  describe('Docente', () => {
    const perfil = (cambio = {}) => ({
      cedula: documentoUnico(), facultad: 'Facultad de Ingenierías', telefono: '3001234567',
      asignaturas: [`Materia ${unico()}`], programas: ['Ingeniería de Sistemas'],
      horarios: [{ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '10:00', lugar: 'Bloque 3' }], ...cambio
    });

    test('guarda asignaturas, programas y horarios y los devuelve al consultar el perfil', async () => {
      const docente = await crearUsuario('docente');
      creados.push(docente.id);
      const body = perfil({ asignaturas: [`Cálculo ${unico()}`, `Álgebra ${unico()}`, `Física ${unico()}`] });
      body.asignaturas.push(body.asignaturas[0]);

      const res = await como(docente, request(app).post('/api/perfil/docente')).send(body);
      expect(res.status).toBe(200);

      const leido = await como(docente, request(app).get('/api/perfil'));
      expect(leido.body.perfil.asignaturas).toHaveLength(3);
      expect(leido.body.perfil.programas).toEqual(['Ingeniería de Sistemas']);
      expect(leido.body.perfil.horarios[0]).toMatchObject({ dia: 'Lunes', hora_inicio: '08:00', hora_fin: '10:00' });
    });

    test.each([
      ['horario que termina antes de empezar', { horarios: [{ dia: 'Lunes', hora_inicio: '10:00', hora_fin: '08:00' }] }],
      ['hora inexistente', { horarios: [{ dia: 'Lunes', hora_inicio: '25:00', hora_fin: '26:00' }] }],
      ['asignatura que no es texto', { asignaturas: [123] }],
      ['asignatura con símbolos', { asignaturas: ['<script>'] }],
      ['demasiadas asignaturas', { asignaturas: Array.from({ length: 31 }, (_, i) => `Materia número ${i}`) }],
      ['programas que no son lista', { programas: 'todos' }],
      ['cédula con letras', { cedula: 'CC 1234' }]
    ])('rechaza %s sin tocar lo guardado', async (_nombre, cambio) => {
      const docente = await crearUsuario('docente');
      creados.push(docente.id);
      const inicial = perfil();
      expect((await como(docente, request(app).post('/api/perfil/docente')).send(inicial)).status).toBe(200);

      const res = await como(docente, request(app).post('/api/perfil/docente')).send(perfil(cambio));
      expect(res.status).toBe(400);

      const leido = await como(docente, request(app).get('/api/perfil'));
      expect(leido.body.perfil.cedula).toBe(inicial.cedula);
      expect(leido.body.perfil.asignaturas).toEqual(inicial.asignaturas);
    });

    test('si falla un paso a mitad del guardado, el perfil anterior queda intacto', async () => {
      const docente = await crearUsuario('docente');
      creados.push(docente.id);
      const inicial = perfil();
      await como(docente, request(app).post('/api/perfil/docente')).send(inicial);

      await db.pool.query("ALTER TABLE docente_horarios ADD CONSTRAINT prueba_falla CHECK (lugar <> 'FALLA') NOT VALID");
      try {
        const nuevo = perfil({ asignaturas: [`Otra ${unico()}`], horarios: [{ dia: 'Martes', hora_inicio: '08:00', hora_fin: '09:00', lugar: 'FALLA' }] });
        const res = await como(docente, request(app).post('/api/perfil/docente')).send(nuevo);
        expect(res.status).toBeGreaterThanOrEqual(400);
      } finally {
        await db.pool.query('ALTER TABLE docente_horarios DROP CONSTRAINT IF EXISTS prueba_falla');
      }

      const leido = await como(docente, request(app).get('/api/perfil'));
      expect(leido.body.perfil.asignaturas).toEqual(inicial.asignaturas);
      expect(leido.body.perfil.horarios).toHaveLength(1);
    });

    test('dos docentes no pueden compartir cédula', async () => {
      const a = await crearUsuario('docente');
      const b = await crearUsuario('docente');
      creados.push(a.id, b.id);
      const cedula = documentoUnico();
      expect((await como(a, request(app).post('/api/perfil/docente')).send(perfil({ cedula }))).status).toBe(200);
      const res = await como(b, request(app).post('/api/perfil/docente')).send(perfil({ cedula }));
      expect(res.status).toBe(409);
    });
  });

  describe('Fotos', () => {
    test('acepta una imagen real y la guarda', async () => {
      const alumno = await crearUsuario('estudiante');
      creados.push(alumno.id);
      const res = await como(alumno, request(app).post('/api/perfil/foto')).send({ foto_base64: PNG, tipo: 'portada' });
      expect(res.status).toBe(200);
      const guardada = await db.pool.query('SELECT foto_portada FROM fotos_usuario WHERE usuario_id=$1', [alumno.id]);
      expect(guardada.rows[0].foto_portada).toBe(PNG);
    });

    test.each([
      ['texto con HTML', 'hola"><script>alert(1)</script>'],
      ['texto disfrazado de PNG', 'data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
      ['un SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
      ['algo que no es texto', 12345]
    ])('rechaza %s', async (_nombre, foto) => {
      const alumno = await crearUsuario('estudiante');
      creados.push(alumno.id);
      const res = await como(alumno, request(app).post('/api/perfil/foto')).send({ foto_base64: foto, tipo: 'perfil' });
      expect(res.status).toBe(400);
    });

    test('rechaza un tipo de foto desconocido y una imagen de más de 2 MB', async () => {
      const alumno = await crearUsuario('estudiante');
      creados.push(alumno.id);
      expect((await como(alumno, request(app).post('/api/perfil/foto')).send({ foto_base64: PNG, tipo: 'fondo' })).status).toBe(400);

      const imagenDe = (mb) => 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(mb * 1024 * 1024)]).toString('base64');
      const poco = await como(alumno, request(app).post('/api/perfil/foto')).send({ foto_base64: imagenDe(2.1) });
      expect(poco.status).toBe(400);
      expect(poco.body.error).toMatch(/2 MB/);

      const enorme = await como(alumno, request(app).post('/api/perfil/foto')).send({ foto_base64: imagenDe(4) });
      expect(enorme.status).toBe(413);
    });
  });

  describe('Materias', () => {
    test('un estudiante no crea materias en el catálogo, un docente sí, y no se repite con otras mayúsculas', async () => {
      const alumno = await crearUsuario('estudiante');
      const docente = await crearUsuario('docente');
      creados.push(alumno.id, docente.id);
      const nombre = `Materia nueva ${unico()}`;

      expect((await como(alumno, request(app).post('/api/asignaturas')).send({ nombre })).status).toBe(403);

      const creada = await como(docente, request(app).post('/api/asignaturas')).send({ nombre });
      expect(creada.status).toBe(201);
      const repetida = await como(docente, request(app).post('/api/asignaturas')).send({ nombre: nombre.toUpperCase() });
      expect(repetida.status).toBe(200);
      expect(repetida.body.id).toBe(creada.body.id);
      expect(repetida.body.nueva).toBe(false);
    });

    test('rechaza nombres y áreas con símbolos o que no son texto, y la búsqueda trata % como texto', async () => {
      const docente = await crearUsuario('docente');
      creados.push(docente.id);
      expect((await como(docente, request(app).post('/api/asignaturas')).send({ nombre: { x: 1 } })).status).toBe(400);
      expect((await como(docente, request(app).post('/api/asignaturas')).send({ nombre: `Valida ${unico()}`, area: '<b>' })).status).toBe(400);
      const busqueda = await como(docente, request(app).get('/api/asignaturas?q=%25%25'));
      expect(busqueda.status).toBe(200);
      expect(busqueda.body).toEqual([]);
    });
  });
});

describeSiHayBase('Autenticación', () => {
  const creados = [];

  afterAll(async () => {
    await borrarUsuarios(creados);
  });

  const registro = (cambio = {}) => request(app).post('/api/auth/registro').send({
    nombres: 'Mariana', apellidos: 'Cardona', correo: `reg.${unico()}@amigo.edu.co`, contrasena: 'Password123', rol: 'estudiante', ...cambio
  });

  test('el registro guarda el correo en minúsculas y el login funciona con cualquier combinación de mayúsculas', async () => {
    const base = `Mayus.${unico()}`;
    const res = await registro({ correo: `${base}@AMIGO.edu.co` });
    expect(res.status).toBe(201);
    creados.push(res.body.usuario.id);

    const guardado = await db.pool.query('SELECT correo FROM usuarios WHERE id=$1', [res.body.usuario.id]);
    expect(guardado.rows[0].correo).toBe(`${base}@amigo.edu.co`.toLowerCase());
    expect((await request(app).post('/api/auth/login').send({ correo: `${base}@amigo.EDU.co`, contrasena: 'Password123' })).status).toBe(200);
  });

  test('un usuario antiguo guardado con mayúsculas en la base también puede entrar', async () => {
    const correo = `Antiguo.${unico()}@Amigo.edu.co`;
    const alumno = await crearUsuario('estudiante');
    creados.push(alumno.id);
    await db.pool.query('UPDATE usuarios SET correo=$1 WHERE id=$2', [correo, alumno.id]);
    const res = await request(app).post('/api/auth/login').send({ correo, contrasena: 'Password123' });
    expect(res.status).toBe(200);
  });

  test.each([
    ['contraseña de más de 72 bytes', { contrasena: 'a1' + 'ñ'.repeat(40) }],
    ['contraseña sin número', { contrasena: 'SoloLetrasAqui' }],
    ['contraseña que no es texto', { contrasena: { a: 1 } }],
    ['nombre que no es texto', { nombres: ['Ana'] }],
    ['rol docente con mayúscula', { rol: 'Docente' }]
  ])('el registro rechaza %s con 400', async (_nombre, cambio) => {
    expect((await registro(cambio)).status).toBe(400);
  });

  test('el login con un cuerpo raro responde 400 y no 500', async () => {
    expect((await request(app).post('/api/auth/login').send({ correo: 'a@amigo.edu.co', contrasena: { x: 1 } })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ correo: ['a@amigo.edu.co'], contrasena: 'x' })).status).toBe(400);
  });

  test('tres contraseñas incorrectas bloquean la cuenta, aunque la cuarta sea la correcta', async () => {
    const alumno = await crearUsuario('estudiante');
    creados.push(alumno.id);
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/auth/login').send({ correo: alumno.correo, contrasena: 'Incorrecta99' })).status).toBe(401);
    }
    const bloqueado = await request(app).post('/api/auth/login').send({ correo: alumno.correo, contrasena: 'Password123' });
    expect(bloqueado.status).toBe(429);
    await db.pool.query('DELETE FROM intentos_login WHERE correo=$1', [alumno.correo]);
  });

  test('el login tarda parecido exista o no el correo (no revela qué cuentas existen)', async () => {
    const alumno = await crearUsuario('estudiante');
    creados.push(alumno.id);
    const medir = async (correo) => {
      const inicio = process.hrtime.bigint();
      await request(app).post('/api/auth/login').send({ correo, contrasena: 'Incorrecta99' });
      return Number(process.hrtime.bigint() - inicio) / 1e6;
    };
    await medir(`calentar.${unico()}@amigo.edu.co`);
    const inexistente = await medir(`inexistente.${unico()}@amigo.edu.co`);
    const existente = await medir(alumno.correo);
    expect(inexistente).toBeGreaterThan(existente * 0.4);
    await db.pool.query('DELETE FROM intentos_login WHERE correo=$1', [alumno.correo]);
  });

  describe('Recuperación de acceso', () => {
    test('responde igual exista o no el correo y solo avisa a los administradores cuando existe', async () => {
      const admin = await crearAdmin();
      const alumno = await crearEstudiante();
      creados.push(admin.id, alumno.id);
      const avisosDe = async (id) => Number((await db.pool.query("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=$1 AND titulo='Solicitud de recuperación de acceso'", [id])).rows[0].n);
      const antes = await avisosDe(admin.id);

      const inexistente = await request(app).post('/api/auth/recuperar').send({ correo: `nadie.${unico()}@amigo.edu.co` });
      const existente = await request(app).post('/api/auth/recuperar').send({ correo: alumno.correo });
      expect(inexistente.status).toBe(200);
      expect(existente.status).toBe(200);
      expect(existente.body).toEqual(inexistente.body);
      expect(existente.body.mensaje).not.toMatch(/enlace|expira/i);

      expect(await avisosDe(admin.id)).toBe(antes + 1);
      const aviso = await db.pool.query("SELECT descripcion FROM notificaciones WHERE usuario_id=$1 AND titulo='Solicitud de recuperación de acceso' ORDER BY id DESC LIMIT 1", [admin.id]);
      expect(aviso.rows[0].descripcion).toContain(alumno.correo);

      // Repetir la solicitud dentro de la misma hora no vuelve a avisar.
      await request(app).post('/api/auth/recuperar').send({ correo: alumno.correo });
      expect(await avisosDe(admin.id)).toBe(antes + 1);
    });

    test('un correo inválido da 400', async () => {
      expect((await request(app).post('/api/auth/recuperar').send({ correo: 'no-es-correo' })).status).toBe(400);
      expect((await request(app).post('/api/auth/recuperar').send({})).status).toBe(400);
    });

    test('después de cinco solicitudes seguidas desde la misma conexión responde 429', async () => {
      let aislada;
      jest.isolateModules(() => { aislada = require('../src/app'); });
      const estados = [];
      for (let i = 0; i < 6; i++) {
        estados.push((await request(aislada).post('/api/auth/recuperar').send({ correo: `nadie.${unico()}@amigo.edu.co` })).status);
      }
      expect(estados.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(estados[5]).toBe(429);
    });
  });

  test('/auth/yo devuelve al usuario autenticado y /auth/salir lo registra en la auditoría', async () => {
    const alumno = await crearEstudiante();
    creados.push(alumno.id);
    const yo = await request(app).get('/api/auth/yo').set('Authorization', `Bearer ${alumno.token}`);
    expect(yo.status).toBe(200);
    expect(yo.body.correo).toBe(alumno.correo);

    const salir = await request(app).post('/api/auth/salir').set('Authorization', `Bearer ${alumno.token}`).send({ motivo: 'inactividad' });
    expect(salir.status).toBe(200);
    const evento = await db.pool.query("SELECT detalle FROM auditoria WHERE usuario_id=$1 AND evento='LOGOUT'", [alumno.id]);
    expect(evento.rows[0].detalle).toMatch(/inactividad/);
  });
});
