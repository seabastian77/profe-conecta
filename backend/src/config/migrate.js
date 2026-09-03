const { db } = require('./db');
const { RONDAS_BCRYPT } = require('./seguridad');


// Los correos del seed venían quemados con @funlam.edu.co y @est.funlam.edu.co,
// pero la aplicación solo acepta el dominio de DOMINIO_CORREO (@amigo.edu.co).
// Resultado: los 20 usuarios de ejemplo existían en la base pero NINGUNO podía
// iniciar sesión desde la interfaz, porque el formulario rechazaba su correo.
// Aquí se les reescribe el dominio al que la aplicación realmente admite.
const DOMINIO_INSTITUCIONAL = process.env.DOMINIO_CORREO || '@amigo.edu.co';

function correoInstitucional(correo) {
  return correo.split('@')[0].toLowerCase() + DOMINIO_INSTITUCIONAL;
}

async function migrar() {
  const c = db.pool; // acceso directo al pool para exec multi-statement

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
      promedio    NUMERIC DEFAULT 0
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

    -- Intentos de inicio de sesión: soporta el bloqueo por fuerza bruta.
    -- creado_en es TIMESTAMPTZ (no TEXT) porque se consulta con
    -- "NOW() - INTERVAL '5 minutes'" y comparar texto no serviría.
    CREATE TABLE IF NOT EXISTS intentos_login (
      id        SERIAL PRIMARY KEY,
      correo    TEXT,
      ip        TEXT,
      exitoso   INTEGER DEFAULT 0,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── Índices ───────────────────────────────────────────
  // Sin estos, cada login recorre la tabla entera de intentos y cada
  // consulta por correo hace un escaneo secuencial de usuarios.
  await c.query(`
    CREATE INDEX IF NOT EXISTS idx_intentos_busqueda
      ON intentos_login (correo, ip, creado_en);
    CREATE INDEX IF NOT EXISTS idx_usuarios_correo
      ON usuarios (correo);
    CREATE INDEX IF NOT EXISTS idx_usuarios_google
      ON usuarios (google_id);
    CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
      ON auditoria (creada_en DESC);
    CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
      ON notificaciones (usuario_id, leida);
  `);

  // Purga de intentos viejos para que la tabla no crezca sin control.
  await c.query(`DELETE FROM intentos_login WHERE creado_en < NOW() - INTERVAL '1 day'`);

  await corregirClavesForaneas(c);
  await sembrarAdminInicial(c);

  // Datos base
  await c.query(`
    INSERT INTO periodos (id, nombre, inicio, fin, estado)
    VALUES (1, '2026-1', '2026-02-03', '2026-06-15', 'activo')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO configuracion (clave, valor) VALUES
      ('RN_PROMEDIO_MINIMO','3.0'),('RN_HORAS_CANCELACION','24'),('RN_MAX_ESTUDIANTES','15')
    ON CONFLICT (clave) DO NOTHING;
  `);

  await sembrarAsignaturas(c);
  await sembrarUsuarios(c);

  console.log('✅ Tablas PostgreSQL creadas/verificadas');
}

async function sembrarAsignaturas(c) {
  const datos = [
    ['Programación I','Ingenierías y Arquitectura','Sistemas'],
    ['Programación II','Ingenierías y Arquitectura','Sistemas'],
    ['Programación III','Ingenierías y Arquitectura','Sistemas'],
    ['Estructuras de Datos','Ingenierías y Arquitectura','Sistemas'],
    ['Análisis y Diseño de Sistemas','Ingenierías y Arquitectura','Sistemas'],
    ['Bases de Datos','Ingenierías y Arquitectura','Sistemas'],
    ['Ingeniería de Software','Ingenierías y Arquitectura','Sistemas'],
    ['Inteligencia Artificial','Ingenierías y Arquitectura','Sistemas'],
    ['Redes de Datos','Ingenierías y Arquitectura','Sistemas'],
    ['Gestión de Operaciones','Ingenierías y Arquitectura','Industrial'],
    ['Investigación de Operaciones','Ingenierías y Arquitectura','Industrial'],
    ['Topografía','Ingenierías y Arquitectura','Civil'],
    ['Hidráulica','Ingenierías y Arquitectura','Civil'],
    ['Análisis Estructural','Ingenierías y Arquitectura','Civil'],
    ['Taller de Diseño I','Ingenierías y Arquitectura','Arquitectura'],
    ['Taller de Diseño II','Ingenierías y Arquitectura','Arquitectura'],
    ['Introducción a la Psicología','Ciencias Sociales, Salud y Bienestar','Psicología'],
    ['Neuropsicología','Ciencias Sociales, Salud y Bienestar','Psicología'],
    ['Psicopatología','Ciencias Sociales, Salud y Bienestar','Psicología'],
    ['Fundamentos de Trabajo Social','Ciencias Sociales, Salud y Bienestar','Trabajo Social'],
    ['Derecho Civil - Personas','Derecho y Ciencias Políticas','Derecho'],
    ['Derecho Penal','Derecho y Ciencias Políticas','Derecho'],
    ['Derecho Constitucional','Derecho y Ciencias Políticas','Derecho'],
    ['Derecho Laboral','Derecho y Ciencias Políticas','Derecho'],
    ['Fundamentos de Mercadeo','Ciencias Administrativas, Económicas y Contables','Administración y Negocios'],
    ['Gerencia Estratégica','Ciencias Administrativas, Económicas y Contables','Administración y Negocios'],
    ['Contabilidad Financiera','Ciencias Administrativas, Económicas y Contables','Contaduría'],
    ['Tributaria - Impuestos','Ciencias Administrativas, Económicas y Contables','Contaduría'],
    ['Redacción Periodística','Comunicación, Publicidad y Diseño','Comunicación Social'],
    ['Producción Audiovisual','Comunicación, Publicidad y Diseño','Comunicación Social'],
    ['Tipografía','Comunicación, Publicidad y Diseño','Diseño Gráfico'],
    ['Identidad Visual - Branding','Comunicación, Publicidad y Diseño','Diseño Gráfico'],
    ['Pedagogía','Educación y Humanidades','Licenciaturas'],
    ['Didáctica General','Educación y Humanidades','Licenciaturas'],
    ['Cálculo Diferencial','Ciencias Básicas','Matemáticas'],
    ['Cálculo Integral','Ciencias Básicas','Matemáticas'],
    ['Álgebra Lineal','Ciencias Básicas','Matemáticas'],
    ['Estadística Descriptiva','Ciencias Básicas','Matemáticas'],
    ['Física Mecánica','Ciencias Básicas','Matemáticas'],
    ['Metodología de la Investigación','Ciencias Básicas','Investigación'],
    ['Inglés I','Institucional','Inglés'],
    ['Inglés II','Institucional','Inglés'],
    ['Inglés III','Institucional','Inglés'],
    ['Inglés IV','Institucional','Inglés'],
    ['Ética y Axiología','Institucional','Obligatorias'],
    ['Desarrollo Humano','Institucional','Obligatorias'],
  ];
  for (const [nombre, area, programa] of datos) {
    await c.query(
      `INSERT INTO asignaturas (nombre, area, programa) VALUES ($1,$2,$3) ON CONFLICT (nombre) DO NOTHING`,
      [nombre, area, programa]
    );
  }
}

async function sembrarUsuarios(c) {
  const { rows } = await c.query(`SELECT COUNT(*) AS cnt FROM usuarios WHERE rol != 'admin'`);
  if (parseInt(rows[0].cnt) > 0) return;

  const bcrypt = require('bcrypt');
  // 10 rondas y no RONDAS_BCRYPT a propósito: son 20 usuarios de ejemplo con
  // una contraseña pública ('123456'), y hashear 20 veces con 12 rondas alarga
  // el arranque sin proteger nada. Estos usuarios deben borrarse antes de
  // cualquier uso real; no son cuentas que valga la pena endurecer.
  const hash = await bcrypt.hash('123456', 10);
  const ahora = new Date().toISOString();

  const docentes = [
    { nombres:'María',    apellidos:'González Ramos',  correo:'mgonzalez@funlam.edu.co',  cedula:'1023456001', facultad:'Facultad de Ingenierías',     asigs:['Programación I','Programación II','Estructuras de Datos'] },
    { nombres:'Carlos',   apellidos:'Peña Ochoa',       correo:'cpena@funlam.edu.co',       cedula:'1023456002', facultad:'Facultad de Ciencias Sociales', asigs:['Introducción a la Psicología'] },
    { nombres:'Diego',    apellidos:'Herrera Zapata',   correo:'dherrera@funlam.edu.co',    cedula:'1023456003', facultad:'Facultad de Ingenierías',     asigs:['Bases de Datos','Ingeniería de Software'] },
    { nombres:'Juan',     apellidos:'Salazar Bedoya',   correo:'jsalazar@funlam.edu.co',    cedula:'1023456004', facultad:'Ciencias Básicas (Transversal)', asigs:['Cálculo Diferencial','Álgebra Lineal'] },
    { nombres:'Laura',    apellidos:'Vargas Suárez',    correo:'lvargas@funlam.edu.co',     cedula:'1023456005', facultad:'Facultad de Comunicación',    asigs:['Redacción Periodística','Producción Audiovisual'] },
    { nombres:'Paola',    apellidos:'Martínez Cruz',    correo:'pmartinez@funlam.edu.co',   cedula:'1023456006', facultad:'Facultad de Educación',       asigs:['Pedagogía','Didáctica General'] },
    { nombres:'Andrés',   apellidos:'López Castillo',   correo:'alopez@funlam.edu.co',      cedula:'1023456007', facultad:'Facultad de Ciencias Administrativas', asigs:['Fundamentos de Mercadeo'] },
    { nombres:'Sandra',   apellidos:'Ríos Montoya',     correo:'srios@funlam.edu.co',       cedula:'1023456008', facultad:'Facultad de Derecho',         asigs:['Derecho Civil - Personas','Derecho Penal'] },
    { nombres:'Felipe',   apellidos:'Giraldo Reyes',    correo:'fgiraldo@funlam.edu.co',    cedula:'1023456009', facultad:'Facultad de Ingenierías',     asigs:['Inteligencia Artificial'] },
    { nombres:'Mónica',   apellidos:'Torres Valencia',  correo:'mtorres@funlam.edu.co',     cedula:'1023456010', facultad:'Facultad de Ciencias Administrativas', asigs:['Contabilidad Financiera'] },
  ];

  for (const d of docentes) {
    const r = await c.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo, creado_en) VALUES ($1,$2,$3,$4,'docente',1,$5) ON CONFLICT (correo) DO NOTHING RETURNING id`,
      [d.nombres, d.apellidos, correoInstitucional(d.correo), hash, ahora]
    );
    if (!r.rows[0]) continue;
    const uid = r.rows[0].id;
    const pd = await c.query(
      `INSERT INTO perfiles_docente (usuario_id, cedula, codigo_docente, facultad, telefono) VALUES ($1,$2,$2,$3,$4) RETURNING id`,
      [uid, d.cedula, d.facultad, '3001234567']
    );
    const pdId = pd.rows[0].id;
    for (const nombre of d.asigs) {
      const aq = await c.query(`SELECT id FROM asignaturas WHERE nombre=$1`, [nombre]);
      if (aq.rows[0]) {
        await c.query(`INSERT INTO docente_asignaturas (docente_id, asignatura_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [pdId, aq.rows[0].id]);
      }
    }
  }

  const estudiantes = [
    { nombres:'Sebastián', apellidos:'García Torres',   correo:'sgarcia@est.funlam.edu.co',   doc:'1098765001', programa:'Sistemas',                semestre:'4', promedio:3.8 },
    { nombres:'Valentina', apellidos:'Osorio Mejía',    correo:'vosorio@est.funlam.edu.co',    doc:'1098765002', programa:'Psicología',              semestre:'3', promedio:2.7 },
    { nombres:'Camilo',    apellidos:'Ríos Zapata',     correo:'crios@est.funlam.edu.co',      doc:'1098765003', programa:'Derecho',                 semestre:'6', promedio:3.2 },
    { nombres:'Daniela',   apellidos:'Montoya Herrera', correo:'dmontoya@est.funlam.edu.co',   doc:'1098765004', programa:'Administración y Negocios',semestre:'2', promedio:2.5 },
    { nombres:'Juan',      apellidos:'Pérez Salazar',   correo:'jperez@est.funlam.edu.co',     doc:'1098765005', programa:'Sistemas',                semestre:'5', promedio:3.5 },
    { nombres:'Laura',     apellidos:'Cano Bedoya',     correo:'lcano@est.funlam.edu.co',      doc:'1098765006', programa:'Comunicación Social',     semestre:'3', promedio:2.9 },
    { nombres:'Andrés',    apellidos:'Vargas Pineda',   correo:'avargas@est.funlam.edu.co',    doc:'1098765007', programa:'Contaduría',              semestre:'4', promedio:3.0 },
    { nombres:'Luisa',     apellidos:'Ramírez Gómez',   correo:'lramirez@est.funlam.edu.co',   doc:'1098765008', programa:'Trabajo Social',          semestre:'2', promedio:2.4 },
    { nombres:'Carlos',    apellidos:'Londoño Castro',  correo:'clondono@est.funlam.edu.co',   doc:'1098765009', programa:'Sistemas',                semestre:'7', promedio:3.9 },
    { nombres:'Mariana',   apellidos:'Álvarez Soto',    correo:'malvarez@est.funlam.edu.co',   doc:'1098765010', programa:'Diseño Gráfico',          semestre:'3', promedio:2.6 },
  ];

  for (const e of estudiantes) {
    const r = await c.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo, creado_en) VALUES ($1,$2,$3,$4,'estudiante',1,$5) ON CONFLICT (correo) DO NOTHING RETURNING id`,
      [e.nombres, e.apellidos, correoInstitucional(e.correo), hash, ahora]
    );
    if (!r.rows[0]) continue;
    await c.query(
      `INSERT INTO perfiles_estudiante (usuario_id, codigo, documento, programa, semestre, telefono, promedio) VALUES ($1,$2,$2,$3,$4,$5,$6)`,
      [r.rows[0].id, e.doc, e.programa, e.semestre, '3001234567', e.promedio]
    );
  }

  console.log('🌱 Seed: 10 docentes y 10 estudiantes creados (contraseña: 123456)');
}

// ── Administrador inicial ───────────────────────────────
//
// El registro público solo acepta los roles estudiante y docente: dejar que
// cualquiera se creara una cuenta de administrador desde el formulario abierto
// era una escalada de privilegios. Pero entonces hace falta una forma de crear
// el PRIMER administrador, o el panel de administración queda inalcanzable.
//
// Esta función lo crea desde variables de entorno, y solo si todavía no existe
// ningún admin. No hay credenciales por defecto: si no se configuran, el
// servidor avisa en el arranque y no inventa nada.
async function sembrarAdminInicial(c) {
  const { rows } = await c.query(`SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin'`);
  if (rows[0].n > 0) return; // ya hay administrador

  const correo = (process.env.ADMIN_INICIAL_CORREO || '').trim().toLowerCase();
  const clave  = process.env.ADMIN_INICIAL_CONTRASENA || '';

  if (!correo || !clave) {
    console.warn(
      '\n⚠️  No hay ningún usuario administrador y no se puede crear uno.\n' +
      '   El registro público solo permite estudiante y docente (a propósito).\n' +
      '   Define estas dos variables de entorno y reinicia:\n' +
      '     ADMIN_INICIAL_CORREO=tu.correo@amigo.edu.co\n' +
      '     ADMIN_INICIAL_CONTRASENA=<una contraseña larga>\n' +
      '   Se usan una sola vez; después puedes borrarlas.\n'
    );
    return;
  }

  if (clave.length < 8) {
    console.warn('⚠️  ADMIN_INICIAL_CONTRASENA es demasiado corta (mínimo 8). No se creó el administrador.');
    return;
  }

  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(clave, RONDAS_BCRYPT);

  await c.query(
    `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
     VALUES ($1,$2,$3,$4,'admin',1)
     ON CONFLICT (correo) DO UPDATE SET rol = 'admin', contrasena = EXCLUDED.contrasena`,
    ['Administrador', 'del Sistema', correo, hash]
  );

  console.log(`👤 Administrador inicial creado: ${correo}`);
  console.log('   Cambia la contraseña al entrar y borra las variables ADMIN_INICIAL_*.');
}

