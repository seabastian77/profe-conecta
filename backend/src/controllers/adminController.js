const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/db');
const { generarToken } = require('../config/jwt');

const MAX_INTENTOS    = 5;
const MINUTOS_BLOQUEO = 5;
const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '';

// Auditoría (no crítica — no bloquea si falla)
async function registrarAuditoria(usuario_id, evento, detalle) {
  try {
    await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(usuario_id, evento, detalle);
  } catch(e) { /* no crítico */ }
}

// Reglas de validación
const reglasRegistro = [
  body('nombres').trim().notEmpty().withMessage('El nombre es requerido'),
  body('apellidos').trim().notEmpty().withMessage('Los apellidos son requeridos'),
  body('correo').isEmail().withMessage('Correo inválido').custom(v => {
    if (DOMINIO_PERMITIDO && !v.endsWith(DOMINIO_PERMITIDO))
      throw new Error(`Solo correos ${DOMINIO_PERMITIDO}`);
    return true;
  }),
  body('contrasena').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
  body('rol').isIn(['estudiante','docente','admin']).withMessage('Rol inválido')
];

const reglasLogin = [
  body('correo').isEmail().withMessage('Correo inválido'),
  body('contrasena').notEmpty().withMessage('La contraseña es requerida')
];

// ── POST /api/auth/registro ─────────────────────────────
async function registro(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const { nombres, apellidos, correo, contrasena, rol } = req.body;
  try {
    const existe = await db.prepare('SELECT id FROM usuarios WHERE correo = ?').get(correo);
    if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

    const hash = await bcrypt.hash(contrasena, 10);
    const resultado = await db.prepare(
      'INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id'
    ).get(nombres, apellidos, correo, hash, rol);

    const nuevoId = resultado?.id;
    const token = generarToken({ id: nuevoId, correo, rol });
    await registrarAuditoria(nuevoId, 'REGISTRO', `Nuevo usuario: ${correo} (${rol})`);

    res.status(201).json({
      mensaje: 'Cuenta creada. Completa tu perfil.',
      token,
      usuario: { id: nuevoId, nombres, apellidos, correo, rol }
    });
  } catch(err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/login ────────────────────────────────
async function login(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const { correo, contrasena } = req.body;
  try {
    const usuario = await db.prepare(
      'SELECT * FROM usuarios WHERE correo = ? AND activo = 1'
    ).get(correo);

    if (!usuario) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const ok = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });

    const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });
    await registrarAuditoria(usuario.id, 'LOGIN', 'Inicio de sesión');

    res.json({
      token,
      usuario: {
        id: usuario.id, nombres: usuario.nombres,
        apellidos: usuario.apellidos, correo: usuario.correo, rol: usuario.rol
      }
    });
  } catch(err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/recuperar ────────────────────────────
async function recuperar(req, res) {
  res.json({ mensaje: 'Si el correo existe, recibirás el enlace pronto.' });
}

// ── GET /api/auth/yo ────────────────────────────────────
async function yo(req, res) {
  const usuario = await db.prepare(
    'SELECT id, nombres, apellidos, correo, rol, creado_en FROM usuarios WHERE id = ?'
  ).get(req.usuario.id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(usuario);
}

module.exports = { registro, login, recuperar, yo, reglasRegistro, reglasLogin };
