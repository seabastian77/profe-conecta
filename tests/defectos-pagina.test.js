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

// Devuelve fecha y hora de Colombia desplazadas las horas pedidas desde ahora.
function enColombia(horas) {
  const iso = new Date(Date.now() + horas * 3600000 - 5 * 3600000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

// Genera una franja futura distinta en cada corrida para no chocar con datos viejos.
function franjaUnica() {
  const n = Date.now() % 1000000;
  return {
    fecha: `${2040 + (n % 9)}-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`,
    hora: `${String(6 + (n % 14)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  };
}

const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

// Pruebas de los defectos encontrados al recorrer la página como usuario; cada una falla con el código anterior.
describeSiHayBase('Defectos encontrados recorriendo la página', () => {
  let adminToken, docente, docenteToken, materia, materiaAjena;

  const admin = (peticion) => peticion.set('Authorization', `Bearer ${adminToken}`);
  const contar = async (sql, params) => parseInt((await db.pool.query(sql, params)).rows[0].n);
  const notificacionesDe = (usuarioId) => contar('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=$1', [usuarioId]);

  // Registra un estudiante con perfil en el programa indicado y devuelve su id, correo y token.
  async function estudianteNuevo(prefijo, programa = 'Ingeniería de Sistemas') {
    const correo = `${prefijo}.${unico()}@amigo.edu.co`;
    const res = await request(app).post('/api/auth/registro').send({
      nombres: 'Prueba', apellidos: 'Pagina', correo, contrasena: 'Password123', rol: 'estudiante'
    });
    await request(app).post('/api/perfil/estudiante').set('Authorization', `Bearer ${res.body.token}`)
      .send({ documento: '1098765432', programa, semestre: '3', telefono: '3001234567' });
    return { id: res.body.usuario.id, correo, token: res.body.token };
  }

  // Crea un docente nuevo desde el administrador y le guarda perfil con la materia dada.
  async function docenteNuevo(prefijo, asignatura) {
    const correo = `${prefijo}.${unico()}@amigo.edu.co`;
    const creado = await admin(request(app).post('/api/admin/usuarios'))
      .send({ nombres: 'Docente', apellidos: 'Prueba', correo, rol: 'docente', contrasena: 'Password123' });
    const token = generarToken({ id: creado.body.id, correo, rol: 'docente' });
    await request(app).post('/api/perfil/docente').set('Authorization', `Bearer ${token}`)
      .send({ cedula: '1023456999', facultad: 'Facultad de Ingenierías', telefono: '3001234567', asignaturas: [asignatura] });
    return { id: creado.body.id, token };
  }

  const guardarRegla = (clave, valor) => admin(request(app).post('/api/admin/configuracion')).send({ clave, valor });

  beforeAll(async () => {
    const hash = await bcrypt.hash('AdminTest123', 12);
    const adm = await db.pool.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
       VALUES ('Test','Pagina','admin.pagina@amigo.edu.co',$1,'admin',1)
       ON CONFLICT (correo) DO UPDATE SET rol='admin', activo=1 RETURNING id`, [hash]);
    adminToken = generarToken({ id: adm.rows[0].id, correo: 'admin.pagina@amigo.edu.co', rol: 'admin' });

    const doc = await db.pool.query(
      `SELECT u.id, u.correo, a.nombre AS materia FROM usuarios u
       JOIN perfiles_docente pd ON pd.usuario_id = u.id
       JOIN docente_asignaturas da ON da.docente_id = pd.id
       JOIN asignaturas a ON a.id = da.asignatura_id
       WHERE u.rol='docente' AND u.activo=1 ORDER BY u.id, a.nombre LIMIT 1`);
    docente = doc.rows[0].id;
    materia = doc.rows[0].materia;
    docenteToken = generarToken({ id: docente, correo: doc.rows[0].correo, rol: 'docente' });

    const ajena = await db.pool.query(
      `SELECT a.nombre FROM asignaturas a WHERE a.id NOT IN (
         SELECT da.asignatura_id FROM docente_asignaturas da JOIN perfiles_docente pd ON pd.id = da.docente_id
         WHERE pd.usuario_id = $1) ORDER BY a.nombre LIMIT 1`, [docente]);
    materiaAjena = ajena.rows[0].nombre;
  });

  afterAll(async () => {
    await admin(request(app).post('/api/admin/configuracion/reset'));
    await db.pool.end();
  });

  describe('Materias por tutor', () => {
    test('docentes-disponibles entrega la lista de materias de cada tutor', async () => {
      const res = await request(app).get('/api/tutorias/docentes-disponibles').set('Authorization', `Bearer ${docenteToken}`);
      const tutor = res.body.find(d => d.id === docente);
      expect(Array.isArray(tutor.materias)).toBe(true);
      expect(tutor.materias).toContain(materia);
    });

    test('no deja pedir una tutoría en una materia que el tutor no dicta', async () => {
      const est = await estudianteNuevo('materia');
      const pedir = (asignatura) => request(app).post('/api/tutorias').set('Authorization', `Bearer ${est.token}`)
        .send({ docente_id: docente, asignatura, modalidad: 'Virtual', ...franjaUnica() });
      const ajena = await pedir(materiaAjena);
      expect(ajena.status).toBe(400);
      const propia = await pedir(materia);
      expect(propia.status).toBe(201);
    });

    test('el administrador tampoco programa asesorías en materias ajenas al docente', async () => {
      const est = await estudianteNuevo('asesoria');
      const res = await admin(request(app).post('/api/admin/programar-clase'))
        .send({ docente_id: docente, estudiante_id: est.id, asignatura: materiaAjena, modalidad: 'Virtual', ...franjaUnica() });
      expect(res.status).toBe(400);
    });
  });

  describe('Configuración que sí se aplica', () => {
    test('rechaza parámetros inventados y valores fuera de rango', async () => {
      expect((await guardarRegla('parametroInventado', 5)).status).toBe(400);
      expect((await guardarRegla('RN_HORAS_CANCELACION', 'abc')).status).toBe(400);
      expect((await guardarRegla('RN_HORAS_CANCELACION', 500)).status).toBe(400);
      expect((await guardarRegla('RN_PROMEDIO_MINIMO', 9)).status).toBe(400);
    });

    test('las horas de cancelación que guarda la pantalla se aplican', async () => {
      const est = await estudianteNuevo('cancela48');
      try {
        expect((await guardarRegla('horas_cancelacion', 48)).status).toBe(200);
        const { fecha, hora } = enColombia(30);
        const t = await db.pool.query(
          `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
           VALUES ($1,$2,$3,'Virtual',$4,$5,'pendiente') RETURNING id`, [est.id, docente, materia, fecha, hora]);
        const res = await request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${est.token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/48h/);
      } finally {
        await guardarRegla('RN_HORAS_CANCELACION', 24);
      }
    });

    test('el umbral de alerta configurado cambia quién está en alerta', async () => {
      const est = await estudianteNuevo('umbral');
      await admin(request(app).put(`/api/admin/usuarios/${est.id}`))
        .send({ nombres: 'Prueba', apellidos: 'Pagina', correo: est.correo, rol: 'estudiante', promedio: 3.2 });
      const enAlerta = async () => (await admin(request(app).get('/api/admin/usuarios?estado=alerta'))).body.map(u => u.id);
      try {
        expect(await enAlerta()).not.toContain(est.id);
        expect((await guardarRegla('RN_PROMEDIO_MINIMO', 3.5)).status).toBe(200);
        expect(await enAlerta()).toContain(est.id);
      } finally {
        await guardarRegla('RN_PROMEDIO_MINIMO', 3.0);
      }
    });

    test('el máximo de estudiantes por tutor se respeta', async () => {
      const tutor = await docenteNuevo('cupo', materia);
      const uno = await estudianteNuevo('cupo1');
      const dos = await estudianteNuevo('cupo2');
      try {
        expect((await guardarRegla('RN_MAX_ESTUDIANTES', 1)).status).toBe(200);
        const primera = await admin(request(app).post('/api/admin/asignaciones')).send({ estudiante_id: uno.id, docente_id: tutor.id });
        expect(primera.status).toBe(200);
        const segunda = await admin(request(app).post('/api/admin/asignaciones')).send({ estudiante_id: dos.id, docente_id: tutor.id });
        expect(segunda.status).toBe(409);
      } finally {
        await guardarRegla('RN_MAX_ESTUDIANTES', 15);
      }
    });

    test('cualquier usuario con sesión puede leer las reglas vigentes', async () => {
      const est = await estudianteNuevo('reglas');
      const res = await request(app).get('/api/reglas').set('Authorization', `Bearer ${est.token}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ PROMEDIO_MINIMO: 3, HORAS_CANCELACION: 24, MAX_ESTUDIANTES: 15, MINUTOS_INACTIVIDAD: 15 });
    });

    test('resetear deja los valores por defecto, incluida la sesión en 15 minutos', async () => {
      await guardarRegla('RN_MINUTOS_SESION', 120);
      await admin(request(app).post('/api/admin/configuracion/reset'));
      const res = await admin(request(app).get('/api/admin/configuracion'));
      expect(res.body).toMatchObject({ RN_PROMEDIO_MINIMO: 3, RN_HORAS_CANCELACION: 24, RN_MAX_ESTUDIANTES: 15, RN_MINUTOS_SESION: 15 });
    });
  });

  describe('Períodos académicos', () => {
    // Fechas de un año lejano y propio de esta corrida para no cruzarse con otros períodos abiertos.
    const anio = 2200 + (Date.now() % 700);

    test('crear un período nuevo no da error 500 y valida los datos', async () => {
      const nombre = `P-${unico()}`;
      const nuevo = await admin(request(app).post('/api/admin/periodos')).send({ nombre, inicio: `${anio}-02-01`, fin: `${anio}-06-15` });
      expect(nuevo.status).toBe(201);
      const repetido = await admin(request(app).post('/api/admin/periodos')).send({ nombre, inicio: `${anio}-08-01`, fin: `${anio}-11-30` });
      expect(repetido.status).toBe(409);
      const alReves = await admin(request(app).post('/api/admin/periodos')).send({ nombre: `R-${unico()}`, inicio: `${anio}-11-30`, fin: `${anio}-08-01` });
      expect(alReves.status).toBe(400);
      const cerrado = await admin(request(app).patch(`/api/admin/periodos/${nuevo.body.id}/cerrar`));
      expect(cerrado.status).toBe(200);
    });

    test('cerrar un período cerrado o inexistente responde con error', async () => {
      const nuevo = await admin(request(app).post('/api/admin/periodos')).send({ nombre: `C-${unico()}`, inicio: `${anio}-07-01`, fin: `${anio}-07-30` });
      await admin(request(app).patch(`/api/admin/periodos/${nuevo.body.id}/cerrar`));
      expect((await admin(request(app).patch(`/api/admin/periodos/${nuevo.body.id}/cerrar`))).status).toBe(400);
      expect((await admin(request(app).patch('/api/admin/periodos/99999999/cerrar'))).status).toBe(404);
    });

    test('no deja dos períodos activos al mismo tiempo', async () => {
      let temporal = null;
      const activo = await db.pool.query("SELECT id FROM periodos WHERE estado='activo' LIMIT 1");
      if (!activo.rows[0]) {
        temporal = (await db.pool.query(
          "INSERT INTO periodos (nombre, inicio, fin, estado) VALUES ($1,$2,$3,'activo') RETURNING id",
          [`A-${unico()}`, `${anio}-12-01`, `${anio}-12-20`])).rows[0].id;
      }
      const nuevo = await admin(request(app).post('/api/admin/periodos')).send({ nombre: `S-${unico()}`, inicio: `${anio}-09-01`, fin: `${anio}-09-30` });
      expect((await admin(request(app).patch(`/api/admin/periodos/${nuevo.body.id}/activar`))).status).toBe(409);
      await admin(request(app).patch(`/api/admin/periodos/${nuevo.body.id}/cerrar`));
      if (temporal) await db.pool.query("UPDATE periodos SET estado='cerrado' WHERE id=$1", [temporal]);
    });
  });

  describe('Notificaciones del administrador', () => {
    test('«Usuario específico» solo le llega a ese usuario', async () => {
      const elegido = await estudianteNuevo('elegido');
      const otro = await estudianteNuevo('otro');
      const antesOtro = await notificacionesDe(otro.id);
      const res = await admin(request(app).post('/api/admin/notificaciones'))
        .send({ destinatario: 'usuario', usuario_id: elegido.id, tipo: 'ℹ️ Información general', asunto: 'Solo para ti', mensaje: 'Prueba' });
      expect(res.status).toBe(200);
      expect(res.body.cantidad).toBe(1);
      expect(await notificacionesDe(elegido.id)).toBe(1);
      expect(await notificacionesDe(otro.id)).toBe(antesOtro);
    });

    test('por programa solo le llega a los estudiantes de ese programa', async () => {
      const programa = `Programa ${unico()}`;
      const delPrograma = await estudianteNuevo('programa', programa);
      const otro = await estudianteNuevo('fuera');
      const antesOtro = await notificacionesDe(otro.id);

      const lista = await admin(request(app).get('/api/admin/programas'));
      expect(lista.body.map(p => p.programa)).toContain(programa);

      const res = await admin(request(app).post('/api/admin/notificaciones'))
        .send({ destinatario: 'programa', programa, tipo: '📋 Reunión obligatoria', asunto: 'Reunión', mensaje: 'Prueba' });
      expect(res.status).toBe(200);
      expect(res.body.cantidad).toBe(1);
      expect(await notificacionesDe(delPrograma.id)).toBe(1);
      expect(await notificacionesDe(otro.id)).toBe(antesOtro);
    });

    test('sin usuario elegido o con un destinatario desconocido no envía nada', async () => {
      const sinUsuario = await admin(request(app).post('/api/admin/notificaciones'))
        .send({ destinatario: 'Usuario específico', tipo: 'General', asunto: 'X', mensaje: 'Y' });
      expect(sinUsuario.status).toBe(400);
      const raro = await admin(request(app).post('/api/admin/notificaciones'))
        .send({ destinatario: 'cualquier cosa', tipo: 'General', asunto: 'X', mensaje: 'Y' });
      expect(raro.status).toBe(400);
    });
  });

  describe('Reportes con datos reales', () => {
    test('los indicadores salen de la base y la recuperación sigue RF024', async () => {
      const programa = `Reporte ${unico()}`;
      await estudianteNuevo('reporte', programa);
      const res = await admin(request(app).get('/api/admin/reportes?periodo=todos'));
      expect(res.status).toBe(200);

      const activos = await contar("SELECT COUNT(*) AS n FROM usuarios WHERE rol='estudiante' AND activo=1");
      expect(res.body.indicadores.estudiantes_activos).toBe(activos);

      const rf024 = (await db.pool.query(
        `SELECT COUNT(*) FILTER (WHERE pe.promedio >= 3.0) AS si, COUNT(*) AS total
         FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
         WHERE u.activo = 1 AND u.rol = 'estudiante'`)).rows[0];
      expect(res.body.indicadores.tasa_recuperacion).toBe(Math.round(Number(rf024.si) / Number(rf024.total) * 100));

      const fila = res.body.por_programa.find(p => p.programa === programa);
      expect(fila).toMatchObject({ estudiantes: 1, alertas: 0 });
    });

    test('el filtro por período cuenta solo las tutorías de sus fechas', async () => {
      const anio = 2900 + (Date.now() % 90);
      const est = await estudianteNuevo('periodo');
      const periodo = await admin(request(app).post('/api/admin/periodos'))
        .send({ nombre: `F-${unico()}`, inicio: `${anio}-03-01`, fin: `${anio}-03-31` });
      for (const [fecha, estado] of [[`${anio}-03-10`, 'completada'], [`${anio}-03-20`, 'pendiente'], [`${anio}-04-05`, 'completada']]) {
        await db.pool.query(
          `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
           VALUES ($1,$2,$3,'Virtual',$4,'10:00',$5)`, [est.id, docente, materia, fecha, estado]);
      }
      const res = await admin(request(app).get(`/api/admin/reportes?periodo=${periodo.body.id}`));
      expect(res.body.periodo.id).toBe(periodo.body.id);
      expect(res.body.indicadores.total_tutorias).toBe(2);
      expect(res.body.indicadores.tutorias_completadas).toBe(1);
      await admin(request(app).patch(`/api/admin/periodos/${periodo.body.id}/cerrar`));
    });
  });

  describe('Auditoría', () => {
    test('archivar saca del listado los registros viejos pero los conserva', async () => {
      const detalle = `viejo-${unico()}`;
      await db.pool.query(
        `INSERT INTO auditoria (usuario_id, evento, detalle, creada_en)
         VALUES (NULL, 'PRUEBA', $1, to_char(NOW() - INTERVAL '120 days', 'YYYY-MM-DD"T"HH24:MI:SS'))`, [detalle]);
      const res = await admin(request(app).post('/api/admin/auditoria/archivar'));
      expect(res.status).toBe(200);
      expect(res.body.archivados).toBeGreaterThanOrEqual(1);
      const listado = await admin(request(app).get('/api/admin/auditoria?tipo=PRUEBA'));
      expect(listado.body.map(e => e.detalle)).not.toContain(detalle);
      const archivados = await admin(request(app).get('/api/admin/auditoria?tipo=PRUEBA&archivadas=1'));
      expect(archivados.body.map(e => e.detalle)).toContain(detalle);
    });

    test('el intento fallido y el cierre de sesión quedan registrados con la IP', async () => {
      const est = await estudianteNuevo('acceso');
      await request(app).post('/api/auth/login').send({ correo: est.correo, contrasena: 'Equivocada123' });
      const fallido = await db.pool.query(
        "SELECT ip FROM auditoria WHERE evento='LOGIN_FALLIDO' AND detalle LIKE $1", [`%${est.correo}%`]);
      expect(fallido.rows.length).toBe(1);
      expect(fallido.rows[0].ip).toBeTruthy();

      const salir = await request(app).post('/api/auth/salir').set('Authorization', `Bearer ${est.token}`).send({});
      expect(salir.status).toBe(200);
      expect(await contar("SELECT COUNT(*) AS n FROM auditoria WHERE evento='LOGOUT' AND usuario_id=$1", [est.id])).toBe(1);
    });
  });

  test('las estadísticas traen los datos de todas las tarjetas del panel', async () => {
    const res = await admin(request(app).get('/api/admin/estadisticas'));
    expect(typeof res.body.eventos_auditoria).toBe('number');
    expect(typeof res.body.tutorias_proximas).toBe('number');
    expect(res.body).toHaveProperty('periodo_activo');
  });

  describe('Perfil', () => {
    test('la foto solo acepta imágenes', async () => {
      const est = await estudianteNuevo('foto');
      const subir = (foto_base64) => request(app).post('/api/perfil/foto').set('Authorization', `Bearer ${est.token}`)
        .send({ foto_base64, tipo: 'perfil' });
      expect((await subir('hola"><script>alert(1)</script>')).status).toBe(400);
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      expect((await subir(png)).status).toBe(200);
    });

    test('la cédula del docente solo admite números y exige una materia', async () => {
      const tutor = await docenteNuevo('cedula', materia);
      const guardar = (datos) => request(app).post('/api/perfil/docente').set('Authorization', `Bearer ${tutor.token}`)
        .send({ cedula: '1023456999', facultad: 'Facultad de Ingenierías', asignaturas: [materia], ...datos });
      expect((await guardar({ cedula: 'CC 10234' })).status).toBe(400);
      expect((await guardar({ asignaturas: [] })).status).toBe(400);
      expect((await guardar({})).status).toBe(200);
    });
  });

  test('al cancelar, la otra parte recibe la notificación', async () => {
    const est = await estudianteNuevo('aviso');
    const { fecha, hora } = enColombia(40);
    const t = await db.pool.query(
      `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
       VALUES ($1,$2,$3,'Virtual',$4,$5,'pendiente') RETURNING id`, [est.id, docente, materia, fecha, hora]);
    const antes = await notificacionesDe(docente);
    const res = await request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${est.token}`);
    expect(res.status).toBe(200);
    expect(await notificacionesDe(docente)).toBe(antes + 1);
  });
});
