const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/db');
const { generarToken } = require('../config/jwt');

const MAX_INTENTOS      = 5;
const MINUTOS_BLOQUEO   = 5;
const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '@funlam.edu.co';

function registrarAuditoria(usuario_id, evento, detalle, req) {
  try {
    await db.prepare(
      'INSERT INTO auditoria (usuario_id, evento, detalle, ip, user_agent) VALUES (?,?,?,?,?)'
    ).run(usuario_id, evento, detalle, req.ip, req.headers['user-agent']);
  } catch (e) { /* no crítico */ }
}

// ── Reglas de validación ────────────────────────────────
const reglasRegistro = [
  body('nombres').trim().notEmpty().withMessage('El nombre es requerido'),
  body('apellidos').trim().notEmpty().withMessage('Los apellidos son requeridos'),
  body('correo').isEmail().withMessage('Correo inválido')
    .custom(v => {
      if (!v.endsWith(DOMINIO_PERMITIDO)) throw new Error(`Solo correos ${DOMINIO_PERMITIDO}`);
      return true;
    }),
  body('contrasena').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  body('rol').isIn(['estudiante','docente','admin']).withMessage('Rol inválido')
];

const reglasLogin = [
  body('correo').isEmail().withMessage('Correo inválido'),
  body('contrasena').notEmpty().withMessage('La contraseña es requerida')
];

// ── POST /api/auth/registro ─────────────────────────────
async async function registro(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ error: errores.array()[0].msg });
  }

  const { nombres, apellidos, correo, contrasena, rol } = req.body;

  try {
    const existe = await db.prepare('SELECT id FROM usuarios WHERE correo = ?').get(correo);
    if (existe) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const hash = await bcrypt.hash(contrasena, 10);

    const resultado = await db.prepare(
      'INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?)'
    ).run(nombres, apellidos, correo, hash, rol);

    const usuario = { id: resultado.lastInsertRowid, correo, rol };
    const token = generarToken(usuario);

    registrarAuditoria(usuario.id, 'Registro', `Nuevo: ${correo} (${rol})`, req);

    res.status(201).json({
      mensaje: 'Cuenta creada. Completa tu perfil.',
      token,
      usuario: { id: usuario.id, nombres, apellidos, correo, rol }
    });

  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/login ────────────────────────────────
async async function login(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ error: errores.array()[0].msg });
  }

  const { correo, contrasena } = req.body;

  try {
    // Verificar bloqueo temporal
    const limite = new Date(Date.now() - MINUTOS_BLOQUEO * 60 * 1000).toISOString();
    const intentos = await db.prepare(
      "SELECT COUNT(*) as total FROM intentos_login WHERE correo = ? AND creado_en > ?"
    ).get(correo, limite);

    if (intentos.total >= MAX_INTENTOS) {
      return res.status(429).json({
        error: `Cuenta bloqueada. Espera ${MINUTOS_BLOQUEO} minutos.`,
        bloqueado: true
      });
    }

    const usuario = await db.prepare(
      'SELECT * FROM usuarios WHERE correo = ? AND activo = 1'
    ).get(correo);

    if (!usuario) {
      await db.prepare('INSERT INTO intentos_login (correo, ip) VALUES (?,?)').run(correo, req.ip);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    const ok = await bcrypt.compare(contrasena, usuario.contrasena);
    if (!ok) {
      await db.prepare('INSERT INTO intentos_login (correo, ip) VALUES (?,?)').run(correo, req.ip);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    // Login exitoso
    await db.prepare('DELETE FROM intentos_login WHERE correo = ?').run(correo);
    const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });
    registrarAuditoria(usuario.id, 'Login', 'Inicio de sesión', req);

    res.json({
      token,
      usuario: {
        id:        usuario.id,
        nombres:   usuario.nombres,
        apellidos: usuario.apellidos,
        correo:    usuario.correo,
        rol:       usuario.rol
      }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/recuperar ────────────────────────────
async function recuperar(req, res) {
  const { correo } = req.body;
  if (!correo || !correo.endsWith(DOMINIO_PERMITIDO)) {
    return res.status(400).json({ error: `Solo correos ${DOMINIO_PERMITIDO}` });
  }
  // En producción: enviar email con Nodemailer/SendGrid
  // Por ahora responde siempre igual por seguridad
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
