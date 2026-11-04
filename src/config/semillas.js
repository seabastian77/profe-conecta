// Datos iniciales: catálogo de materias, cuentas de ejemplo (solo fuera de producción) y administrador inicial.
const { RONDAS_BCRYPT } = require('./seguridad');
const DOMINIO_INSTITUCIONAL = process.env.DOMINIO_CORREO || '@amigo.edu.co';

// Reescribe el correo del seed al dominio que la aplicación admite.
function correoInstitucional(correo) {
  return correo.split('@')[0].toLowerCase() + DOMINIO_INSTITUCIONAL;
}

// Indica si se pueden crear las cuentas de ejemplo: en producción solo si se pide de forma explícita.
function demoPermitido() {
  return process.env.NODE_ENV !== 'production' || process.env.SEMBRAR_DATOS_DEMO === 'true';
}

// Inserta el catálogo de asignaturas de ejemplo.
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

// Crea 10 docentes y 10 estudiantes de ejemplo solo si aún no hay ninguno.
async function sembrarUsuarios(c) {
  const { rows } = await c.query(`SELECT COUNT(*) AS cnt FROM usuarios WHERE rol != 'admin'`);
  if (parseInt(rows[0].cnt) > 0) return;

  if (!demoPermitido()) {
    console.log('ℹ️  Cuentas de ejemplo omitidas en producción (SEMBRAR_DATOS_DEMO=true las crea).');
    return;
  }

  const bcrypt = require('bcrypt');
  // Usa 10 rondas: son cuentas de ejemplo con contraseña pública.
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
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo, creado_en) VALUES ($1,$2,$3,$4,'docente',1,$5) ON CONFLICT DO NOTHING RETURNING id`,
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
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo, creado_en) VALUES ($1,$2,$3,$4,'estudiante',1,$5) ON CONFLICT DO NOTHING RETURNING id`,
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

// Crea el administrador definido en las variables de entorno; uno existente solo se restablece si se pide de forma explícita.
async function sembrarAdminInicial(c) {
  const correo = (process.env.ADMIN_INICIAL_CORREO || '').trim().toLowerCase();
  const clave  = process.env.ADMIN_INICIAL_CONTRASENA || '';

  // Sin variables no hay nada que crear (ya se usaron o aún no se definen).
  if (!correo || !clave) return;

  if (clave.length < 8) {
    console.warn('⚠️  ADMIN_INICIAL_CONTRASENA es demasiado corta (mínimo 8). No se creó el administrador.');
    return;
  }

  const existente = await c.query('SELECT id FROM usuarios WHERE lower(correo) = $1', [correo]);
  const restablecer = process.env.ADMIN_INICIAL_RESTABLECER === 'true';

  if (existente.rowCount && !restablecer) {
    console.log(`ℹ️  El administrador ${correo} ya existe y no se modifica. Para restablecer su contraseña define ADMIN_INICIAL_RESTABLECER=true durante un solo arranque.`);
    return;
  }

  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(clave, RONDAS_BCRYPT);

  if (existente.rowCount) {
    await c.query("UPDATE usuarios SET rol = 'admin', activo = 1, contrasena = $2 WHERE id = $1", [existente.rows[0].id, hash]);
    console.log(`🔑 Administrador restablecido: ${correo}`);
  } else {
    await c.query(
      `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
       VALUES ($1,$2,$3,$4,'admin',1)`,
      ['Administrador', 'del Sistema', correo, hash]
    );
    console.log(`👤 Administrador inicial creado: ${correo}`);
  }
  console.log('   Cambia la contraseña al entrar y borra las variables ADMIN_INICIAL_*.');
}

module.exports = { sembrarAsignaturas, sembrarUsuarios, sembrarAdminInicial, correoInstitucional, demoPermitido };
