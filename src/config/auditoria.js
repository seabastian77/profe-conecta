const { db } = require('./db');

// Devuelve la IP de origen de la petición sin el prefijo IPv6 de las direcciones IPv4.
function ipDe(req) {
  const ip = req?.ip || req?.socket?.remoteAddress || '';
  return ip ? String(ip).replace(/^::ffff:/, '').slice(0, 64) : null;
}

// Guarda un evento de auditoría con el usuario y la IP de la petición; si falla, la operación sigue.
async function auditar(req, evento, detalle, usuarioId) {
  const usuario = usuarioId !== undefined ? usuarioId : (req?.usuario?.id ?? null);
  try {
    await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle, ip) VALUES (?,?,?,?)')
      .run(usuario, evento, String(detalle ?? '').slice(0, 500), ipDe(req));
  } catch (err) {
    console.warn('No se pudo registrar la auditoría:', err.message);
  }
}

module.exports = { auditar, ipDe };
