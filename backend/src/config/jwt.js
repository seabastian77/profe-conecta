const jwt = require('jsonwebtoken');

// Fallback en desarrollo para no romper si no hay .env
const SECRETO = process.env.JWT_SECRET || 'conectaprofe-dev-secret-cambiar-en-produccion';
const EXPIRA  = process.env.JWT_EXPIRES_IN || '8h';

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
    SECRETO,
    { expiresIn: EXPIRA }
  );
}

function verificarToken(token) {
  return jwt.verify(token, SECRETO);
}

module.exports = { generarToken, verificarToken };
