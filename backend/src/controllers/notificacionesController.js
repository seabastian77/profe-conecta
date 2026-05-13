const { db } = require('../config/db');

async function listar(req, res) {
  const notifs = await db.prepare(
    'SELECT * FROM notificaciones WHERE usuario_id=? ORDER BY creada_en DESC LIMIT 50'
  ).all(req.usuario.id);
  res.json(notifs);
}

async function marcarLeida(req, res) {
  await db.prepare('UPDATE notificaciones SET leida=1 WHERE id=? AND usuario_id=?')
    .run(req.params.id, req.usuario.id);
  res.json({ mensaje: 'Notificación leída' });
}

async function marcarTodasLeidas(req, res) {
  await db.prepare('UPDATE notificaciones SET leida=1 WHERE usuario_id=?').run(req.usuario.id);
  res.json({ mensaje: 'Todas leídas' });
}

module.exports = { listar, marcarLeida, marcarTodasLeidas };
