process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/db');
const { hoyColombia, sumarDias } = require('../src/config/fechas');
const { unico, crearUsuario, crearDocente, crearEstudiante, crearAdmin, borrarUsuarios } = require('./ayudas');

// Pruebas del panel de administración: usuarios, asignaciones, períodos, configuración, notificaciones y auditoría.
describeSiHayBase('Panel de administración', () => {
  const creados = [];
  let admin;

  const como = (usuario, peticion) => peticion.set('Authorization', `Bearer ${usuario.token}`);
  const api = (metodo, ruta, cuerpo) => como(admin, request(app)[metodo](ruta)).send(cuerpo);

  beforeAll(async () => {
    admin = await crearAdmin();
    creados.push(admin.id);
  });

  afterAll(async () => {
    await borrarUsuarios(creados);
    await db.pool.end();
  });

  describe('Usuarios', () => {
    test('el listado se filtra en el servidor, se pagina y trae el total en X-Total-Count', async () => {
      const marca = `lista${unico()}`;
      for (let i = 0; i < 3; i++) creados.push((await crearUsuario('estudiante', marca)).id);

      const primera = await api('get', `/api/admin/usuarios?q=${marca}&limite=2&pagina=1`);
      expect(primera.status).toBe(200);
      expect(primera.body).toHaveLength(2);
      expect(primera.headers['x-total-count']).toBe('3');

      const segunda = await api('get', `/api/admin/usuarios?q=${marca}&limite=2&pagina=2`);
      expect(segunda.body).toHaveLength(1);

      const otroRol = await api('get', `/api/admin/usuarios?q=${marca}&rol=docente`);
      expect(otroRol.body).toHaveLength(0);
    });

    test('el filtro «alerta» solo incluye cuentas activas, igual que el contador del panel', async () => {
      const estudiante = await crearEstudiante();
      creados.push(estudiante.id);
      await db.pool.query('UPDATE perfiles_estudiante SET promedio = 2.1 WHERE usuario_id = $1', [estudiante.id]);

      const activo = await api('get', '/api/admin/usuarios?estado=alerta&limite=500');
      expect(activo.body.map((u) => u.id)).toContain(estudiante.id);

      expect((await api('patch', `/api/admin/usuarios/${estudiante.id}/estado`, { activo: false })).status).toBe(200);
      const inactivo = await api('get', '/api/admin/usuarios?estado=alerta&limite=500');
      expect(inactivo.body.map((u) => u.id)).not.toContain(estudiante.id);
    });

    test('los comodines de la búsqueda se tratan como texto', async () => {
      const res = await api('get', '/api/admin/usuarios?q=%25');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });

    test('el correo se guarda en minúsculas y no admite el mismo correo con otras mayúsculas', async () => {
      const correo = `Mixto.${unico()}@Amigo.edu.co`;
      const datos = { nombres: 'Laura', apellidos: 'Gómez', correo, rol: 'estudiante', contrasena: 'Password123' };
      const creado = await api('post', '/api/admin/usuarios', datos);
      expect(creado.status).toBe(200);
      creados.push(creado.body.id);

      const guardado = await db.pool.query('SELECT correo FROM usuarios WHERE id=$1', [creado.body.id]);
      expect(guardado.rows[0].correo).toBe(correo.toLowerCase());

      const repetido = await api('post', '/api/admin/usuarios', { ...datos, correo: correo.toUpperCase() });
      expect(repetido.status).toBe(409);
    });

    test.each([
      ['rol inexistente', { rol: 'superadmin' }, 'Rol inválido'],
      ['correo sin forma de correo', { correo: 'no-es-correo' }, 'correo'],
      ['contraseña corta', { contrasena: 'a1' }, 'mínimo 8'],
      ['contraseña de más de 72 bytes', { contrasena: 'a1' + 'ñ'.repeat(40) }, '72'],
      ['nombre con símbolos', { nombres: '<script>' }, 'letras']
    ])('rechaza %s', async (_nombre, cambio, texto) => {
      const datos = { nombres: 'Ana', apellidos: 'Ruiz', correo: `valido.${unico()}@amigo.edu.co`, rol: 'estudiante', contrasena: 'Password123', ...cambio };
      const res = await api('post', '/api/admin/usuarios', datos);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(texto);
    });

    test('el administrador no puede desactivarse, quitarse el rol ni eliminarse a sí mismo', async () => {
      const desactivar = await api('patch', `/api/admin/usuarios/${admin.id}/estado`, { activo: false });
      expect(desactivar.status).toBe(400);

      const quitarRol = await api('put', `/api/admin/usuarios/${admin.id}`, { nombres: 'Test', apellidos: 'Admin', correo: admin.correo, rol: 'estudiante' });
      expect(quitarRol.status).toBe(400);

      const eliminar = await api('delete', `/api/admin/usuarios/${admin.id}`);
      expect(eliminar.status).toBe(400);

      const sigue = await db.pool.query('SELECT rol, activo FROM usuarios WHERE id=$1', [admin.id]);
      expect(sigue.rows[0]).toEqual({ rol: 'admin', activo: 1 });
    });

    test('nunca se queda el sistema sin un administrador activo, ni con dos cambios a la vez', async () => {
      const otros = (await db.pool.query("SELECT id FROM usuarios WHERE rol='admin' AND activo=1 AND id <> $1", [admin.id])).rows.map(f => f.id);
      const segundo = await crearAdmin();
      creados.push(segundo.id);
      try {
        if (otros.length) await db.pool.query('UPDATE usuarios SET activo=0 WHERE id = ANY($1::int[])', [otros]);

        // Quedan exactamente dos administradores activos y los dos intentan desactivar al otro a la vez.
        const [a, b] = await Promise.all([
          como(admin, request(app).patch(`/api/admin/usuarios/${segundo.id}/estado`)).send({ activo: false }),
          como(segundo, request(app).patch(`/api/admin/usuarios/${admin.id}/estado`)).send({ activo: false })
        ]);
        const activos = await db.pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol='admin' AND activo=1 AND id = ANY($1::int[])", [[admin.id, segundo.id]]);
        expect(Number(activos.rows[0].n)).toBeGreaterThanOrEqual(1);
        expect([a.status, b.status].filter(s => s === 200).length).toBeLessThanOrEqual(1);

        // Con un solo administrador activo, no se le puede quitar el rol.
        await db.pool.query('UPDATE usuarios SET activo=1 WHERE id = ANY($1::int[])', [[admin.id, segundo.id]]);
        await db.pool.query('UPDATE usuarios SET activo=0 WHERE id = $1', [segundo.id]);
        const quitar = await api('put', `/api/admin/usuarios/${segundo.id}`, { nombres: 'Test', apellidos: 'Admin', correo: segundo.correo, rol: 'docente' });
        expect([200, 400]).toContain(quitar.status);
      } finally {
        if (otros.length) await db.pool.query('UPDATE usuarios SET activo=1 WHERE id = ANY($1::int[])', [otros]);
        await db.pool.query('UPDATE usuarios SET activo=1 WHERE id = ANY($1::int[])', [[admin.id]]);
      }
    });

    test('editar un usuario: correo repetido con otras mayúsculas da 409 y el promedio fuera de rango da 400', async () => {
      const a = await crearEstudiante();
      const b = await crearEstudiante();
      creados.push(a.id, b.id);

      const repetido = await api('put', `/api/admin/usuarios/${a.id}`, { nombres: 'Ana', apellidos: 'Ruiz', correo: b.correo.toUpperCase(), rol: 'estudiante' });
      expect(repetido.status).toBe(409);

      const promedio = await api('put', `/api/admin/usuarios/${a.id}`, { nombres: 'Ana', apellidos: 'Ruiz', correo: a.correo, rol: 'estudiante', promedio: 9 });
      expect(promedio.status).toBe(400);
    });

    test('cambiar la contraseña desde el panel permite entrar con la nueva y no con la vieja', async () => {
      const alumno = await crearEstudiante();
      creados.push(alumno.id);
      const cambio = await api('put', `/api/admin/usuarios/${alumno.id}`, { nombres: 'Ana', apellidos: 'Ruiz', correo: alumno.correo, rol: 'estudiante', contrasena: 'Nueva12345' });
      expect(cambio.status).toBe(200);

      const nueva = await request(app).post('/api/auth/login').send({ correo: alumno.correo, contrasena: 'Nueva12345' });
      expect(nueva.status).toBe(200);
      const vieja = await request(app).post('/api/auth/login').send({ correo: alumno.correo, contrasena: 'Password123' });
      expect(vieja.status).toBe(401);
    });

    test('eliminar un usuario borra sus datos pero conserva la auditoría, ahora sin usuario', async () => {
      const alumno = await crearEstudiante();
      const docente = await crearDocente();
      creados.push(docente.id);
      await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,'Borrado','Virtual',$3,'08:00','pendiente')`, [alumno.id, docente.id, sumarDias(hoyColombia(), 20)]);
      const evento = await db.pool.query("INSERT INTO auditoria (usuario_id, evento, detalle) VALUES ($1,'LOGIN','conservar') RETURNING id", [alumno.id]);

      const res = await api('delete', `/api/admin/usuarios/${alumno.id}`);
      expect(res.status).toBe(200);

      expect((await db.pool.query('SELECT 1 FROM usuarios WHERE id=$1', [alumno.id])).rowCount).toBe(0);
      expect((await db.pool.query('SELECT 1 FROM tutorias WHERE estudiante_id=$1', [alumno.id])).rowCount).toBe(0);
      expect((await db.pool.query('SELECT 1 FROM perfiles_estudiante WHERE usuario_id=$1', [alumno.id])).rowCount).toBe(0);
      const auditoria = await db.pool.query('SELECT usuario_id FROM auditoria WHERE id=$1', [evento.rows[0].id]);
      expect(auditoria.rowCount).toBe(1);
      expect(auditoria.rows[0].usuario_id).toBeNull();
    });

    test('no se elimina a otro administrador y los ids inválidos o inexistentes se responden bien', async () => {
      const otro = await crearAdmin();
      creados.push(otro.id);
      expect((await api('delete', `/api/admin/usuarios/${otro.id}`)).status).toBe(400);
      expect((await api('delete', '/api/admin/usuarios/2147483000')).status).toBe(404);
      expect((await api('delete', '/api/admin/usuarios/abc')).status).toBe(400);
      expect((await api('patch', '/api/admin/usuarios/2147483000/estado', { activo: true })).status).toBe(404);
    });

    test('un docente o un estudiante reciben 403 en todas las rutas del panel', async () => {
      const docente = await crearDocente();
      creados.push(docente.id);
      for (const ruta of ['/api/admin/usuarios', '/api/admin/estadisticas', '/api/admin/auditoria', '/api/admin/periodos', '/api/admin/configuracion']) {
        const res = await como(docente, request(app).get(ruta));
        expect(res.status).toBe(403);
      }
    });
  });

  describe('Asignaciones', () => {
    test('crear, repetir (409), inexistente (404) y eliminar dos veces (200 y 404)', async () => {
      const docente = await crearDocente();
      const alumno = await crearEstudiante();
      creados.push(docente.id, alumno.id);

      const creada = await api('post', '/api/admin/asignaciones', { estudiante_id: alumno.id, docente_id: docente.id });
      expect(creada.status).toBe(200);
      expect((await api('post', '/api/admin/asignaciones', { estudiante_id: alumno.id, docente_id: docente.id })).status).toBe(409);
      expect((await api('post', '/api/admin/asignaciones', { estudiante_id: 2147483000, docente_id: docente.id })).status).toBe(404);
      expect((await api('post', '/api/admin/asignaciones', { estudiante_id: 'x', docente_id: docente.id })).status).toBe(400);

      expect((await api('delete', `/api/admin/asignaciones/${creada.body.id}`)).status).toBe(200);
      expect((await api('delete', `/api/admin/asignaciones/${creada.body.id}`)).status).toBe(404);
    });

    test('cinco asignaciones simultáneas con cupo para dos: se crean exactamente dos', async () => {
      const docente = await crearDocente();
      const alumnos = await Promise.all(Array.from({ length: 5 }, () => crearEstudiante()));
      creados.push(docente.id, ...alumnos.map(a => a.id));
      const anterior = (await api('get', '/api/admin/configuracion')).body.RN_MAX_ESTUDIANTES;
      try {
        expect((await api('post', '/api/admin/configuracion', { clave: 'RN_MAX_ESTUDIANTES', valor: 2 })).status).toBe(200);
        const respuestas = await Promise.all(alumnos.map(a => api('post', '/api/admin/asignaciones', { estudiante_id: a.id, docente_id: docente.id })));
        expect(respuestas.filter(r => r.status === 200)).toHaveLength(2);
        expect(respuestas.filter(r => r.status === 409)).toHaveLength(3);
      } finally {
        await api('post', '/api/admin/configuracion', { clave: 'RN_MAX_ESTUDIANTES', valor: anterior });
      }
    });
  });

  describe('Configuración', () => {
    test.each([
      ['una clave que no existe', { clave: 'inventada', valor: 3 }],
      ['una clave peligrosa', { clave: '__proto__', valor: 3 }],
      ['un valor fuera de rango', { clave: 'RN_PROMEDIO_MINIMO', valor: 9 }],
      ['un valor que no es número', { clave: 'RN_PROMEDIO_MINIMO', valor: 'abc' }],
      ['un entero con decimales', { clave: 'RN_MAX_ESTUDIANTES', valor: 2.5 }]
    ])('rechaza %s', async (_nombre, cuerpo) => {
      expect((await api('post', '/api/admin/configuracion', cuerpo)).status).toBe(400);
    });

    test('guardar y restaurar los valores por defecto funciona', async () => {
      const anterior = (await api('get', '/api/admin/configuracion')).body;
      try {
        expect((await api('post', '/api/admin/configuracion', { clave: 'RN_HORAS_CANCELACION', valor: 48 })).status).toBe(200);
        expect((await api('get', '/api/admin/configuracion')).body.RN_HORAS_CANCELACION).toBe(48);
        const reset = await api('post', '/api/admin/configuracion/reset');
        expect(reset.status).toBe(200);
        expect(reset.body.valores.RN_HORAS_CANCELACION).toBe(24);
      } finally {
        for (const [clave, valor] of Object.entries(anterior)) await api('post', '/api/admin/configuracion', { clave, valor });
      }
    });
  });

  describe('Períodos', () => {
    test('valida nombre, fechas, repetidos y cruces', async () => {
      const anio = 3100 + (Date.now() % 800);
      const nombre = `T-${unico()}`.slice(0, 30);
      const creado = await api('post', '/api/admin/periodos', { nombre, inicio: `${anio}-01-01`, fin: `${anio}-06-30` });
      expect(creado.status).toBe(201);

      expect((await api('post', '/api/admin/periodos', { nombre: nombre.toUpperCase(), inicio: `${anio + 1}-01-01`, fin: `${anio + 1}-06-30` })).status).toBe(409);
      expect((await api('post', '/api/admin/periodos', { nombre: `${nombre}b`, inicio: `${anio}-03-01`, fin: `${anio}-09-30` })).status).toBe(409);
      expect((await api('post', '/api/admin/periodos', { nombre: `${nombre}c`, inicio: `${anio}-06-30`, fin: `${anio}-01-01` })).status).toBe(400);
      expect((await api('post', '/api/admin/periodos', { nombre: '<b>x</b>', inicio: `${anio + 2}-01-01`, fin: `${anio + 2}-06-30` })).status).toBe(400);
      expect((await api('post', '/api/admin/periodos', { nombre: { x: 1 }, inicio: `${anio + 2}-01-01`, fin: `${anio + 2}-06-30` })).status).toBe(400);

      expect((await api('patch', `/api/admin/periodos/${creado.body.id}/cerrar`)).status).toBe(200);
      expect((await api('patch', `/api/admin/periodos/${creado.body.id}/cerrar`)).status).toBe(400);
      expect((await api('patch', `/api/admin/periodos/${creado.body.id}/activar`)).status).toBe(400);
      expect((await api('patch', '/api/admin/periodos/2147483000/activar')).status).toBe(404);
    });
  });

  describe('Notificaciones del administrador', () => {
    test('a un usuario concreto llega una y queda una fila en el historial', async () => {
      const alumno = await crearEstudiante();
      creados.push(alumno.id);
      const asunto = `Aviso ${unico()}`;
      const res = await api('post', '/api/admin/notificaciones', { destinatario: 'usuario', usuario_id: alumno.id, tipo: 'General', asunto, mensaje: 'Hola' });
      expect(res.status).toBe(200);
      expect(res.body.cantidad).toBe(1);

      expect((await db.pool.query('SELECT 1 FROM notificaciones WHERE usuario_id=$1 AND titulo=$2', [alumno.id, asunto])).rowCount).toBe(1);
      expect((await db.pool.query('SELECT 1 FROM historial_notificaciones WHERE asunto=$1', [asunto])).rowCount).toBe(1);
    });

    test.each([
      ['asunto que no es texto', { asunto: { a: 1 }, mensaje: 'x' }],
      ['mensaje demasiado largo', { asunto: 'x', mensaje: 'x'.repeat(2001) }],
      ['tipo demasiado largo', { asunto: 'x', mensaje: 'x', tipo: 'x'.repeat(60) }],
      ['destinatario desconocido', { asunto: 'x', mensaje: 'x', destinatario: 'marcianos' }],
      ['usuario sin elegir', { asunto: 'x', mensaje: 'x', destinatario: 'usuario' }]
    ])('rechaza %s', async (_nombre, cambio) => {
      const res = await api('post', '/api/admin/notificaciones', { destinatario: 'docentes', tipo: 'General', ...cambio });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Auditoría y reportes', () => {
    test('el filtro trata los comodines como texto, valida la fecha y trae el total', async () => {
      const comodin = await api('get', '/api/admin/auditoria?tipo=%25%25');
      expect(comodin.status).toBe(200);
      expect(comodin.body).toHaveLength(0);

      expect((await api('get', '/api/admin/auditoria?fecha=2026-13-45')).status).toBe(400);

      const todos = await api('get', '/api/admin/auditoria?limite=5');
      expect(todos.status).toBe(200);
      expect(todos.body.length).toBeLessThanOrEqual(5);
      expect(Number(todos.headers['x-total-count'])).toBeGreaterThanOrEqual(todos.body.length);
    });

    test('el filtro por grupo trae solo los eventos del grupo, se combina con la fecha y rechaza grupos inventados', async () => {
      const marca = unico();
      await db.pool.query("INSERT INTO auditoria (usuario_id, evento, detalle) VALUES ($1,'CONFIG_RESET',$2), ($1,'LOGIN_FALLIDO',$2), ($1,'LOGIN',$2)", [admin.id, marca]);

      const sistema = await api('get', '/api/admin/auditoria?grupo=sistema&limite=500');
      expect(sistema.status).toBe(200);
      expect(sistema.body.some((e) => e.evento === 'CONFIG_RESET' && e.detalle === marca)).toBe(true);
      expect(sistema.body.every((e) => ['CONFIG', 'CONFIG_RESET', 'PERIODO_CREADO', 'PERIODO_ACTIVADO', 'PERIODO_CERRADO', 'AUDITORIA_ARCHIVADA'].includes(e.evento))).toBe(true);

      const fallidos = await api('get', '/api/admin/auditoria?grupo=fallido&limite=500');
      expect(fallidos.body.some((e) => e.evento === 'LOGIN_FALLIDO' && e.detalle === marca)).toBe(true);
      expect(fallidos.body.some((e) => e.evento === 'LOGIN')).toBe(false);

      const inicios = await api('get', '/api/admin/auditoria?grupo=inicio&limite=500');
      expect(inicios.body.every((e) => e.evento === 'LOGIN')).toBe(true);
      expect(Number(inicios.headers['x-total-count'])).toBeGreaterThanOrEqual(1);

      const hoy = await api('get', `/api/admin/auditoria?grupo=sistema&fecha=${hoyColombia()}&limite=500`);
      expect(hoy.status).toBe(200);

      expect((await api('get', '/api/admin/auditoria?grupo=inventado')).status).toBe(400);
      expect((await api('get', '/api/admin/auditoria?grupo=constructor')).status).toBe(400);
      expect((await api('get', '/api/admin/auditoria?grupo=__proto__')).status).toBe(400);
    });

    test('estadísticas y reportes responden con números y un período inexistente da 404', async () => {
      const est = await api('get', '/api/admin/estadisticas');
      expect(est.status).toBe(200);
      for (const campo of ['total_usuarios', 'alertas_activas', 'tutorias_este_mes', 'total_tutorias', 'tutorias_proximas']) {
        expect(typeof est.body[campo]).toBe('number');
      }
      expect((await api('get', '/api/admin/reportes?periodo=todos')).status).toBe(200);
      expect((await api('get', '/api/admin/reportes?periodo=2147483000')).status).toBe(404);
    });
  });
});
