// Define el esquema de la base: tablas, índices, claves foráneas y restricciones de integridad.

// Crea las tablas que aún no existen.
async function crearTablas(c) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id         SERIAL PRIMARY KEY,
      nombres    TEXT NOT NULL,
      apellidos  TEXT NOT NULL,
      correo     TEXT UNIQUE NOT NULL,
      contrasena TEXT,
      rol        TEXT NOT NULL CHECK(rol IN ('estudiante','docente','admin')),
      google_id  TEXT,
      activo     INTEGER DEFAULT 1,
      creado_en  TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS perfiles_estudiante (
      id          SERIAL PRIMARY KEY,
      usuario_id  INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      codigo      TEXT,
      documento   TEXT,
      programa    TEXT,
      semestre    TEXT,
      telefono    TEXT,
      promedio    NUMERIC
    );

    CREATE TABLE IF NOT EXISTS perfiles_docente (
      id           SERIAL PRIMARY KEY,
      usuario_id   INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      cedula       TEXT,
      codigo_docente TEXT,
      facultad     TEXT,
      telefono     TEXT
    );

    CREATE TABLE IF NOT EXISTS perfiles_admin (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      cedula     TEXT,
      cargo      TEXT,
      dependencia TEXT,
      telefono   TEXT
    );

    CREATE TABLE IF NOT EXISTS fotos_usuario (
      id           SERIAL PRIMARY KEY,
      usuario_id   INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      foto_perfil  TEXT,
      foto_portada TEXT
    );

    CREATE TABLE IF NOT EXISTS asignaturas (
      id        SERIAL PRIMARY KEY,
      nombre    TEXT UNIQUE NOT NULL,
      area      TEXT DEFAULT 'General',
      programa  TEXT DEFAULT 'General',
      creada_en TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS docente_asignaturas (
      id             SERIAL PRIMARY KEY,
      docente_id     INTEGER NOT NULL REFERENCES perfiles_docente(id) ON DELETE CASCADE,
      asignatura_id  INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
      UNIQUE(docente_id, asignatura_id)
    );

    CREATE TABLE IF NOT EXISTS docente_programas (
      id         SERIAL PRIMARY KEY,
      docente_id INTEGER NOT NULL REFERENCES perfiles_docente(id) ON DELETE CASCADE,
      programa   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS docente_horarios (
      id         SERIAL PRIMARY KEY,
      docente_id INTEGER NOT NULL REFERENCES perfiles_docente(id) ON DELETE CASCADE,
      dia        TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      hora_fin   TEXT NOT NULL,
      lugar      TEXT DEFAULT 'Por definir'
    );

    CREATE TABLE IF NOT EXISTS tutorias (
      id           SERIAL PRIMARY KEY,
      estudiante_id INTEGER NOT NULL REFERENCES usuarios(id),
      docente_id    INTEGER NOT NULL REFERENCES usuarios(id),
      asignatura    TEXT NOT NULL,
      fecha         TEXT NOT NULL,
      hora          TEXT NOT NULL,
      modalidad     TEXT DEFAULT 'Virtual',
      estado        TEXT DEFAULT 'pendiente',
      observaciones TEXT,
      creada_en     TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      icono      TEXT DEFAULT '🔔',
      titulo     TEXT NOT NULL,
      descripcion TEXT,
      leida      INTEGER DEFAULT 0,
      creada_en  TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS asignaciones (
      id           SERIAL PRIMARY KEY,
      estudiante_id INTEGER NOT NULL REFERENCES usuarios(id),
      docente_id    INTEGER NOT NULL REFERENCES usuarios(id),
      estado        TEXT DEFAULT 'activa',
      creada_en     TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS periodos (
      id     SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      inicio TEXT,
      fin    TEXT,
      estado TEXT DEFAULT 'activo'
    );

    CREATE TABLE IF NOT EXISTS auditoria (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      evento     TEXT,
      detalle    TEXT,
      creada_en  TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS historial_notificaciones (
      id           SERIAL PRIMARY KEY,
      destinatario TEXT,
      tipo         TEXT,
      asunto       TEXT NOT NULL,
      mensaje      TEXT,
      cantidad     INTEGER DEFAULT 0,
      enviado_por  INTEGER REFERENCES usuarios(id),
      creada_en    TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    CREATE TABLE IF NOT EXISTS clases_admin (
      id              SERIAL PRIMARY KEY,
      docente_id      INTEGER NOT NULL REFERENCES usuarios(id),
      estudiante_id   INTEGER NOT NULL REFERENCES usuarios(id),
      asignatura      TEXT NOT NULL,
      fecha           TEXT NOT NULL,
      hora            TEXT NOT NULL,
      modalidad       TEXT DEFAULT 'Virtual',
      observaciones   TEXT,
      programado_por  INTEGER REFERENCES usuarios(id),
      creada_en       TEXT DEFAULT (to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS'))
    );

    -- Registra los intentos de login para el bloqueo por fuerza bruta.
    CREATE TABLE IF NOT EXISTS intentos_login (
      id        SERIAL PRIMARY KEY,
      correo    TEXT,
      ip        TEXT,
      exitoso   INTEGER DEFAULT 0,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// Crea los índices de las consultas frecuentes y de las claves foráneas que PostgreSQL no indexa solo.
async function crearIndices(c) {
  await c.query(`
    CREATE INDEX IF NOT EXISTS idx_intentos_busqueda     ON intentos_login (correo, ip, creado_en);
    CREATE INDEX IF NOT EXISTS idx_intentos_creado       ON intentos_login (creado_en);
    CREATE INDEX IF NOT EXISTS idx_usuarios_google       ON usuarios (google_id);
    CREATE INDEX IF NOT EXISTS idx_usuarios_rol_activo   ON usuarios (rol, activo);
    CREATE INDEX IF NOT EXISTS idx_auditoria_fecha       ON auditoria (creada_en DESC);
    CREATE INDEX IF NOT EXISTS idx_auditoria_usuario     ON auditoria (usuario_id);
    CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones (usuario_id, leida);
    CREATE INDEX IF NOT EXISTS idx_notificaciones_reciente ON notificaciones (usuario_id, creada_en DESC);
    CREATE INDEX IF NOT EXISTS idx_tutorias_estudiante   ON tutorias (estudiante_id, fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_tutorias_docente      ON tutorias (docente_id, fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_tutorias_fecha        ON tutorias (fecha);
    CREATE INDEX IF NOT EXISTS idx_asignaciones_estudiante ON asignaciones (estudiante_id);
    CREATE INDEX IF NOT EXISTS idx_asignaciones_docente  ON asignaciones (docente_id, estado);
    CREATE INDEX IF NOT EXISTS idx_clases_admin_docente  ON clases_admin (docente_id);
    CREATE INDEX IF NOT EXISTS idx_clases_admin_estudiante ON clases_admin (estudiante_id);
    CREATE INDEX IF NOT EXISTS idx_clases_admin_programador ON clases_admin (programado_por);
    CREATE INDEX IF NOT EXISTS idx_clases_admin_fecha    ON clases_admin (fecha DESC, hora DESC);
    CREATE INDEX IF NOT EXISTS idx_historial_notif_fecha ON historial_notificaciones (creada_en DESC);
    CREATE INDEX IF NOT EXISTS idx_historial_notif_envia ON historial_notificaciones (enviado_por);
    CREATE INDEX IF NOT EXISTS idx_docente_asignaturas_materia ON docente_asignaturas (asignatura_id);
    CREATE INDEX IF NOT EXISTS idx_docente_programas_docente ON docente_programas (docente_id);
    CREATE INDEX IF NOT EXISTS idx_docente_horarios_docente ON docente_horarios (docente_id);
    CREATE INDEX IF NOT EXISTS idx_perfiles_estudiante_documento ON perfiles_estudiante (documento);
    CREATE INDEX IF NOT EXISTS idx_perfiles_docente_cedula ON perfiles_docente (cedula);

    -- El índice de correo era un duplicado exacto del que crea UNIQUE(correo).
    DROP INDEX IF EXISTS idx_usuarios_correo;
  `);
}

// Ajusta columnas heredadas: sin promedio por defecto y con los campos de auditoría.
async function ajustarColumnas(c) {
  // Sin valor por defecto: un estudiante nuevo queda sin promedio y no en 0, que lo marcaba en alerta (DEF-14).
  await c.query('ALTER TABLE perfiles_estudiante ALTER COLUMN promedio DROP DEFAULT');

  // Auditoría: IP de origen y marca de archivado (los archivados salen del listado pero se conservan).
  await c.query(`
    ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip TEXT;
    ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS archivada INTEGER DEFAULT 0;
    UPDATE auditoria SET archivada = 0 WHERE archivada IS NULL;
  `);
}

// CASCADE en registros operativos y SET NULL en auditoría al borrar un usuario.
const CLAVES_FORANEAS = [
  ['tutorias',                  'estudiante_id',  'tutorias_estudiante_id_fkey',            'CASCADE'],
  ['tutorias',                  'docente_id',     'tutorias_docente_id_fkey',               'CASCADE'],
  ['asignaciones',              'estudiante_id',  'asignaciones_estudiante_id_fkey',        'CASCADE'],
  ['asignaciones',              'docente_id',     'asignaciones_docente_id_fkey',           'CASCADE'],
  ['clases_admin',              'docente_id',     'clases_admin_docente_id_fkey',           'CASCADE'],
  ['clases_admin',              'estudiante_id',  'clases_admin_estudiante_id_fkey',        'CASCADE'],
  ['auditoria',                 'usuario_id',     'auditoria_usuario_id_fkey',              'SET NULL'],
  ['historial_notificaciones',  'enviado_por',    'historial_notificaciones_enviado_por_fkey', 'SET NULL'],
  ['clases_admin',              'programado_por', 'clases_admin_programado_por_fkey',       'SET NULL']
];

// Ajusta cada clave foránea a su acción de borrado esperada (idempotente).
async function corregirClavesForaneas(c) {
  let corregidas = 0;

  for (const [tabla, columna, restriccion, accion] of CLAVES_FORANEAS) {
    const { rows } = await c.query(
      `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
      [restriccion]
    );

    const actual = rows[0]?.confdeltype;
    const esperado = accion === 'CASCADE' ? 'c' : 'n';
    if (actual === esperado) continue;

    if (accion === 'SET NULL') {
      await c.query(`ALTER TABLE ${tabla} ALTER COLUMN ${columna} DROP NOT NULL`)
        .catch(() => { /* ya la admitía */ });
    }

    await c.query(`ALTER TABLE ${tabla} DROP CONSTRAINT IF EXISTS ${restriccion}`);
    await c.query(
      `ALTER TABLE ${tabla}
         ADD CONSTRAINT ${restriccion}
         FOREIGN KEY (${columna}) REFERENCES usuarios(id) ON DELETE ${accion}`
    );
    corregidas++;
  }

  if (corregidas > 0) {
    console.log(`🔗 Claves foráneas corregidas: ${corregidas}`);
  }
}

// Índices únicos que impiden duplicados que antes solo evitaba el código de la aplicación.
const INDICES_UNICOS = [
  {
    nombre: 'uq_usuarios_correo_minuscula',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_correo_minuscula ON usuarios (lower(correo))',
    duplicados: 'SELECT lower(correo) AS clave FROM usuarios GROUP BY 1 HAVING COUNT(*) > 1',
    motivo: 'hay correos repetidos al ignorar mayúsculas'
  },
  {
    nombre: 'uq_usuarios_google_id',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_google_id ON usuarios (google_id) WHERE google_id IS NOT NULL',
    duplicados: 'SELECT google_id AS clave FROM usuarios WHERE google_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1',
    motivo: 'hay cuentas con el mismo identificador de Google'
  },
  {
    nombre: 'uq_tutorias_docente_horario',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_tutorias_docente_horario ON tutorias (docente_id, fecha, hora) WHERE estado <> 'cancelada'",
    duplicados: "SELECT docente_id AS clave FROM tutorias WHERE estado <> 'cancelada' GROUP BY docente_id, fecha, hora HAVING COUNT(*) > 1",
    motivo: 'hay docentes con dos tutorías a la misma fecha y hora'
  },
  {
    nombre: 'uq_tutorias_estudiante_horario',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_tutorias_estudiante_horario ON tutorias (estudiante_id, fecha, hora) WHERE estado <> 'cancelada'",
    duplicados: "SELECT estudiante_id AS clave FROM tutorias WHERE estado <> 'cancelada' GROUP BY estudiante_id, fecha, hora HAVING COUNT(*) > 1",
    motivo: 'hay estudiantes con dos tutorías a la misma fecha y hora'
  },
  {
    nombre: 'uq_asignaciones_activa',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_asignaciones_activa ON asignaciones (estudiante_id, docente_id) WHERE estado = 'activa'",
    duplicados: "SELECT estudiante_id AS clave FROM asignaciones WHERE estado = 'activa' GROUP BY estudiante_id, docente_id HAVING COUNT(*) > 1",
    motivo: 'hay asignaciones activas repetidas'
  },
  {
    nombre: 'uq_asignaturas_nombre_minuscula',
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS uq_asignaturas_nombre_minuscula ON asignaturas (lower(nombre))',
    duplicados: 'SELECT lower(nombre) AS clave FROM asignaturas GROUP BY 1 HAVING COUNT(*) > 1',
    motivo: 'hay asignaturas repetidas al ignorar mayúsculas'
  },
  {
    nombre: 'uq_perfiles_estudiante_documento',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_estudiante_documento ON perfiles_estudiante (documento) WHERE documento IS NOT NULL AND documento <> ''",
    duplicados: "SELECT documento AS clave FROM perfiles_estudiante WHERE documento IS NOT NULL AND documento <> '' GROUP BY documento HAVING COUNT(*) > 1",
    motivo: 'hay estudiantes con el mismo documento'
  },
  {
    nombre: 'uq_perfiles_docente_cedula',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_perfiles_docente_cedula ON perfiles_docente (cedula) WHERE cedula IS NOT NULL AND cedula <> ''",
    duplicados: "SELECT cedula AS clave FROM perfiles_docente WHERE cedula IS NOT NULL AND cedula <> '' GROUP BY cedula HAVING COUNT(*) > 1",
    motivo: 'hay docentes con la misma cédula'
  },
  {
    nombre: 'uq_periodos_un_activo',
    sql: "CREATE UNIQUE INDEX IF NOT EXISTS uq_periodos_un_activo ON periodos (estado) WHERE estado = 'activo'",
    duplicados: "SELECT estado AS clave FROM periodos WHERE estado = 'activo' GROUP BY estado HAVING COUNT(*) > 1",
    motivo: 'hay más de un período activo'
  }
];

const HORA_VALIDA = "~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'";
const FECHA_VALIDA = "~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'";

// Restricciones CHECK que fijan los valores que ya usa el código.
const RESTRICCIONES = [
  ['usuarios', 'usuarios_activo_check', 'activo IN (0, 1)'],
  ['tutorias', 'tutorias_estado_check', "estado IN ('pendiente', 'confirmada', 'completada', 'cancelada')"],
  ['tutorias', 'tutorias_modalidad_check', "modalidad IN ('Presencial', 'Virtual', 'Híbrida')"],
  ['tutorias', 'tutorias_fecha_check', `estado = 'cancelada' OR fecha ${FECHA_VALIDA}`],
  ['tutorias', 'tutorias_hora_check', `estado = 'cancelada' OR hora ${HORA_VALIDA}`],
  ['clases_admin', 'clases_admin_fecha_check', `fecha ${FECHA_VALIDA}`],
  ['clases_admin', 'clases_admin_hora_check', `hora ${HORA_VALIDA}`],
  ['asignaciones', 'asignaciones_estado_check', "estado IN ('activa', 'removida')"],
  ['periodos', 'periodos_estado_check', "estado IN ('activo', 'proximo', 'cerrado')"],
  ['notificaciones', 'notificaciones_leida_check', 'leida IN (0, 1)'],
  ['perfiles_estudiante', 'perfiles_estudiante_promedio_check', 'promedio >= 0 AND promedio <= 5']
];

// Crea un índice único solo si los datos actuales lo cumplen; si no, avisa y deja la base como estaba.
async function crearIndiceUnicoSeguro(c, indice) {
  const existe = await c.query('SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $1', [indice.nombre]);
  if (existe.rowCount) return 'existente';

  const { rows } = await c.query(indice.duplicados);
  if (rows.length) {
    console.warn(`⚠️  No se creó ${indice.nombre}: ${indice.motivo} (${rows.length} caso(s)). Corrígelos y reinicia.`);
    return 'omitido';
  }

  await c.query(indice.sql);
  return 'creado';
}

// Agrega una restricción CHECK solo si ninguna fila actual la incumple.
async function crearRestriccionSegura(c, [tabla, nombre, expresion]) {
  const existe = await c.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [nombre]);
  if (existe.rowCount) return 'existente';

  const { rows } = await c.query(`SELECT 1 FROM ${tabla} WHERE NOT (${expresion}) LIMIT 1`);
  if (rows.length) {
    console.warn(`⚠️  No se creó ${nombre}: hay filas en ${tabla} que no cumplen (${expresion}).`);
    return 'omitido';
  }

  await c.query(`ALTER TABLE ${tabla} ADD CONSTRAINT ${nombre} CHECK (${expresion})`);
  return 'creada';
}

// Aplica los índices únicos y las restricciones sin tocar datos; un fallo aquí avisa pero no impide arrancar.
async function endurecerEsquema(c) {
  const resultados = { creados: 0, omitidos: 0, fallidos: 0 };

  for (const indice of INDICES_UNICOS) {
    try {
      const r = await crearIndiceUnicoSeguro(c, indice);
      if (r === 'creado') resultados.creados++;
      if (r === 'omitido') resultados.omitidos++;
    } catch (err) {
      resultados.fallidos++;
      console.warn(`⚠️  No se pudo crear ${indice.nombre}: ${err.message}`);
    }
  }

  for (const restriccion of RESTRICCIONES) {
    try {
      const r = await crearRestriccionSegura(c, restriccion);
      if (r === 'creada') resultados.creados++;
      if (r === 'omitido') resultados.omitidos++;
    } catch (err) {
      resultados.fallidos++;
      console.warn(`⚠️  No se pudo crear ${restriccion[1]}: ${err.message}`);
    }
  }

  if (resultados.creados > 0) console.log(`🛡️  Restricciones de integridad creadas: ${resultados.creados}`);
  return resultados;
}

module.exports = {
  crearTablas, crearIndices, ajustarColumnas, corregirClavesForaneas, endurecerEsquema,
  CLAVES_FORANEAS, INDICES_UNICOS, RESTRICCIONES
};