// ── Claves foráneas hacia usuarios ──────────────────────
//
// Nueve claves foráneas se crearon sin ON DELETE. En PostgreSQL eso equivale
// a NO ACTION: la base BLOQUEA el borrado. Efecto real: el botón "Eliminar
// usuario" del panel admin devolvía 500 para cualquier usuario que tuviera
// una tutoría, que en la práctica son todos.
//
// El criterio no es el mismo para todas:
//
//   CASCADE  → registros operativos que no tienen sentido sin su usuario
//              (tutorías, asignaciones, clases programadas).
//
//   SET NULL → registros de AUDITORÍA e historial. Estos NO deben borrarse
//              con el usuario: si al eliminar una cuenta desaparece su rastro,
//              se pierde la evidencia y el registro de auditoría deja de servir
//              para lo único que existe. Se conserva la fila y se deja el autor
//              en NULL.
//
// Esta función es idempotente: se puede correr en cada arranque sin dañar nada.

const CLAVES_FORANEAS = [
  // tabla,                     columna,          restricción,                              acción
  ['tutorias',                  'estudiante_id',  'tutorias_estudiante_id_fkey',            'CASCADE'],
  ['tutorias',                  'docente_id',     'tutorias_docente_id_fkey',               'CASCADE'],
  ['asignaciones',              'estudiante_id',  'asignaciones_estudiante_id_fkey',        'CASCADE'],
  ['asignaciones',              'docente_id',     'asignaciones_docente_id_fkey',           'CASCADE'],
  ['clases_admin',              'docente_id',     'clases_admin_docente_id_fkey',           'CASCADE'],
  ['clases_admin',              'estudiante_id',  'clases_admin_estudiante_id_fkey',        'CASCADE'],
  // Auditoría e historial: se conservan.
  ['auditoria',                 'usuario_id',     'auditoria_usuario_id_fkey',              'SET NULL'],
  ['historial_notificaciones',  'enviado_por',    'historial_notificaciones_enviado_por_fkey', 'SET NULL'],
  ['clases_admin',              'programado_por', 'clases_admin_programado_por_fkey',       'SET NULL']
];

async function corregirClavesForaneas(c) {
  let corregidas = 0;

  for (const [tabla, columna, restriccion, accion] of CLAVES_FORANEAS) {
    // ¿La restricción ya tiene la acción correcta? confdeltype: 'a'=NO ACTION,
    // 'c'=CASCADE, 'n'=SET NULL. Si ya está bien, no se toca.
    const { rows } = await c.query(
      `SELECT confdeltype FROM pg_constraint WHERE conname = $1`,
      [restriccion]
    );

    const actual = rows[0]?.confdeltype;
    const esperado = accion === 'CASCADE' ? 'c' : 'n';
    if (actual === esperado) continue;

    // SET NULL exige que la columna admita NULL.
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

module.exports = { migrar };

// Permite ejecutar el archivo directamente:  node src/config/migrate.js
// Antes solo exportaba la función, así que `npm run db:init` no hacía nada
// y el CI no tenía forma de preparar la base antes de las pruebas.
if (require.main === module) {
  migrar()
    .then(() => {
      console.log('✅ Migración completada');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ La migración falló:', err.message);
      process.exit(1);
    });
}
