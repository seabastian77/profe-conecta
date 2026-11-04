const { verificarToken } = require('../config/jwt');
const { db } = require('../config/db');

// Protege las rutas privadas: exige un token válido de un usuario que siga existiendo y activo.
async function autenticar(req, res, next) {
  const encabezado = req.headers['authorization'];

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  let payload;
  try {
    payload = verificarToken(encabezado.slice(7));
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  if (!Number.isInteger(payload.id)) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    // El rol y el estado se leen de la base: una cuenta desactivada, eliminada o con otro rol cambia al instante.
    const fila = await db.prepare('SELECT id, correo, rol, activo FROM usuarios WHERE id = ?').get(payload.id);
    if (!fila || fila.activo !== 1) {
      return res.status(401).json({ error: 'Tu sesión ya no es válida. Inicia sesión de nuevo' });
    }
    // Cada petición tiene su propio req, así que asignarlo después de esperar es seguro.
    // eslint-disable-next-line require-atomic-updates
    req.usuario = { id: fila.id, correo: fila.correo, rol: fila.rol };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { autenticar };
