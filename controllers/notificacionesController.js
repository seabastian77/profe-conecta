const { db } = require('../config/db');

const MAXIMO_LISTADO = 50;

// Lista las notificaciones más recientes del usuario autenticado.
async function listar(req, res) {
  const notifs = await db.prepare(
    'SELECT * FROM notificaciones WHERE usuario_id=? ORDER BY creada_en DESC, id DESC LIMIT ?'
  ).all(req.usuario.id, MAXIMO_LISTADO);
  res.json(notifs);
}

// Marca una notificación del usuario como leída; responde 404 si no existe o es de otra persona.
async function marcarLeida(req, res) {
  const cambio = await db.prepare('UPDATE notificaciones SET leida=1 WHERE id=? AND usuario_id=?')
    .run(Number(req.params.id), req.usuario.id);
  if (!cambio.rowCount) return res.status(404).json({ error: 'Notificación no encontrada' });
  res.json({ mensaje: 'Notificación leída' });
}

// Marca como leídas todas las notificaciones pendientes del usuario y dice cuántas eran.
async function marcarTodasLeidas(req, res) {
  const cambio = await db.prepare('UPDATE notificaciones SET leida=1 WHERE usuario_id=? AND leida=0').run(req.usuario.id);
  res.json({ mensaje: 'Todas leídas', cantidad: cambio.rowCount || 0 });
}

module.exports = { listar, marcarLeida, marcarTodasLeidas };
