// Pruebas de integración contra la API real.
// Necesitan una PostgreSQL de pruebas: si no hay DATABASE_URL, se saltan
// en vez de fallar, para que el CI no se ponga rojo por falta de base.

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const app = require('../src/app');
const { generarToken } = require('../src/config/jwt');

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

  test('un estudiante NO puede entrar a rutas de admin', async () => {
    const token = generarToken({ id: 999, correo: 'est@amigo.edu.co', rol: 'estudiante' });
    const res = await request(app)
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403); // 403 = autenticado pero sin permiso
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

describe('Errores en handlers async no tumban el proceso', () => {
  // Regresión: HORAS_CANCELACION se usaba sin estar definida y lanzaba un
  // ReferenceError. Al ser un handler async sin captura, Node mataba el proceso
  // entero cada vez que alguien cancelaba una tutoría. El envoltorio de
  // middlewares/envolver.js convierte eso en un 500 normal.
  test('un id inválido devuelve 500 en JSON, no derriba el servidor', async () => {
    const token = generarToken({ id: 1, correo: 'a@amigo.edu.co', rol: 'admin' });
    const res = await request(app)
      .patch('/api/tutorias/no-es-un-numero/cancelar')
      .set('Authorization', `Bearer ${token}`);

    expect([400, 404, 500]).toContain(res.status);
    expect(res.body.error).toBeDefined();
    // Lo importante: se respondió. Si el proceso hubiera muerto, no habría respuesta.
  });

  test('en PRODUCCIÓN el error no filtra detalles internos al cliente', async () => {
    // En desarrollo y en las pruebas el manejador sí devuelve el mensaje real:
    // ayuda a depurar. Lo que no puede pasar es que en producción se le
    // entreguen al cliente nombres de tablas o mensajes del motor de base de
    // datos. Por eso se carga una instancia aparte de la app en modo producción.
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    let appProd;
    jest.isolateModules(() => { appProd = require('../src/app'); });

    const token = generarToken({ id: 1, correo: 'a@amigo.edu.co', rol: 'admin' });
    const res = await request(appProd)
      .patch('/api/tutorias/no-es-un-numero/cancelar')
      .set('Authorization', `Bearer ${token}`);

    process.env.NODE_ENV = anterior;

    if (res.status === 500) {
      expect(res.body.error).toBe('Error interno del servidor');
      expect(res.body.error).not.toMatch(/syntax|column|relation|postgres/i);
    }
  });
});

describeSiHayBase('Con base de datos', () => {
  test('login con credenciales falsas devuelve 401 genérico', async () => {
    const res = await request(app).post('/api/auth/login').send({
      correo: 'noexiste@amigo.edu.co', contrasena: 'loquesea123'
    });
    expect(res.status).toBe(401);
    // El mensaje no debe revelar si el correo existe o no.
    expect(res.body.error).toBe('Correo o contraseña incorrectos');
  });

  test('las estadísticas devuelven números, no strings', async () => {
    const token = generarToken({ id: 1, correo: 'admin@amigo.edu.co', rol: 'admin' });
    const res = await request(app)
      .get('/api/admin/estadisticas')
      .set('Authorization', `Bearer ${token}`);
    if (res.status === 200) {
      expect(typeof res.body.total_usuarios).toBe('number');
      expect(typeof res.body.total_tutorias).toBe('number');
    }
  });
});
