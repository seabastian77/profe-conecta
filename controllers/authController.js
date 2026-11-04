const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/db');
const { generarToken } = require('../config/jwt');
const { RONDAS_BCRYPT, validarContrasena } = require('../config/seguridad');
const { enteroPositivo } = require('../config/validaciones');
const { auditar } = require('../config/auditoria');

// RRN01 pide bloquear después de 3 intentos fallidos (antes eran 5, DEF-04); un valor mal escrito en el entorno vuelve al defecto.
const MAX_INTENTOS      = enteroPositivo(process.env.MAX_INTENTOS) ?? 3;
const MINUTOS_BLOQUEO   = enteroPositivo(process.env.MINUTOS_BLOQUEO) ?? 5;
const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '@amigo.edu.co';
const MAX_CARACTERES_CONTRASENA = 200;

// Límite por IP más alto que por cuenta: el campus comparte una IP pública (NAT).
const MAX_INTENTOS_IP = MAX_INTENTOS * 20;

const MENSAJE_RECUPERACION =
  'Si el correo está registrado, avisamos a los administradores para que restablezcan tu contraseña. ' +
  'Cuando lo hagan, ingresa con la contraseña temporal que te entreguen.';

// Hash de relleno para que el login tarde lo mismo exista o no el correo; se calcula una sola vez.
let hashDeRelleno;
function obtenerHashDeRelleno() {
  hashDeRelleno ??= bcrypt.hash(crypto.randomBytes(16).toString('hex'), RONDAS_BCRYPT);
  return hashDeRelleno;
}

// Indica si la cuenta o la IP superaron los intentos fallidos permitidos.
async function estaBloqueado(correo, ip) {
  const fila = await db.prepare(
    `SELECT
       COUNT(*) FILTER (WHERE correo = ?) AS por_cuenta,
       COUNT(*) FILTER (WHERE ip = ?)     AS por_ip
     FROM intentos_login
     WHERE exitoso = 0
       AND creado_en > NOW() - make_interval(mins => ?)`
  ).get(correo, ip, MINUTOS_BLOQUEO);

  const porCuenta = parseInt(fila?.por_cuenta || 0);
  const porIp     = parseInt(fila?.por_ip || 0);

  return porCuenta >= MAX_INTENTOS || porIp >= MAX_INTENTOS_IP;
}

// Registra un intento de login para el conteo de bloqueo.
async function registrarIntento(correo, ip, exitoso) {
  try {
    await db.prepare('INSERT INTO intentos_login (correo, ip, exitoso) VALUES (?,?,?)')
      .run(correo, ip, exitoso ? 1 : 0);
  } catch { /* no crítico */ }
}

// Borra los intentos de una cuenta tras un login correcto.
async function limpiarIntentos(correo) {
  try {
    await db.prepare('DELETE FROM intentos_login WHERE correo = ?').run(correo);
  } catch { /* no crítico */ }
}

// Valida la contraseña del registro con las mismas reglas que usa el panel de administración.
function contrasenaDeRegistro(valor) {
  const error = validarContrasena(valor);
  if (error) throw new Error(error);
  return true;
}

// Reglas de validación del registro.
const reglasRegistro = [
  body('nombres').isString().withMessage('El nombre es requerido').bail()
    .trim().notEmpty().withMessage('El nombre es requerido')
    .isLength({ max: 80 }).withMessage('Nombre demasiado largo')
    .matches(/^[\p{L}\p{M}\s'.-]+$/u).withMessage('El nombre solo admite letras'),
  body('apellidos').isString().withMessage('Los apellidos son requeridos').bail()
    .trim().notEmpty().withMessage('Los apellidos son requeridos')
    .isLength({ max: 80 }).withMessage('Apellidos demasiado largos')
    .matches(/^[\p{L}\p{M}\s'.-]+$/u).withMessage('Los apellidos solo admiten letras'),
  body('correo').isString().withMessage('Correo inválido').bail()
    .isEmail().withMessage('Correo inválido')
    .normalizeEmail({ gmail_remove_dots: false })
    .custom(v => {
      if (DOMINIO_PERMITIDO && !v.endsWith(DOMINIO_PERMITIDO))
        throw new Error(`Solo correos ${DOMINIO_PERMITIDO}`);
      return true;
    }),
  body('contrasena').custom(contrasenaDeRegistro),
  // El registro público solo admite estudiante y docente, nunca admin.
  body('rol').isIn(['estudiante', 'docente']).withMessage('Rol inválido')
];

// Reglas de validación del login.
const reglasLogin = [
  body('correo').isString().withMessage('Correo inválido').bail()
    .isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false }),
  body('contrasena').isString().withMessage('La contraseña es requerida').bail()
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ max: MAX_CARACTERES_CONTRASENA }).withMessage('Correo o contraseña incorrectos')
];

