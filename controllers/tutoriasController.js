const { db } = require('../config/db');
const { getConfigNum } = require('../config/config');
const { errorDatosSesion, instanteColombia } = require('../config/fechas');
const { horaCorta, bloquearAgenda, choqueDeHorario } = require('../config/agenda');
const { docenteDictaAsignatura } = require('../config/reglasTutoria');
const { enteroPositivo, escaparLike, paginacion } = require('../config/validaciones');

const MAX_ASIGNATURA = 120;
const MAX_OBSERVACIONES = 500;
const ESTADOS_VIGENTES = ['pendiente', 'confirmada'];

// Lee un texto del cuerpo: devuelve el texto recortado, '' si falta o null si no es un texto.
function leerTexto(valor) {
  if (valor === undefined || valor === null) return '';
  return typeof valor === 'string' ? valor.trim() : null;
}

// Programa una tutoría validando horario y notificando a ambas partes en una sola transacción.
async function programar(req, res) {
  const solicitante = req.usuario;
  const asignatura = leerTexto(req.body.asignatura);
  const observaciones = leerTexto(req.body.observaciones);
  const { modalidad, fecha } = req.body;
  const hora = typeof req.body.hora === 'string' ? req.body.hora.trim() : req.body.hora;

  if (!asignatura || !modalidad || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  if (observaciones === null) return res.status(400).json({ error: 'Las observaciones deben ser un texto' });

  // El servidor repite las reglas del formulario: sin esto la API aceptaba fechas imposibles y el mismo día.
  const errorDatos = errorDatosSesion({ fecha, hora, modalidad });
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (asignatura.length > MAX_ASIGNATURA || observaciones.length > MAX_OBSERVACIONES) {
    return res.status(400).json({ error: `La asignatura admite ${MAX_ASIGNATURA} caracteres y las observaciones ${MAX_OBSERVACIONES}` });
  }

  const idEstudiante = solicitante.rol === 'estudiante' ? solicitante.id : enteroPositivo(req.body.estudiante_id);
  const idDocente    = solicitante.rol === 'docente'    ? solicitante.id : enteroPositivo(req.body.docente_id);
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

  const horaNormal = horaCorta(hora);
  const resultado = await db.transaccion(async (tx) => {
    await bloquearAgenda(tx, idDocente, idEstudiante);

    const choque = await choqueDeHorario(tx, { docenteId: idDocente, estudianteId: idEstudiante, fecha, hora: horaNormal });
    if (choque === 'docente') {
      return { estado: 409, error: solicitante.rol === 'docente' ? 'Ya tienes una tutoría a esa fecha y hora' : 'El docente ya tiene una tutoría a esa hora' };
    }
    if (choque === 'estudiante') {
      return { estado: 409, error: solicitante.rol === 'estudiante' ? 'Ya tienes una tutoría a esa fecha y hora' : 'El estudiante ya tiene una tutoría a esa fecha y hora' };
    }

    const creada = await tx.prepare(
      'INSERT INTO tutorias (estudiante_id, docente_id, asignatura, modalidad, fecha, hora, observaciones) VALUES (?,?,?,?,?,?,?) RETURNING id'
    ).get(idEstudiante, idDocente, asignatura, modalidad, fecha, horaNormal, observaciones);

    await tx.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
      .run(idEstudiante, '📅', 'Tutoría programada', `${asignatura} el ${fecha} a las ${horaNormal}`);
    await tx.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)')
      .run(idDocente, '📅', 'Nueva tutoría asignada', `Sesión de ${asignatura} el ${fecha} a las ${horaNormal}`);

    return { id: creada.id };
  });

  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  res.status(201).json({ mensaje: 'Tutoría programada', id: resultado.id });
}

// Consultas de listado por rol: el estudiante ve las suyas, el docente las suyas con los datos del estudiante y el admin todas.
const LISTADOS = {
  estudiante: {
    columnas: "t.*, u.nombres||' '||u.apellidos AS nombre_docente, u.correo AS correo_docente",
    desde: 'FROM tutorias t JOIN usuarios u ON u.id=t.docente_id WHERE t.estudiante_id=?'
  },
  docente: {
    columnas: "t.*, u.nombres||' '||u.apellidos AS nombre_estudiante, u.correo AS correo_estudiante, pe.programa, pe.semestre, pe.promedio",
    desde: 'FROM tutorias t JOIN usuarios u ON u.id=t.estudiante_id LEFT JOIN perfiles_estudiante pe ON pe.usuario_id=t.estudiante_id WHERE t.docente_id=?'
  },
  admin: {
    columnas: "t.*, e.nombres||' '||e.apellidos AS nombre_estudiante, d.nombres||' '||d.apellidos AS nombre_docente",
    desde: 'FROM tutorias t JOIN usuarios e ON e.id=t.estudiante_id JOIN usuarios d ON d.id=t.docente_id WHERE 1=1'
  }
};

