const { db } = require('../config/db');

const { getConfigNum } = require('../config/config');
const { errorDatosSesion, instanteColombia } = require('../config/fechas');
const { docenteDictaAsignatura } = require('../config/reglasTutoria');

// Programa una tutoría validando horario y notificando a ambas partes.
async function programar(req, res) {
  const { estudiante_id, docente_id, asignatura, modalidad, fecha, hora, observaciones } = req.body;
  const solicitante = req.usuario;

  if (!asignatura || !modalidad || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  // El servidor repite las reglas del formulario: sin esto la API aceptaba fechas imposibles y el mismo día.
  const errorDatos = errorDatosSesion({ fecha, hora, modalidad });
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (String(asignatura).length > 120 || String(observaciones || '').length > 500) {
    return res.status(400).json({ error: 'La asignatura admite 120 caracteres y las observaciones 500' });
  }

  const idEstudiante = solicitante.rol === 'estudiante' ? solicitante.id : estudiante_id;
  const idDocente    = solicitante.rol === 'docente'    ? solicitante.id : docente_id;

  if (!idEstudiante || !idDocente) {
    return res.status(400).json({ error: 'Falta el estudiante o el docente' });
  }

  // Verifica que el docente y el estudiante existan, estén activos y con su rol.
  const docente = await db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(idDocente);
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado o inactivo' });
  const estudiante = await db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(idEstudiante);
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado o inactivo' });

  // La asignatura debe ser una de las que el tutor registró: antes se podía pedir cualquier materia a cualquier tutor.
  if (!(await docenteDictaAsignatura(idDocente, asignatura))) {
    return res.status(400).json({ error: `El tutor elegido no tiene registrada la asignatura ${asignatura}` });
  }

  const conflicto = await db.prepare(
    "SELECT id FROM tutorias WHERE docente_id=? AND fecha=? AND hora=? AND estado!='cancelada'"
  ).get(idDocente, fecha, hora);

  if (conflicto) {
    return res.status(409).json({ error: 'El docente ya tiene una tutoría a esa hora' });
  }

  // El estudiante tampoco puede quedar en dos tutorías a la misma hora, igual que en las asesorías del admin.
  const conflictoEst = await db.prepare(
    "SELECT id FROM tutorias WHERE estudiante_id=? AND fecha=? AND hora=? AND estado!='cancelada'"
  ).get(idEstudiante, fecha, hora);
  if (conflictoEst) {
    return res.status(409).json({ error: 'Ya tienes una tutoría a esa fecha y hora' });
  }

  const resultado = await db.prepare(
    'INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, observaciones) VALUES (?,?,?,?,?,?,?) RETURNING id'
  ).get(idEstudiante, idDocente, asignatura, modalidad, fecha, hora, observaciones || '');

  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
    .run(idEstudiante, '📅', 'Tutoría programada', `${asignatura} el ${fecha} a las ${hora}`);
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
    .run(idDocente, '📅', 'Nueva tutoría asignada', `Sesión de ${asignatura} el ${fecha} a las ${hora}`);

  res.status(201).json({ mensaje: 'Tutoría programada', id: resultado?.id });
}

// Lista las tutorías según el rol de quien consulta.
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
             u.correo AS correo_estudiante, pe.programa, pe.semestre, pe.promedio
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

// Cancela una tutoría respetando permisos y la antelación mínima.
async function cancelar(req, res) {
  const { id } = req.params;
  const usuario = req.usuario;

  const tutoria = await db.prepare('SELECT * FROM tutorias WHERE id=?').get(id);
  if (!tutoria) return res.status(404).json({ error: 'No encontrada' });

  const puedeCancel = usuario.rol === 'admin' ||
    tutoria.estudiante_id === usuario.id || tutoria.docente_id === usuario.id;

  if (!puedeCancel) return res.status(403).json({ error: 'Sin permiso' });
  if (tutoria.estado === 'cancelada') return res.status(400).json({ error: 'Ya cancelada' });

  // Antelación mínima para cancelar, tomada de la configuración.
  const HORAS_CANCELACION = await getConfigNum('RN_HORAS_CANCELACION', 24);

  // La hora guardada es de Colombia; leerla en la zona del servidor (UTC en Railway) corría la regla 5 horas.
  const horas = (instanteColombia(tutoria.fecha, tutoria.hora) - new Date()) / 3600000;

  // Una tutoría que ya pasó no se cancela: se marca realizada o no asistida.
  if (horas < 0) {
    return res.status(400).json({
      error: 'Esa tutoría ya pasó, no se puede cancelar. El docente puede marcarla como realizada o como no asistida.'
    });
  }

  if (horas < HORAS_CANCELACION && usuario.rol !== 'admin') {
    const faltan = Math.max(0, Math.round(horas));
    return res.status(400).json({
      error: `Faltan ${faltan}h para la tutoría y se requieren ${HORAS_CANCELACION}h de anticipación para cancelar (RN03). Escríbele al docente.`
    });
  }

  await db.prepare("UPDATE tutorias SET estado='cancelada' WHERE id=?").run(id);

  // Avisa a la otra parte; si cancela el administrador, a las dos.
  const avisar = [tutoria.estudiante_id, tutoria.docente_id].filter(uid => uid !== usuario.id);
  for (const uid of avisar) {
    await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
      uid, '❌', 'Tutoría cancelada: ' + tutoria.asignatura,
      `La sesión del ${tutoria.fecha} a las ${String(tutoria.hora).slice(0, 5)} fue cancelada.`
    );
  }

  res.json({ mensaje: 'Tutoría cancelada' });
}

// Marca una tutoría como completada; solo el docente dueño o un admin.
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

  // Una tutoría cancelada o ya completada no admite más cambios de estado.
  if (!['pendiente', 'confirmada'].includes(tutoria.estado)) {
    return res.status(400).json({ error: `Una tutoría ${tutoria.estado} no se puede marcar como realizada` });
  }

  await db.prepare("UPDATE tutorias SET estado='completada' WHERE id=?").run(id);
  res.json({ mensaje: 'Tutoría completada' });
}

// Lista los docentes activos con sus asignaturas.
async function docentesDisponibles(req, res) {
  const docentes = await db.prepare(`
    SELECT u.id, u.nombres, u.apellidos,
           pd.facultad,
           ARRAY_REMOVE(ARRAY_AGG(a.nombre ORDER BY a.nombre), NULL) AS materias
    FROM usuarios u
    JOIN perfiles_docente pd ON pd.usuario_id = u.id
    LEFT JOIN docente_asignaturas da ON da.docente_id = pd.id
    LEFT JOIN asignaturas a ON a.id = da.asignatura_id
    WHERE u.activo = 1 AND u.rol = 'docente'
    GROUP BY u.id, u.nombres, u.apellidos, pd.facultad
    ORDER BY u.nombres
  `).all();

  // «materias» llega como lista para que el formulario muestre solo las del tutor elegido.
  res.json(docentes.map(d => ({
    id: d.id,
    nombre: d.nombres + ' ' + d.apellidos,
    facultad: d.facultad || '—',
    asignaturas: d.materias.length ? d.materias.join(', ') : '—',
    materias: d.materias
  })));
}

// Busca estudiantes por nombre o documento para el docente.
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
