const { db } = require('../../config/db');
const { auditar, GRUPOS_EVENTOS } = require('../../config/auditoria');
const { esFechaValida } = require('../../config/fechas');
const { escaparLike, paginacion } = require('../../config/validaciones');

// Días que debe tener un registro de auditoría para poder archivarse.
const DIAS_ARCHIVO_AUDITORIA = 90;

// Consulta la auditoría sin los registros archivados, salvo que se pidan; el total va en X-Total-Count.
async function verAuditoria(req, res) {
  const { tipo, fecha, archivadas, grupo } = req.query;
  const { limite, desplazamiento } = paginacion(req.query, { porDefecto: 500, maximo: 500 });

  let donde = 'WHERE 1=1';
  const params = [];
  if (archivadas !== '1') donde += ' AND COALESCE(a.archivada,0)=0';
  if (req.query.mios === '1') { donde += ' AND a.usuario_id = ?'; params.push(req.usuario.id); }
  if (tipo) { donde += ' AND a.evento LIKE ?'; params.push('%' + escaparLike(String(tipo).slice(0, 60)) + '%'); }
  if (grupo) {
    const eventos = Object.hasOwn(GRUPOS_EVENTOS, grupo) ? GRUPOS_EVENTOS[grupo] : null;
    if (!eventos) return res.status(400).json({ error: 'El grupo de eventos no es válido' });
    donde += ` AND a.evento IN (${eventos.map(() => '?').join(',')})`;
    params.push(...eventos);
  }
  if (fecha) {
    if (!esFechaValida(fecha)) return res.status(400).json({ error: 'La fecha no es válida (AAAA-MM-DD)' });
    donde += ' AND a.creada_en LIKE ?';
    params.push(fecha + '%');
  }

  const [filas, total] = await Promise.all([
    db.prepare(`
      SELECT a.id, a.usuario_id, a.evento, a.detalle, a.ip, a.creada_en, COALESCE(a.archivada,0) AS archivada,
             u.correo AS correo_usuario
      FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ${donde}
      ORDER BY a.creada_en DESC, a.id DESC LIMIT ? OFFSET ?
    `).all(...params, limite, desplazamiento),
    db.prepare(`SELECT COUNT(*) AS n FROM auditoria a ${donde}`).get(...params)
  ]);

  res.set('X-Total-Count', String(parseInt(total?.n || 0)));
  res.json(filas);
}

// Archiva los registros de auditoría de más de 90 días: salen del listado pero se conservan.
async function archivarAuditoria(req, res) {
  const resultado = await db.prepare(
    `UPDATE auditoria SET archivada = 1
     WHERE COALESCE(archivada, 0) = 0
       AND creada_en < to_char(NOW() - make_interval(days => ?), 'YYYY-MM-DD"T"HH24:MI:SS')`
  ).run(DIAS_ARCHIVO_AUDITORIA);
  const archivados = resultado.rowCount || 0;

  await auditar(req, 'AUDITORIA_ARCHIVADA', `${archivados} registro(s) de más de ${DIAS_ARCHIVO_AUDITORIA} días`);
  res.json({
    mensaje: archivados > 0
      ? `Se archivaron ${archivados} registro(s) de más de ${DIAS_ARCHIVO_AUDITORIA} días`
      : `No hay registros de más de ${DIAS_ARCHIVO_AUDITORIA} días para archivar`,
    archivados
  });
}

module.exports = { verAuditoria, archivarAuditoria };
