process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const request = require('supertest');
const app = require('../src/app');
const { db } = require('../src/config/db');
const { hoyColombia, sumarDias } = require('../src/config/fechas');
const { crearDocente, crearEstudiante, crearAdmin, franjaUnica, borrarUsuarios } = require('./ayudas');

// Pruebas de las reservas: sin cruces de horario aunque lleguen a la vez, con las reglas de fecha y de permisos.
describeSiHayBase('Reservas de tutorías', () => {
  const creados = [];
  let docente, estudiante, admin;

  const reservar = (usuario, datos) => request(app).post('/api/tutorias')
    .set('Authorization', `Bearer ${usuario.token}`).send(datos);
  const datosBase = (franja) => ({ docente_id: docente.id, asignatura: docente.materias[0], modalidad: 'Virtual', ...franja });

  beforeAll(async () => {
    docente = await crearDocente();
    estudiante = await crearEstudiante();
    admin = await crearAdmin();
    creados.push(docente.id, estudiante.id, admin.id);
  });

  afterAll(async () => {
    await borrarUsuarios(creados);
    await db.pool.end();
  });

  test('diez estudiantes piden a la vez el mismo horario del mismo docente: solo uno lo consigue', async () => {
    const estudiantes = await Promise.all(Array.from({ length: 10 }, () => crearEstudiante()));
    creados.push(...estudiantes.map(e => e.id));
    const franja = franjaUnica();

    const respuestas = await Promise.all(estudiantes.map(e => reservar(e, datosBase(franja))));
    const estados = respuestas.map(r => r.status).sort((x, y) => x - y);

    expect(estados.filter(s => s === 201)).toHaveLength(1);
    expect(estados.filter(s => s === 409)).toHaveLength(9);

    const guardadas = await db.pool.query(
      "SELECT COUNT(*) AS n FROM tutorias WHERE docente_id=$1 AND fecha=$2 AND hora=$3 AND estado<>'cancelada'",
      [docente.id, franja.fecha, franja.hora]);
    expect(Number(guardadas.rows[0].n)).toBe(1);
  });

  test('un mismo estudiante no consigue dos tutorías a la misma hora con dos docentes, ni siquiera a la vez', async () => {
    const otro = await crearDocente();
    creados.push(otro.id);
    const franja = franjaUnica();

    const [a, b] = await Promise.all([
      reservar(estudiante, datosBase(franja)),
      reservar(estudiante, { ...datosBase(franja), docente_id: otro.id, asignatura: otro.materias[0] })
    ]);

    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([201, 409]);
  });

  test('la hora con segundos choca con la misma hora sin segundos', async () => {
    const franja = franjaUnica();
    const otroEstudiante = await crearEstudiante();
    creados.push(otroEstudiante.id);

    const primera = await reservar(estudiante, datosBase(franja));
    expect(primera.status).toBe(201);

    const segunda = await reservar(otroEstudiante, datosBase({ fecha: franja.fecha, hora: `${franja.hora}:00` }));
    expect(segunda.status).toBe(409);

    const guardada = await db.pool.query('SELECT hora FROM tutorias WHERE id=$1', [primera.body.id]);
    expect(guardada.rows[0].hora).toBe(franja.hora);
  });

  test('una tutoría cancelada libera el horario', async () => {
    const franja = franjaUnica();
    const primera = await reservar(estudiante, datosBase(franja));
    expect(primera.status).toBe(201);
    await db.pool.query("UPDATE tutorias SET estado='cancelada' WHERE id=$1", [primera.body.id]);

    const otro = await crearEstudiante();
    creados.push(otro.id);
    expect((await reservar(otro, datosBase(franja))).status).toBe(201);
  });

  test('el administrador tampoco puede programar sobre un horario ocupado', async () => {
    const franja = franjaUnica();
    expect((await reservar(estudiante, datosBase(franja))).status).toBe(201);

    const otro = await crearEstudiante();
    creados.push(otro.id);
    const res = await request(app).post('/api/admin/programar-clase').set('Authorization', `Bearer ${admin.token}`)
      .send({ docente_id: docente.id, estudiante_id: otro.id, asignatura: docente.materias[0], modalidad: 'Virtual', ...franja });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/docente ya tiene/);
  });

  test('programar una asesoría del admin crea la tutoría, la asignación, el historial y las dos notificaciones juntas', async () => {
    const alumno = await crearEstudiante();
    creados.push(alumno.id);
    const franja = franjaUnica();

    const res = await request(app).post('/api/admin/programar-clase').set('Authorization', `Bearer ${admin.token}`)
      .send({ docente_id: docente.id, estudiante_id: alumno.id, asignatura: docente.materias[0], modalidad: 'Presencial', ...franja, hora: `${franja.hora}:00` });
    expect(res.status).toBe(200);

    const tutoria = await db.pool.query('SELECT estado, hora FROM tutorias WHERE id=$1', [res.body.tutoria_id]);
    expect(tutoria.rows[0]).toEqual({ estado: 'confirmada', hora: franja.hora });
    const asignacion = await db.pool.query("SELECT 1 FROM asignaciones WHERE estudiante_id=$1 AND docente_id=$2 AND estado='activa'", [alumno.id, docente.id]);
    expect(asignacion.rowCount).toBe(1);
    const historial = await db.pool.query('SELECT 1 FROM clases_admin WHERE estudiante_id=$1 AND docente_id=$2', [alumno.id, docente.id]);
    expect(historial.rowCount).toBe(1);
    const avisos = await db.pool.query('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ANY($1::int[])', [[alumno.id, docente.id]]);
    expect(Number(avisos.rows[0].n)).toBeGreaterThanOrEqual(2);
  });

  test('si falla un paso de la asesoría del admin no queda nada a medias', async () => {
    const alumno = await crearEstudiante();
    creados.push(alumno.id);
    const franja = franjaUnica();
    // Se bloquea la tabla de historial con una restricción temporal que obliga a fallar al insertar.
    await db.pool.query('ALTER TABLE clases_admin ADD CONSTRAINT prueba_falla CHECK (asignatura <> \'' + docente.materias[0].replace(/'/g, "''") + '\') NOT VALID');
    try {
      const res = await request(app).post('/api/admin/programar-clase').set('Authorization', `Bearer ${admin.token}`)
        .send({ docente_id: docente.id, estudiante_id: alumno.id, asignatura: docente.materias[0], modalidad: 'Virtual', ...franja });
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await db.pool.query('ALTER TABLE clases_admin DROP CONSTRAINT IF EXISTS prueba_falla');
    }

    const huerfana = await db.pool.query('SELECT 1 FROM tutorias WHERE estudiante_id=$1', [alumno.id]);
    expect(huerfana.rowCount).toBe(0);
    const asignacion = await db.pool.query('SELECT 1 FROM asignaciones WHERE estudiante_id=$1', [alumno.id]);
    expect(asignacion.rowCount).toBe(0);
  });

  describe('Reglas de fecha', () => {
    test('rechaza una fecha a más de dos años', async () => {
      const lejana = sumarDias(hoyColombia(), 800);
      const res = await reservar(estudiante, datosBase({ fecha: lejana, hora: '10:00' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dos años/);
    });

    test('acepta una fecha dentro del límite', async () => {
      const res = await reservar(estudiante, datosBase({ fecha: sumarDias(hoyColombia(), 700), hora: '07:07' }));
      expect(res.status).toBe(201);
    });

    test.each([
      ['docente_id', 'no-es-un-numero'],
      ['docente_id', -5],
      ['docente_id', 1.5],
      ['asignatura', { x: 1 }],
      ['observaciones', 12345]
    ])('rechaza %s con valor raro (%p) sin devolver 500', async (campo, valor) => {
      const res = await reservar(estudiante, { ...datosBase(franjaUnica()), [campo]: valor });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe('Cancelación y cierre', () => {
    test('cancelar dos veces a la vez avisa una sola vez a la otra parte', async () => {
      const t = await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,$3,'Virtual',$4,'09:15','pendiente') RETURNING id`,
        [estudiante.id, docente.id, docente.materias[0], sumarDias(hoyColombia(), 30)]);
      const antes = Number((await db.pool.query('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=$1', [docente.id])).rows[0].n);

      const [a, b] = await Promise.all([
        request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${estudiante.token}`),
        request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${estudiante.token}`)
      ]);
      expect([a.status, b.status].filter(s => s === 200)).toHaveLength(1);
      const despues = Number((await db.pool.query('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id=$1', [docente.id])).rows[0].n);
      expect(despues - antes).toBe(1);
    });

    test('una tutoría completada ya no se puede cancelar', async () => {
      const t = await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,$3,'Virtual',$4,'09:30','completada') RETURNING id`,
        [estudiante.id, docente.id, docente.materias[0], sumarDias(hoyColombia(), 40)]);
      const res = await request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${estudiante.token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/completada/);
    });

    test('un tercero no puede cancelar ni cerrar una tutoría ajena', async () => {
      const intruso = await crearEstudiante();
      creados.push(intruso.id);
      const t = await db.pool.query(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, estado)
         VALUES ($1,$2,$3,'Virtual',$4,'09:45','pendiente') RETURNING id`,
        [estudiante.id, docente.id, docente.materias[0], sumarDias(hoyColombia(), 31)]);
      const cancelar = await request(app).patch(`/api/tutorias/${t.rows[0].id}/cancelar`).set('Authorization', `Bearer ${intruso.token}`);
      expect(cancelar.status).toBe(403);
      const cerrar = await request(app).patch(`/api/tutorias/${t.rows[0].id}/realizada`).set('Authorization', `Bearer ${intruso.token}`);
      expect(cerrar.status).toBe(403);
    });
  });

  describe('Búsqueda de estudiantes', () => {
    test('un estudiante no puede buscar a otros estudiantes (datos personales)', async () => {
      const res = await request(app).get('/api/tutorias/buscar-estudiante?q=Prueba').set('Authorization', `Bearer ${estudiante.token}`);
      expect(res.status).toBe(403);
    });

    test('el docente y el admin sí pueden, y los comodines se tratan como texto', async () => {
      const comodin = await request(app).get('/api/tutorias/buscar-estudiante?q=%25%25').set('Authorization', `Bearer ${docente.token}`);
      expect(comodin.status).toBe(200);
      expect(comodin.body).toEqual([]);
      const normal = await request(app).get('/api/tutorias/buscar-estudiante?q=Prueba').set('Authorization', `Bearer ${admin.token}`);
      expect(normal.status).toBe(200);
      expect(normal.body.length).toBeGreaterThan(0);
    });
  });
});
