const { verificarToken } = require('../config/jwt');

// Middleware que protege las rutas privadas
// Si no hay token o es inválido, responde 401
function autenticar(req, res, next) {
  const encabezado = req.headers['authorization'];

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  const token = encabezado.split(' ')[1];

  try {
    const payload = verificarToken(token);
    req.usuario = payload; // { id, correo, rol }
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { autenticar };
