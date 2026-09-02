const { db } = require('../config/db');

const { getConfigNum } = require('../config/config');

// ── POST /api/tutorias ──────────────────────────────────
async function programar(req, res) {
  const { estudiante_id, docente_id, asignatura, modalidad, fecha, hora, observaciones } = req.body;
  const solicitante = req.usuario;

  if (!asignatura || !modalidad || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  const idEstudiante = solicitante.rol === 'estudiante' ? solicitante.id : estudiante_id;
  const idDocente    = solicitante.rol === 'docente'    ? solicitante.id : docente_id;

  if (!idEstudiante || !idDocente) {
    return res.status(400).json({ error: 'Falta el estudiante o el docente' });
  }

  const conflicto = await db.prepare(
    "SELECT id FROM tutorias WHERE docente_id=? AND fecha=? AND hora=? AND estado!='cancelada'"
  ).get(idDocente, fecha, hora);

  if (conflicto) {
    return res.status(409).json({ error: 'El docente ya tiene una tutoría a esa hora' });
  }

  if (new Date(`${fecha}T${hora}`) < new Date()) {
    return res.status(400).json({ error: 'La fecha no puede ser en el pasado' });
  }

  const resultado = await db.prepare(
    'INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, observaciones) VALUES (?,?,?,?,?,?,?)'
  ).run(idEstudiante, idDocente, asignatura, modalidad, fecha, hora, observaciones || '');

  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
    .run(idEstudiante, '📅', 'Tutoría programada', `${asignatura} el ${fecha} a las ${hora}`);
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
    .run(idDocente, '📅', 'Nueva tutoría asignada', `Sesión de ${asignatura} el ${fecha} a las ${hora}`);

  res.status(201).json({ mensaje: 'Tutoría programada', id: resultado?.id });
}

// ── GET /api/tutorias ───────────────────────────────────
async function listar(req, res) {
  const { id, rol } = req.usuario;
  let tutorias;

  if (rol === 'estudiante') {
    tutorias = await db.prepare(`
      SELECT t.*, u.nombres||' '||u.apellidos AS nombre_docente, u.correo AS correo_docente
      FROM tutorias t JOIN usuarios u ON u.id=t.docente_id
      WHERE t.estudiante_id=? ORDER BY t.fecha DESC, t.hora DESC
    `).all(id);

  } else if (rol === 'docente') {
    tutorias = await db.prepare(`
      SELECT t.*, u.nombres||' '||u.apellidos AS nombre_estudiante,
             u.correo AS correo_estudiante, pe.programa, pe.semestre
      FROM tutorias t
      JOIN usuarios u ON u.id=t.estudiante_id
      LEFT JOIN perfiles_estudiante pe ON pe.usuario_id=t.estudiante_id
      WHERE t.docente_id=? ORDER BY t.fecha DESC, t.hora DESC
    `).all(id);

  } else {
    tutorias = await db.prepare(`
      SELECT t.*, e.nombres||' '||e.apellidos AS nombre_estudiante,
             d.nombres||' '||d.apellidos AS nombre_docente
      FROM tutorias t
      JOIN usuarios e ON e.id=t.estudiante_id
      JOIN usuarios d ON d.id=t.docente_id
      ORDER BY t.fecha DESC LIMIT 200
    `).all();
  }

  res.json(tutorias);
}

// ── PATCH /api/tutorias/:id/cancelar ───────────────────
async function cancelar(req, res) {
  const { id } = req.params;
  const usuario = req.usuario;

  const tutoria = await db.prepare('SELECT * FROM tutorias WHERE id=?').get(id);
  if (!tutoria) return res.status(404).json({ error: 'No encontrada' });

  const puedeCancel = usuario.rol === 'admin' ||
    tutoria.estudiante_id === usuario.id || tutoria.docente_id === usuario.id;

  if (!puedeCancel) return res.status(403).json({ error: 'Sin permiso' });
  if (tutoria.estado === 'cancelada') return res.status(400).json({ error: 'Ya cancelada' });

  // HORAS_CANCELACION se usaba sin haberse definido nunca: la línea lanzaba
  // ReferenceError y, al ser un handler async sin captura, tumbaba el proceso
  // entero cada vez que alguien cancelaba una tutoría.
  // El valor vive en la tabla configuracion (RN_HORAS_CANCELACION, por defecto 24),
  // que es justo para lo que se importó getConfigNum y nunca se llegó a usar.
  const HORAS_CANCELACION = await getConfigNum('RN_HORAS_CANCELACION', 24);

  const horas = (new Date(`${tutoria.fecha}T${tutoria.hora}`) - new Date()) / 3600000;
  if (horas < HORAS_CANCELACION && usuario.rol !== 'admin') {
    return res.status(400).json({ error: `Solo con ${HORAS_CANCELACION}h de anticipación (RN03)` });
  }

  await db.prepare("UPDATE tutorias SET estado='cancelada' WHERE id=?").run(id);
  res.json({ mensaje: 'Tutoría cancelada' });
}

// ── PATCH /api/tutorias/:id/realizada ──────────────────
async function marcarRealizada(req, res) {
  const { id } = req.params;
  const usuario = req.usuario;

  if (!['docente','admin'].includes(usuario.rol)) {
    return res.status(403).json({ error: 'Solo el docente puede marcar como realizada' });
  }

  const tutoria = await db.prepare('SELECT * FROM tutorias WHERE id=?').get(id);
  if (!tutoria) return res.status(404).json({ error: 'No encontrada' });
  if (usuario.rol === 'docente' && tutoria.docente_id !== usuario.id) {
    return res.status(403).json({ error: 'No es tu tutoría' });
  }

  await db.prepare("UPDATE tutorias SET estado='completada' WHERE id=?").run(id);
  res.json({ mensaje: 'Tutoría completada' });
}

// ── GET /api/tutorias/docentes-disponibles ──────────────
// Retorna todos los docentes activos con sus materias — accesible para cualquier rol
async function docentesDisponibles(req, res) {
  const docentes = await db.prepare(`
    SELECT u.id, u.nombres, u.apellidos,
           pd.facultad,
           STRING_AGG(a.nombre, ', ') AS asignaturas
    FROM usuarios u
    JOIN perfiles_docente pd ON pd.usuario_id = u.id
    LEFT JOIN docente_asignaturas da ON da.docente_id = pd.id
    LEFT JOIN asignaturas a ON a.id = da.asignatura_id
    WHERE u.activo = 1 AND u.rol = 'docente'
    GROUP BY u.id, u.nombres, u.apellidos, pd.facultad
    ORDER BY u.nombres
  `).all();

  res.json(docentes.map(d => ({
    id: d.id,
    nombre: d.nombres + ' ' + d.apellidos,
    facultad: d.facultad || '—',
    asignaturas: d.asignaturas || '—'
  })));
}

// ── GET /api/tutorias/buscar-estudiante?q=xxx ──────────
// Accesible para docentes — busca estudiantes por documento o nombre
async function buscarEstudiante(req, res) {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: 'Ingresa al menos 2 caracteres' });
  }
  const like = '%' + q.trim() + '%';
  const estudiantes = await db.prepare(`
    SELECT u.id, u.nombres, u.apellidos,
           pe.documento, pe.programa
    FROM usuarios u
    LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
    WHERE u.activo = 1 AND u.rol = 'estudiante'
      AND (u.nombres ILIKE ? OR u.apellidos ILIKE ? OR pe.documento ILIKE ?)
    ORDER BY u.nombres
    LIMIT 10
  `).all(like, like, like);

  res.json(estudiantes.map(e => ({
    id: e.id,
    nombre: e.nombres + ' ' + e.apellidos,
    documento: e.documento || '—',
    programa: e.programa || '—'
  })));
}

module.exports = { programar, listar, cancelar, marcarRealizada, docentesDisponibles, buscarEstudiante };