// Reglas de validación de la solicitud de recuperación.
const reglasRecuperar = [
  body('correo').isString().withMessage('Correo inválido').bail()
    .isEmail().withMessage('Correo inválido').normalizeEmail({ gmail_remove_dots: false })
];

// Crea una cuenta nueva y devuelve su token.
async function registro(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const { nombres, apellidos, correo, contrasena, rol } = req.body;

  const existe = await db.prepare('SELECT id FROM usuarios WHERE lower(correo) = ?').get(correo);
  if (existe) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });

  const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
  let resultado;
  try {
    resultado = await db.prepare(
      'INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id'
    ).get(nombres, apellidos, correo, hash, rol);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    throw err;
  }

  const nuevoId = resultado.id;
  const token = generarToken({ id: nuevoId, correo, rol });
  await auditar(req, 'REGISTRO', `Nuevo usuario: ${correo} (${rol})`, nuevoId);

  res.status(201).json({
    mensaje: 'Cuenta creada. Completa tu perfil.',
    token,
    usuario: { id: nuevoId, nombres, apellidos, correo, rol }
  });
}

// Valida credenciales, aplica el bloqueo por intentos y devuelve el token.
async function login(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const { correo, contrasena } = req.body;
  const ip = req.ip || 'desconocida';

  if (await estaBloqueado(correo, ip)) {
    await auditar(req, 'LOGIN_BLOQUEADO', `Bloqueo por intentos: ${correo}`, null);
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Espera ${MINUTOS_BLOQUEO} minutos.`
    });
  }

  const usuario = await db.prepare(
    'SELECT id, nombres, apellidos, correo, contrasena, rol FROM usuarios WHERE lower(correo) = ? AND activo = 1'
  ).get(correo);

  // Compara siempre contra un hash válido para no revelar por el tiempo de respuesta qué correos existen.
  const ok = await bcrypt.compare(contrasena, usuario?.contrasena || await obtenerHashDeRelleno());

  if (!usuario || !ok) {
    await registrarIntento(correo, ip, false);
    // El filtro «Intento fallido» de Auditoría no tenía qué mostrar: los fallos no se registraban.
    await auditar(req, 'LOGIN_FALLIDO', `Credenciales incorrectas: ${correo}`, usuario?.id ?? null);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }

  await registrarIntento(correo, ip, true);
  await limpiarIntentos(correo);

  const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });
  await auditar(req, 'LOGIN', 'Inicio de sesión', usuario.id);

  res.json({
    token,
    usuario: {
      id: usuario.id, nombres: usuario.nombres,
      apellidos: usuario.apellidos, correo: usuario.correo, rol: usuario.rol
    }
  });
}

// Registra el cierre de sesión (manual o por inactividad) para el historial de accesos.
async function salir(req, res) {
  const motivo = req.body?.motivo === 'inactividad' ? 'Sesión cerrada por inactividad' : 'Cierre de sesión';
  await auditar(req, 'LOGOUT', motivo);
  res.json({ mensaje: 'Sesión cerrada' });
}

// Avisa a los administradores de que alguien pidió restablecer su contraseña; responde igual exista o no el correo.
async function recuperar(req, res) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) return res.status(400).json({ error: errores.array()[0].msg });

  const usuario = await db.prepare(
    'SELECT id, nombres, apellidos, correo FROM usuarios WHERE lower(correo) = ? AND activo = 1'
  ).get(req.body.correo);

  if (usuario) {
    // Una solicitud por hora y cuenta: repetirla no llena de avisos a los administradores.
    const reciente = await db.prepare(
      `SELECT 1 AS si FROM auditoria
       WHERE evento = 'RECUPERACION_SOLICITADA' AND usuario_id = ?
         AND creada_en > to_char(NOW() - INTERVAL '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS')
       LIMIT 1`
    ).get(usuario.id);

    if (!reciente) {
      await db.prepare(
        `INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion)
         SELECT id, '🔑', ?, ? FROM usuarios WHERE rol = 'admin' AND activo = 1`
      ).run(
        'Solicitud de recuperación de acceso',
        `${usuario.nombres} ${usuario.apellidos} (${usuario.correo}) pidió restablecer su contraseña. ` +
        'Entra a Gestión de usuarios, edita su cuenta y asígnale una contraseña temporal.'
      );
      await auditar(req, 'RECUPERACION_SOLICITADA', `Solicitud de restablecimiento: ${usuario.correo}`, usuario.id);
    }
  }

  res.json({ mensaje: MENSAJE_RECUPERACION });
}

// Devuelve los datos del usuario autenticado.
async function yo(req, res) {
  const usuario = await db.prepare(
    'SELECT id, nombres, apellidos, correo, rol, creado_en FROM usuarios WHERE id = ? AND activo = 1'
  ).get(req.usuario.id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(usuario);
}

module.exports = { registro, login, salir, recuperar, yo, reglasRegistro, reglasLogin, reglasRecuperar };
