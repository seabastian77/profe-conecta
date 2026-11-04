const bcrypt = require('bcrypt');
const { db } = require('../src/config/db');
const { generarToken } = require('../src/config/jwt');
const { hoyColombia, sumarDias } = require('../src/config/fechas');

// Las pruebas crean y borran datos: nunca deben correr contra la base de Railway.
if (/rlwy\.net|railway\.(app|internal)/i.test(process.env.DATABASE_URL || '')) {
  throw new Error('Las pruebas escriben datos de prueba: no se ejecutan contra la base de Railway. Usa una base local.');
}

let contador = 0;
const rellenar = (n) => String(n).padStart(2, '0');

// Hash con pocas rondas para que crear usuarios de prueba no tarde; el login lo acepta igual.
const HASH_PRUEBA = bcrypt.hashSync('Password123', 4);

// Devuelve un texto distinto en cada llamada y en cada corrida de las pruebas.
function unico() {
  contador += 1;
  return `${Date.now()}${rellenar(contador)}${Math.floor(Math.random() * 1000)}`;
}

// Devuelve un documento de 10 dígitos que casi nunca se repite.
function documentoUnico() {
  return String(Math.floor(1e9 + Math.random() * 9e9));
}

// Devuelve una fecha y una hora futuras, dentro del límite de dos años, que casi nunca se repiten.
function franjaUnica() {
  const dias = 2 + Math.floor(Math.random() * 700);
  const hora = `${rellenar(6 + Math.floor(Math.random() * 14))}:${rellenar(Math.floor(Math.random() * 60))}`;
  return { fecha: sumarDias(hoyColombia(), dias), hora };
}

// Devuelve el token de un usuario que existe en la base.
function tokenDe(usuario) {
  return generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });
}

// Crea un usuario activo con ese rol directamente en la base y devuelve sus datos y su token.
async function crearUsuario(rol, prefijo = 'prueba') {
  const correo = `${prefijo}.${unico()}@amigo.edu.co`;
  const { rows } = await db.pool.query(
    `INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, activo)
     VALUES ($1,$2,$3,$4,$5,1) RETURNING id`,
    ['Prueba', rol.charAt(0).toUpperCase() + rol.slice(1), correo, HASH_PRUEBA, rol]
  );
  const usuario = { id: rows[0].id, correo, rol };
  return { ...usuario, token: tokenDe(usuario) };
}

// Crea un docente con perfil y las materias indicadas, listo para recibir tutorías.
async function crearDocente(materias = [`Materia ${unico()}`]) {
  const docente = await crearUsuario('docente', 'docente');
  const perfil = await db.pool.query(
    `INSERT INTO perfiles_docente (usuario_id, cedula, codigo_docente, facultad, telefono)
     VALUES ($1,$2,$2,'Facultad de Ingenierías','3001234567') RETURNING id`,
    [docente.id, documentoUnico()]
  );
  for (const nombre of materias) {
    const asignatura = await db.pool.query(
      `INSERT INTO asignaturas (nombre) VALUES ($1)
       ON CONFLICT (nombre) DO UPDATE SET nombre = excluded.nombre RETURNING id`, [nombre]);
    await db.pool.query(
      'INSERT INTO docente_asignaturas (docente_id, asignatura_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [perfil.rows[0].id, asignatura.rows[0].id]
    );
  }
  return { ...docente, perfilId: perfil.rows[0].id, materias };
}

// Crea un estudiante con perfil completo y un documento propio.
async function crearEstudiante(programa = 'Ingeniería de Sistemas') {
  const estudiante = await crearUsuario('estudiante', 'estudiante');
  await db.pool.query(
    `INSERT INTO perfiles_estudiante (usuario_id, codigo, documento, programa, semestre, telefono)
     VALUES ($1,$2,$2,$3,'5','3001234567')`,
    [estudiante.id, documentoUnico(), programa]
  );
  return estudiante;
}

// Crea un administrador para la prueba.
function crearAdmin() {
  return crearUsuario('admin', 'admin');
}

// Borra por completo a los usuarios creados por una prueba, con sus tutorías y registros.
async function borrarUsuarios(ids) {
  const lista = ids.filter(Boolean);
  if (!lista.length) return;
  await db.pool.query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [lista]);
}

module.exports = {
  unico, documentoUnico, franjaUnica, tokenDe, crearUsuario, crearDocente, crearEstudiante, crearAdmin, borrarUsuarios
};