// Lista las tutorías según el rol de quien consulta; el total va en X-Total-Count.
async function listar(req, res) {
  const { id, rol } = req.usuario;
  const listado = LISTADOS[rol];
  const { limite, desplazamiento } = paginacion(req.query, { porDefecto: rol === 'admin' ? 200 : 500, maximo: 500 });
  const params = rol === 'admin' ? [] : [id];

  const [tutorias, total] = await Promise.all([
    db.prepare(`SELECT ${listado.columnas} ${listado.desde} ORDER BY t.fecha DESC, t.hora DESC, t.id DESC LIMIT ? OFFSET ?`)
      .all(...params, limite, desplazamiento),
    db.prepare(`SELECT COUNT(*) AS n ${listado.desde}`).get(...params)
  ]);

  res.set('X-Total-Count', String(parseInt(total?.n || 0)));
  res.json(tutorias);
}

// Cancela una tutoría respetando permisos y la antelación mínima, y avisa a la otra parte.
async function cancelar(req, res) {
  const id = Number(req.params.id);
  const usuario = req.usuario;

  const tutoria = await db.prepare('SELECT * FROM tutorias WHERE id=?').get(id);
  if (!tutoria) return res.status(404).json({ error: 'No encontrada' });

  const puedeCancel = usuario.rol === 'admin' ||
    tutoria.estudiante_id === usuario.id || tutoria.docente_id === usuario.id;

  if (!puedeCancel) return res.status(403).json({ error: 'Sin permiso' });
  if (tutoria.estado === 'cancelada') return res.status(400).json({ error: 'Ya cancelada' });
  if (tutoria.estado === 'completada') return res.status(400).json({ error: 'Una tutoría completada no se puede cancelar' });

  // Antelación mínima para cancelar, tomada de la configuración.
  const horasMinimas = await getConfigNum('RN_HORAS_CANCELACION', 24);

  // La hora guardada es de Colombia; leerla en la zona del servidor (UTC en Railway) corría la regla 5 horas.
  const horas = (instanteColombia(tutoria.fecha, tutoria.hora) - new Date()) / 3600000;

  // Una tutoría que ya pasó no se cancela: el docente la marca como realizada.
  if (horas < 0) {
    return res.status(400).json({
      error: 'Esa tutoría ya pasó, no se puede cancelar. El docente puede marcarla como realizada.'
    });
  }

  if (horas < horasMinimas && usuario.rol !== 'admin') {
    const faltan = Math.max(0, Math.round(horas));
    return res.status(400).json({
      error: `Faltan ${faltan}h para la tutoría y se requieren ${horasMinimas}h de anticipación para cancelar (RN03). Escríbele al docente.`
    });
  }

  // Avisa a la otra parte; si cancela el administrador, a las dos.
  const avisar = [tutoria.estudiante_id, tutoria.docente_id].filter(uid => uid !== usuario.id);

  const cancelada = await db.transaccion(async (tx) => {
    const cambio = await tx.prepare("UPDATE tutorias SET estado='cancelada' WHERE id=? AND estado IN ('pendiente','confirmada')").run(id);
    if (!cambio.rowCount) return false;

    for (const uid of avisar) {
      await tx.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
        uid, '❌', 'Tutoría cancelada: ' + tutoria.asignatura,
        `La sesión del ${tutoria.fecha} a las ${String(tutoria.hora).slice(0, 5)} fue cancelada.`
      );
    }
    return true;
  });

  if (!cancelada) return res.status(409).json({ error: 'La tutoría cambió de estado mientras la cancelabas. Actualiza la página' });
  res.json({ mensaje: 'Tutoría cancelada' });
}

// Marca una tutoría como completada; solo el docente dueño o un admin.
async function marcarRealizada(req, res) {
  const id = Number(req.params.id);
  const usuario = req.usuario;

  if (!['docente', 'admin'].includes(usuario.rol)) {
    return res.status(403).json({ error: 'Solo el docente puede marcar como realizada' });
  }

  const tutoria = await db.prepare('SELECT * FROM tutorias WHERE id=?').get(id);
  if (!tutoria) return res.status(404).json({ error: 'No encontrada' });
  if (usuario.rol === 'docente' && tutoria.docente_id !== usuario.id) {
    return res.status(403).json({ error: 'No es tu tutoría' });
  }

  // Una tutoría cancelada o ya completada no admite más cambios de estado.
  if (!ESTADOS_VIGENTES.includes(tutoria.estado)) {
    return res.status(400).json({ error: `Una tutoría ${tutoria.estado} no se puede marcar como realizada` });
  }

  const cambio = await db.prepare("UPDATE tutorias SET estado='completada' WHERE id=? AND estado IN ('pendiente','confirmada')").run(id);
  if (!cambio.rowCount) return res.status(409).json({ error: 'La tutoría cambió de estado. Actualiza la página' });
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

// Busca estudiantes por nombre o documento para el docente o el administrador.
async function buscarEstudiante(req, res) {
  const texto = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (texto.length < 2) {
    return res.status(400).json({ error: 'Ingresa al menos 2 caracteres' });
  }
  const like = '%' + escaparLike(texto.slice(0, 80)) + '%';
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
