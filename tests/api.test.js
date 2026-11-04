process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const app = require('../src/app');
const { generarToken } = require('../src/config/jwt');
const { db } = require('../src/config/db');
const { crearUsuario, crearAdmin, borrarUsuarios, unico } = require('./ayudas');

describe('Rutas públicas', () => {
  test('GET /api/ping responde ok', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ok');
  });

  test('una ruta /api inexistente devuelve 404 en JSON, no HTML', async () => {
    const res = await request(app).get('/api/no-existe-esta-ruta');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('no expone la cabecera X-Powered-By', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('manda las cabeceras de seguridad de helmet', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('Control de acceso', () => {
  test('las rutas de admin exigen token', async () => {
    const res = await request(app).get('/api/admin/estadisticas');
    expect(res.status).toBe(401);
  });

  test('un token mal formado no pasa', async () => {
    const res = await request(app)
      .get('/api/admin/estadisticas')
      .set('Authorization', 'Bearer esto-no-es-un-token');
    expect(res.status).toBe(401);
  });
});

describe('Validación del registro', () => {
  test('no permite registrarse como admin', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombres: 'Intruso', apellidos: 'Malicioso',
      correo: 'intruso@amigo.edu.co',
      contrasena: 'Password123', rol: 'admin'
    });
    expect(res.status).toBe(400);
  });

  test('rechaza contraseñas débiles', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombres: 'Ana', apellidos: 'Pérez',
      correo: 'ana@amigo.edu.co',
      contrasena: '123', rol: 'estudiante'
    });
    expect(res.status).toBe(400);
  });

  test('rechaza correos fuera del dominio institucional', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombres: 'Ana', apellidos: 'Pérez',
      correo: 'ana@gmail.com',
      contrasena: 'Password123', rol: 'estudiante'
    });
    expect(res.status).toBe(400);
  });
});

describe('Canje de código OAuth', () => {
  test('un código inválido devuelve 400, no un token', async () => {
    const res = await request(app)
      .post('/api/auth/google/canjear')
      .send({ codigo: 'inventado' });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });
});

describe('Errores controlados con una base simulada', () => {
  // Carga la app con una base que falla de la forma indicada, en modo producción o de prueba.
  function appConBaseQueFalla(error, produccion) {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = produccion ? 'production' : 'test';
    let appSimulada;
    jest.isolateModules(() => {
      jest.doMock('../src/config/db', () => {
        const falla = async () => { throw error; };
        return {
          db: {
            prepare: () => ({ get: falla, all: falla, run: falla }),
            verificar: async () => false,
            pool: { query: falla }
          }
        };
      });
      appSimulada = require('../src/app');
    });
    process.env.NODE_ENV = anterior;
    jest.dontMock('../src/config/db');
    return appSimulada;
  }

  const token = () => generarToken({ id: 1, correo: 'a@amigo.edu.co', rol: 'admin' });

  test('en PRODUCCIÓN un error de SQL no filtra detalles internos y trae una referencia', async () => {
    const error = Object.assign(new Error('relation "usuarios" does not exist'), { code: '42P01' });
    const res = await request(appConBaseQueFalla(error, true))
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error interno del servidor');
    expect(res.body.referencia).toMatch(/^[0-9a-f]{6}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/usuarios|relation|42P01/);
  });

  const fallosDeConexion = {
    'conexión rechazada (TCP)': Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED', syscall: 'connect' }),
    'socket local que no existe': Object.assign(new Error('connect ENOENT /tmp/.s.PGSQL.5433'), { code: 'ENOENT', syscall: 'connect' }),
    'tiempo de espera agotado': Object.assign(new Error('connect ETIMEDOUT 10.0.0.5:5432'), { code: 'ETIMEDOUT', syscall: 'connect' }),
    'servidor apagándose (57P01)': Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }),
    'conexión cortada por el servidor': new Error('Connection terminated unexpectedly'),
    'host inalcanzable': Object.assign(new Error('connect EHOSTUNREACH 10.0.0.5:5432'), { code: 'EHOSTUNREACH', syscall: 'connect' }),
    'localhost con IPv4 e IPv6 (AggregateError)': Object.assign(new Error('AggregateError'), { errors: [{ code: 'ECONNREFUSED', syscall: 'connect' }, { code: 'ECONNREFUSED', syscall: 'connect' }] })
  };

  test.each(Object.entries(fallosDeConexion))('si la base no responde (%s) devuelve 503 con Retry-After, no un 500', async (_nombre, error) => {
    const res = await request(appConBaseQueFalla(error, true))
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('5');
    expect(res.body.error).toMatch(/servicio de datos/);
    expect(JSON.stringify(res.body)).not.toMatch(/ENOENT|ECONN|PGSQL|127\.0\.0\.1|10\.0\.0/);
  });

  test('un ENOENT que no es de conexión (por ejemplo de un archivo) sigue siendo un 500 genérico', async () => {
    const error = Object.assign(new Error("ENOENT: no such file or directory, open 'x'"), { code: 'ENOENT', syscall: 'open' });
    const res = await request(appConBaseQueFalla(error, true))
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Error interno del servidor');
  });

  test('/api/salud avisa que la base está caída con 503 y /api/ping sigue respondiendo', async () => {
    const appSimulada = appConBaseQueFalla(new Error('caída'), false);
    const salud = await request(appSimulada).get('/api/salud');
    expect(salud.status).toBe(503);
    expect(salud.body).toMatchObject({ estado: 'degradado', base: 'sin conexión' });

    const ping = await request(appSimulada).get('/api/ping');
    expect(ping.status).toBe(200);
  });
});

