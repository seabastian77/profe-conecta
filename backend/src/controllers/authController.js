const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/db');
const { generarToken } = require('../config/jwt');

const MAX_INTENTOS      = parseInt(process.env.MAX_INTENTOS || '5');
const MINUTOS_BLOQUEO   = parseInt(process.env.MINUTOS_BLOQUEO || '5');
const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '@amigo.edu.co';
const RONDAS_BCRYPT     = 12; // antes 10 — más caro de romper por fuerza bruta

// Auditoría (no crítica — no bloquea si falla)
async function registrarAuditoria(usuario_id, evento, detalle) {
  try {
    await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)')
      .run(usuario_id, evento, detalle);
  } catch (e) { /* no crítico */ }
}

// ── Bloqueo por intentos fallidos ───────────────────────
// Antes MAX_INTENTOS y MINUTOS_BLOQUEO estaban declarados pero nunca se usaban:
// el bloqueo por fuerza bruta era código muerto. Aquí queda implementado
// contra la tabla intentos_login (ver migrate.js).

// El límite por IP es MUCHO más alto que el de la cuenta, y a propósito.
// En la universidad todos los estudiantes salen a internet por la misma IP
// pública (NAT). Si se bloqueara por IP con el mismo umbral que por cuenta,
// un solo usuario equivocándose de contraseña dejaría sin entrar a todo el
// campus. El bloqueo real es por cuenta; el de IP solo frena barridos masivos.
const MAX_INTENTOS_IP = MAX_INTENTOS * 20;

async function estaBloqueado(correo, ip) {
  const fila = await db.prepare(
    `SELECT
       COUNT(*) FILTER (WHERE correo = ?) AS por_cuenta,
       COUNT(*) FILTER (WHERE ip = ?)     AS por_ip
     FROM intentos_login
     WHERE exitoso = 0
       AND creado_en > NOW() - INTERVAL '${MINUTOS_BLOQUEO} minutes'`
  ).get(correo, ip);

  const porCuenta = parseInt(fila?.por_cuenta || 0);
  const porIp     = parseInt(fila?.por_ip || 0);

  return porCuenta >= MAX_INTENTOS || porIp >= MAX_INTENTOS_IP;
}

async function registrarIntento(correo, ip, exitoso) {
  try {
    await db.prepare('INSERT INTO intentos_login (correo, ip, exitoso) VALUES (?,?,?)')
      .run(correo, ip, exitoso ? 1 : 0);
  } catch (e) { /* no crítico */ }
}

async function limpiarIntentos(correo) {
  try {
    await db.prepare('DELETE FROM intentos_login WHERE correo = ?').run(correo);
  } catch (e) { /* no crítico */ }
}

// ── Reglas de validación ────────────────────────────────
const reglasRegistro = [
  body('nombres').trim().notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 80 }).withMessage('Nombre demasiado largo').escape(),
  body('apellidos').trim().notEmpty().withMessage('Los apellidos son requeridos')
    .isLength({ max: 80 }).withMessage('Apellidos demasiado largos').escape(),
  body('correo').isEmail().withMessage('Correo inválido')
    .normalizeEmail({ gmail_remove_dots: false })
    .custom(v => {
      if (DOMINIO_PERMITIDO && !v.endsWith(DOMINIO_PERMITIDO))
        throw new Error(`Solo correos ${DOMINIO_PERMITIDO}`);
      return true;
    }),
  body('contrasena')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener mínimo 8 caracteres')
    .matches(/[A-Za-z]/).withMessage('La contraseña debe incluir al menos una letra')
    .matches(/[0-9]/).withMessage('La contraseña debe incluir al menos un número'),
  // 'admin' NO se acepta desde el registro público: un usuario cualquiera
  // podía crearse una cuenta de administrador mandando rol:'admin'.
  // Los admins se crean desde el panel de administración.
  body('rol').isIn(['estudiante', 'docente']).withMessage('Rol inválido')
];

const reglasLogin = [
  body('correo').isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false }),
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

    const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
    const resultado = await db.prepare(
      'INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id'
    ).get(nombres, apellidos, correo, hash, rol);

    const nuevoId = resultado?.id;
    if (!nuevoId) throw new Error('No se pudo crear el usuario');

    const token = generarToken({ id: nuevoId, correo, rol });
    await registrarAuditoria(nuevoId, 'REGISTRO', `Nuevo usuario: ${correo} (${rol})`);

    res.status(201).json({
      mensaje: 'Cuenta creada. Completa tu perfil.',
      token,
      usuario: { id: nuevoId, nombres, apellidos, correo, rol }
    });
  } catch (err) {
    console.error('Error en registro:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/login ────────────────────────────────
async function login(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const { correo, contrasena } = req.body;
  const ip = req.ip || 'desconocida';

  try {
    if (await estaBloqueado(correo, ip)) {
      await registrarAuditoria(null, 'LOGIN_BLOQUEADO', `Bloqueo por intentos: ${correo}`);
      return res.status(429).json({
        error: `Demasiados intentos fallidos. Espera ${MINUTOS_BLOQUEO} minutos.`
      });
    }

    const usuario = await db.prepare(
      'SELECT * FROM usuarios WHERE correo = ? AND activo = 1'
    ).get(correo);

    // Se compara siempre contra un hash — incluso si el usuario no existe —
    // para que el tiempo de respuesta no revele qué correos están registrados.
    const hashComparar = usuario?.contrasena || '$2b$12$invalidoinvalidoinvalidoinvalidoinvalidoinvalidoinvalidoinv';
    const ok = await bcrypt.compare(contrasena, hashComparar);

    if (!usuario || !ok) {
      await registrarIntento(correo, ip, false);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }

    await registrarIntento(correo, ip, true);
    await limpiarIntentos(correo);

    const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });
    await registrarAuditoria(usuario.id, 'LOGIN', 'Inicio de sesión');

    res.json({
      token,
      usuario: {
        id: usuario.id, nombres: usuario.nombres,
        apellidos: usuario.apellidos, correo: usuario.correo, rol: usuario.rol
      }
    });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// ── POST /api/auth/recuperar ────────────────────────────
// Respuesta siempre igual, exista o no el correo: no confirma cuentas.
async function recuperar(req, res) {
  res.json({ mensaje: 'Si el correo existe, recibirás el enlace pronto.' });
}

// ── GET /api/auth/yo ────────────────────────────────────
async function yo(req, res) {
  try {
    const usuario = await db.prepare(
      'SELECT id, nombres, apellidos, correo, rol, creado_en FROM usuarios WHERE id = ? AND activo = 1'
    ).get(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (err) {
    console.error('Error en /yo:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

module.exports = { registro, login, recuperar, yo, reglasRegistro, reglasLogin };
