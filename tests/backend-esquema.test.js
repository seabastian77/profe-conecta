process.env.NODE_ENV = 'test';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const { Client, Pool } = require('pg');

// Importar este módulo basta para que las pruebas se nieguen a correr contra la base de Railway.
require('./basesTemporales');

const { migrar } = require('../src/config/migrate');
const {
  crearTablas, crearIndices, ajustarColumnas, corregirClavesForaneas, endurecerEsquema, INDICES_UNICOS, RESTRICCIONES
} = require('../src/config/esquema');

// Cambia el nombre de la base en la URL de conexión.
function urlDeBase(nombre) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/' + nombre;
  return url.toString();
}

// Pruebas del esquema sobre una base temporal que se crea y se borra sola, para no tocar los datos de nadie.
describeSiHayBase('Esquema de la base de datos (base temporal aislada)', () => {
  const nombreBase = `cp_aislada_${process.pid}_${Date.now()}`;
  let admin, c;

  // Aplica el esquema completo, igual que lo hace la migración al arrancar el servidor.
  async function aplicarEsquema(cliente) {
    await crearTablas(cliente);
    await crearIndices(cliente);
    await ajustarColumnas(cliente);
    await corregirClavesForaneas(cliente);
    return endurecerEsquema(cliente);
  }

  // Devuelve el código y el nombre de la restricción con que PostgreSQL rechazó la consulta, o null si la aceptó.
  async function rechazo(sql, params = []) {
    try {
      await c.query(sql, params);
      return null;
    } catch (err) {
      return { codigo: err.code, restriccion: err.constraint };
    }
  }

  const usuario = async (correo, rol = 'estudiante') => (await c.query(
    "INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('Ana','Ruiz',$1,$2) RETURNING id", [correo, rol])).rows[0].id;

  const tutoria = (est, doc, fecha, hora, estado = 'pendiente') => c.query(
    `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado, modalidad)
     VALUES ($1,$2,'Cálculo',$3,$4,$5,'Virtual') RETURNING id`, [est, doc, fecha, hora, estado]);

  beforeAll(async () => {
    admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${nombreBase}`);
    c = new Client({ connectionString: urlDeBase(nombreBase) });
    await c.connect();
  });

  afterAll(async () => {
    if (c) await c.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${nombreBase} WITH (FORCE)`);
      await admin.end();
    }
  });

  test('en una base nueva crea todos los índices únicos y las restricciones, y no falla ninguno', async () => {
    const resultado = await aplicarEsquema(c);
    expect(resultado).toEqual({ creados: INDICES_UNICOS.length + RESTRICCIONES.length, omitidos: 0, fallidos: 0 });
  });

  test('repetir la migración no cambia nada ni da error', async () => {
    const resultado = await aplicarEsquema(c);
    expect(resultado).toEqual({ creados: 0, omitidos: 0, fallidos: 0 });
  });

  describe('Integridad que ahora garantiza la base', () => {
    test('no admite el mismo correo con otras mayúsculas', async () => {
      await usuario('Mayus@amigo.edu.co');
      expect(await rechazo("INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('X','Y','MAYUS@amigo.edu.co','estudiante')"))
        .toEqual({ codigo: '23505', restriccion: 'uq_usuarios_correo_minuscula' });
    });

    test('no admite dos tutorías vigentes del mismo docente o del mismo estudiante a la misma hora', async () => {
      const [docente, otroDocente, est, otroEst] = [
        await usuario('d1@amigo.edu.co', 'docente'), await usuario('d2@amigo.edu.co', 'docente'),
        await usuario('e1@amigo.edu.co'), await usuario('e2@amigo.edu.co')
      ];
      const primera = await tutoria(est, docente, '2027-05-10', '09:00');

      expect(await rechazo(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','2027-05-10','09:00')", [otroEst, docente]))
        .toMatchObject({ codigo: '23505', restriccion: 'uq_tutorias_docente_horario' });
      expect(await rechazo(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','2027-05-10','09:00')", [est, otroDocente]))
        .toMatchObject({ codigo: '23505', restriccion: 'uq_tutorias_estudiante_horario' });

      await c.query("UPDATE tutorias SET estado='cancelada' WHERE id=$1", [primera.rows[0].id]);
      expect(await rechazo(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','2027-05-10','09:00')", [otroEst, docente])).toBeNull();
    });

    test('no admite estados, modalidades, fechas ni horas inventadas', async () => {
      const docente = await usuario('d3@amigo.edu.co', 'docente');
      const est = await usuario('e3@amigo.edu.co');
      const insertar = (campo, valor) => rechazo(
        `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, ${campo}) VALUES ($1,$2,'X','2027-06-01','10:00',$3)`,
        [est, docente, valor]);

      expect(await insertar('estado', 'inventado')).toMatchObject({ codigo: '23514', restriccion: 'tutorias_estado_check' });
      expect(await insertar('modalidad', 'Teletransporte')).toMatchObject({ codigo: '23514', restriccion: 'tutorias_modalidad_check' });
      expect(await rechazo(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','mañana','10:00')", [est, docente]))
        .toMatchObject({ codigo: '23514', restriccion: 'tutorias_fecha_check' });
      expect(await rechazo(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','2027-06-01','25:99')", [est, docente]))
        .toMatchObject({ codigo: '23514', restriccion: 'tutorias_hora_check' });
    });

    test('no admite dos asignaciones activas iguales, pero sí una removida y otra activa', async () => {
      const docente = await usuario('d4@amigo.edu.co', 'docente');
      const est = await usuario('e4@amigo.edu.co');
      const insertar = (estado) => rechazo("INSERT INTO asignaciones (estudiante_id, docente_id, estado) VALUES ($1,$2,$3)", [est, docente, estado]);
      expect(await insertar('activa')).toBeNull();
      expect(await insertar('activa')).toMatchObject({ codigo: '23505', restriccion: 'uq_asignaciones_activa' });
      expect(await insertar('removida')).toBeNull();
      expect(await insertar('otra')).toMatchObject({ codigo: '23514' });
    });

    test('no admite dos períodos activos', async () => {
      expect(await rechazo("INSERT INTO periodos (nombre, estado) VALUES ('P1','activo')")).toBeNull();
      expect(await rechazo("INSERT INTO periodos (nombre, estado) VALUES ('P2','activo')")).toMatchObject({ codigo: '23505', restriccion: 'uq_periodos_un_activo' });
      expect(await rechazo("INSERT INTO periodos (nombre, estado) VALUES ('P3','proximo')")).toBeNull();
    });

    test('no admite promedios fuera de 0 a 5, ni activo distinto de 0 o 1, ni notificaciones con leída inválida', async () => {
      const est = await usuario('e5@amigo.edu.co');
      expect(await rechazo('INSERT INTO perfiles_estudiante (usuario_id, promedio) VALUES ($1, 7)', [est]))
        .toMatchObject({ codigo: '23514', restriccion: 'perfiles_estudiante_promedio_check' });
      expect(await rechazo('UPDATE usuarios SET activo = 5 WHERE id = $1', [est]))
        .toMatchObject({ codigo: '23514', restriccion: 'usuarios_activo_check' });
      expect(await rechazo("INSERT INTO notificaciones (usuario_id, titulo, leida) VALUES ($1,'x',3)", [est]))
        .toMatchObject({ codigo: '23514', restriccion: 'notificaciones_leida_check' });
    });

    test('no admite documentos, cédulas ni materias repetidas, pero sí varios perfiles sin documento', async () => {
      const [a, b, c1, d] = [await usuario('p1@amigo.edu.co'), await usuario('p2@amigo.edu.co'), await usuario('p3@amigo.edu.co'), await usuario('p4@amigo.edu.co', 'docente')];
      expect(await rechazo("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'1234567890')", [a])).toBeNull();
      expect(await rechazo("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'1234567890')", [b]))
        .toMatchObject({ codigo: '23505', restriccion: 'uq_perfiles_estudiante_documento' });
      expect(await rechazo("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'')", [b])).toBeNull();
      expect(await rechazo("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'')", [c1])).toBeNull();

      const e = await usuario('p5@amigo.edu.co', 'docente');
      expect(await rechazo("INSERT INTO perfiles_docente (usuario_id, cedula) VALUES ($1,'999888777')", [d])).toBeNull();
      expect(await rechazo("INSERT INTO perfiles_docente (usuario_id, cedula) VALUES ($1,'999888777')", [e]))
        .toMatchObject({ codigo: '23505', restriccion: 'uq_perfiles_docente_cedula' });

      expect(await rechazo("INSERT INTO asignaturas (nombre) VALUES ('Cálculo I')")).toBeNull();
      expect(await rechazo("INSERT INTO asignaturas (nombre) VALUES ('CÁLCULO I')"))
        .toMatchObject({ codigo: '23505', restriccion: 'uq_asignaturas_nombre_minuscula' });
    });
  });

  describe('Borrado de usuarios', () => {
    test('borra en cascada lo operativo y conserva la auditoría, el historial y las clases sin usuario', async () => {
      const admin1 = await usuario('adm1@amigo.edu.co', 'admin');
      const docente = await usuario('d9@amigo.edu.co', 'docente');
      const est = await usuario('e9@amigo.edu.co');
      await tutoria(est, docente, '2027-07-01', '08:00');
      await c.query('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES ($1,$2)', [est, docente]);
      await c.query("INSERT INTO notificaciones (usuario_id, titulo) VALUES ($1,'hola')", [est]);
      await c.query("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'5550001')", [est]);
      await c.query("INSERT INTO fotos_usuario (usuario_id, foto_perfil) VALUES ($1,'x')", [est]);
      const evento = await c.query("INSERT INTO auditoria (usuario_id, evento) VALUES ($1,'LOGIN') RETURNING id", [est]);
      await c.query(
        "INSERT INTO clases_admin (docente_id, estudiante_id, asignatura, fecha, hora, programado_por) VALUES ($1,$2,'X','2027-07-02','09:00',$3)",
        [docente, est, admin1]);
      const historial = await c.query(
        "INSERT INTO historial_notificaciones (asunto, enviado_por) VALUES ('a',$1) RETURNING id", [admin1]);

      await c.query('DELETE FROM usuarios WHERE id = $1', [est]);
      for (const [tabla, columna] of [['tutorias', 'estudiante_id'], ['asignaciones', 'estudiante_id'], ['notificaciones', 'usuario_id'],
        ['perfiles_estudiante', 'usuario_id'], ['fotos_usuario', 'usuario_id'], ['clases_admin', 'estudiante_id']]) {
        expect((await c.query(`SELECT 1 FROM ${tabla} WHERE ${columna} = $1`, [est])).rowCount).toBe(0);
      }
      const auditoria = await c.query('SELECT usuario_id FROM auditoria WHERE id = $1', [evento.rows[0].id]);
      expect(auditoria.rows).toEqual([{ usuario_id: null }]);

      await c.query('DELETE FROM usuarios WHERE id = $1', [admin1]);
      expect((await c.query('SELECT enviado_por FROM historial_notificaciones WHERE id = $1', [historial.rows[0].id])).rows).toEqual([{ enviado_por: null }]);
    });
  });

  describe('Migración sobre datos que ya tienen problemas', () => {
    const nombreSucia = `${nombreBase}_sucia`;
    let sucia;

    beforeAll(async () => {
      await admin.query(`CREATE DATABASE ${nombreSucia}`);
      sucia = new Client({ connectionString: urlDeBase(nombreSucia) });
      await sucia.connect();
      await crearTablas(sucia);
      await crearIndices(sucia);
      await ajustarColumnas(sucia);
    });

    afterAll(async () => {
      if (sucia) await sucia.end();
      await admin.query(`DROP DATABASE IF EXISTS ${nombreSucia} WITH (FORCE)`);
    });

    const contar = async () => {
      const filas = {};
      for (const tabla of ['usuarios', 'tutorias', 'perfiles_estudiante', 'asignaciones']) {
        filas[tabla] = Number((await sucia.query(`SELECT COUNT(*) AS n FROM ${tabla}`)).rows[0].n);
      }
      return filas;
    };

    test('avisa de los duplicados, no toca ni borra ningún dato y no impide arrancar', async () => {
      const u = async (correo, rol = 'estudiante') => (await sucia.query(
        "INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('A','B',$1,$2) RETURNING id", [correo, rol])).rows[0].id;
      const docente = await u('doc@amigo.edu.co', 'docente');
      const e1 = await u('e1@amigo.edu.co');
      const e2 = await u('e2@amigo.edu.co');
      const insertarTutoria = (est) => sucia.query(
        "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'X','2027-01-01','10:00','pendiente')", [est, docente]);
      await insertarTutoria(e1);
      await insertarTutoria(e2);
      await sucia.query("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'777'),($2,'777')", [e1, e2]);
      await sucia.query("INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'X','mañana','99:99','pendiente')", [e1, docente]);

      const antes = await contar();
      const espia = jest.spyOn(console, 'warn').mockImplementation(() => {});
      let resultado, avisos;
      try {
        await corregirClavesForaneas(sucia);
        resultado = await endurecerEsquema(sucia);
        avisos = espia.mock.calls.map(args => args.join(' '));
      } finally {
        espia.mockRestore();
      }

      expect(await contar()).toEqual(antes);
      expect(resultado.fallidos).toBe(0);
      expect(resultado.omitidos).toBeGreaterThanOrEqual(3);
      expect(avisos.join('\n')).toMatch(/uq_tutorias_docente_horario/);
      expect(avisos.join('\n')).toMatch(/uq_perfiles_estudiante_documento/);
      expect(avisos.join('\n')).toMatch(/tutorias_fecha_check/);

      // Lo que sí estaba limpio quedó protegido.
      const indices = (await sucia.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_%'")).rows.map(f => f.indexname);
      expect(indices).toContain('uq_usuarios_correo_minuscula');
      expect(indices).not.toContain('uq_tutorias_docente_horario');
    });

    test('al corregir los datos, la siguiente migración completa lo que faltaba', async () => {
      await sucia.query("DELETE FROM tutorias WHERE fecha = 'mañana'");
      await sucia.query("UPDATE tutorias SET estado='cancelada' WHERE estudiante_id = (SELECT id FROM usuarios WHERE correo='e2@amigo.edu.co')");
      await sucia.query("UPDATE perfiles_estudiante SET documento='778' WHERE usuario_id = (SELECT id FROM usuarios WHERE correo='e2@amigo.edu.co')");
      const antes = await contar();

      const resultado = await endurecerEsquema(sucia);
      expect(resultado.fallidos).toBe(0);
      expect(resultado.omitidos).toBe(0);
      expect(resultado.creados).toBeGreaterThanOrEqual(3);
      expect((await contar()).usuarios).toBe(antes.usuarios);
    });
  });

  describe('Arranque simultáneo de varias instancias', () => {
    test('ocho migraciones a la vez terminan sin error y dejan los datos base una sola vez', async () => {
      const nombreConcurrente = `${nombreBase}_conc`;
      await admin.query(`CREATE DATABASE ${nombreConcurrente}`);
      const pool = new Pool({ connectionString: urlDeBase(nombreConcurrente), max: 8 });
      pool.on('error', () => {});
      const silencios = [jest.spyOn(console, 'log').mockImplementation(() => {}), jest.spyOn(console, 'warn').mockImplementation(() => {})];
      try {
        const resultados = await Promise.allSettled(Array.from({ length: 8 }, () => migrar(pool)));
        expect(resultados.filter(r => r.status === 'rejected').map(r => r.reason.message)).toEqual([]);

        const cuenta = async (sql) => Number((await pool.query(sql)).rows[0].n);
        expect(await cuenta('SELECT COUNT(*) AS n FROM periodos')).toBe(1);
        expect(await cuenta('SELECT COUNT(*) AS n FROM configuracion')).toBe(4);
        expect(await cuenta('SELECT COUNT(*) AS n FROM (SELECT lower(correo) FROM usuarios GROUP BY 1 HAVING COUNT(*) > 1) d')).toBe(0);
        expect(await cuenta('SELECT COUNT(*) AS n FROM asignaturas')).toBeGreaterThan(40);

        // El bloqueo de la migración quedó liberado en todas las conexiones.
        expect(await cuenta('SELECT COUNT(*) AS n FROM pg_locks WHERE locktype = \'advisory\' AND classid = 7000')).toBe(0);
      } finally {
        silencios.forEach(s => s.mockRestore());
        await pool.end();
        await admin.query(`DROP DATABASE IF EXISTS ${nombreConcurrente} WITH (FORCE)`);
      }
    });
  });

  describe('Claves foráneas de una base heredada', () => {
    test('antes de corregirlas no se podía borrar un usuario con tutorías; después sí, y en cascada', async () => {
      const nombreVieja = `${nombreBase}_vieja`;
      await admin.query(`CREATE DATABASE ${nombreVieja}`);
      const vieja = new Client({ connectionString: urlDeBase(nombreVieja) });
      await vieja.connect();
      try {
        await crearTablas(vieja);
        const doc = (await vieja.query("INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('D','D','d@amigo.edu.co','docente') RETURNING id")).rows[0].id;
        const est = (await vieja.query("INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('E','E','e@amigo.edu.co','estudiante') RETURNING id")).rows[0].id;
        await vieja.query("INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora) VALUES ($1,$2,'X','2027-01-01','10:00')", [est, doc]);
        await vieja.query("INSERT INTO auditoria (usuario_id, evento) VALUES ($1,'LOGIN')", [est]);

        await expect(vieja.query('DELETE FROM usuarios WHERE id = $1', [est])).rejects.toMatchObject({ code: '23503' });

        await corregirClavesForaneas(vieja);
        await vieja.query('DELETE FROM usuarios WHERE id = $1', [est]);
        expect((await vieja.query('SELECT 1 FROM tutorias')).rowCount).toBe(0);
        expect((await vieja.query('SELECT usuario_id FROM auditoria')).rows).toEqual([{ usuario_id: null }]);
      } finally {
        await vieja.end();
        await admin.query(`DROP DATABASE IF EXISTS ${nombreVieja} WITH (FORCE)`);
      }
    });
  });
});