describe('Cuerpos de petición inválidos', () => {
  test('un JSON mal formado devuelve 400 en JSON', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{"correo":');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/JSON/);
  });

  test('un cuerpo de más de 100 KB devuelve 413', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ correo: 'a@amigo.edu.co', contrasena: 'x'.repeat(150 * 1024) }));
    expect(res.status).toBe(413);
  });

  test('un login sin cuerpo no rompe: responde 400', async () => {
    const res = await request(app).post('/api/auth/login');
    expect(res.status).toBe(400);
  });
});

describeSiHayBase('Con base de datos', () => {
  afterAll(async () => {
    await borrarUsuarios(creados);
    await db.pool.end();
  });

  const creados = [];

  test('/api/salud responde 200 con la base conectada', async () => {
    const res = await request(app).get('/api/salud');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'ok', base: 'ok' });
  });

  test('un estudiante NO puede entrar a rutas de admin (403)', async () => {
    const estudiante = await crearUsuario('estudiante');
    creados.push(estudiante.id);
    const res = await request(app).get('/api/admin/estadisticas').set('Authorization', `Bearer ${estudiante.token}`);
    expect(res.status).toBe(403);
  });

  test('un token de un usuario que ya no existe se rechaza (401)', async () => {
    const res = await request(app).get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${generarToken({ id: 2147483000, correo: 'fantasma@amigo.edu.co', rol: 'admin' })}`);
    expect(res.status).toBe(401);
  });

  test('una cuenta desactivada pierde el acceso al instante aunque su token siga vigente', async () => {
    const estudiante = await crearUsuario('estudiante');
    creados.push(estudiante.id);
    const antes = await request(app).get('/api/perfil').set('Authorization', `Bearer ${estudiante.token}`);
    expect(antes.status).toBe(200);

    await db.pool.query('UPDATE usuarios SET activo = 0 WHERE id = $1', [estudiante.id]);
    const despues = await request(app).get('/api/perfil').set('Authorization', `Bearer ${estudiante.token}`);
    expect(despues.status).toBe(401);
  });

  test('el rol sale de la base y no del token: un token de admin de un estudiante no sirve', async () => {
    const estudiante = await crearUsuario('estudiante');
    creados.push(estudiante.id);
    const tokenFalso = generarToken({ id: estudiante.id, correo: estudiante.correo, rol: 'admin' });
    const res = await request(app).get('/api/admin/estadisticas').set('Authorization', `Bearer ${tokenFalso}`);
    expect(res.status).toBe(403);
  });

  test('un identificador que no es número devuelve 400 en JSON', async () => {
    const estudiante = await crearUsuario('estudiante');
    creados.push(estudiante.id);
    const res = await request(app).patch('/api/tutorias/no-es-un-numero/cancelar')
      .set('Authorization', `Bearer ${estudiante.token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/identificador/);
  });

  test('login con credenciales falsas devuelve 401 genérico', async () => {
    const res = await request(app).post('/api/auth/login').send({
      correo: `noexiste.${unico()}@amigo.edu.co`, contrasena: 'loquesea123'
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Correo o contraseña incorrectos');
  });

  test('las estadísticas devuelven números, no strings', async () => {
    const admin = await crearAdmin();
    creados.push(admin.id);
    const res = await request(app)
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total_usuarios).toBe('number');
    expect(typeof res.body.total_tutorias).toBe('number');
  });
});
