const { db } = require('../../config/db');
const { CLAVES, bloquear } = require('../../config/bloqueos');
const { auditar } = require('../../config/auditoria');
const { errorDatosSesion } = require('../../config/fechas');
const { horaCorta, bloquearAgenda, choqueDeHorario } = require('../../config/agenda');
const { docenteDictaAsignatura, errorCupoTutor } = require('../../config/reglasTutoria');
const { enteroPositivo, paginacion } = require('../../config/validaciones');

const MAX_ASIGNATURA = 120;
const MAX_OBSERVACIONES = 500;

// Lee un texto del cuerpo: devuelve el texto recortado, '' si falta o null si no es un texto.
function leerTexto(valor) {
  if (valor === undefined || valor === null) return '';
  return typeof valor === 'string' ? valor.trim() : null;
}

// Crea la tutoría confirmada, la asignación si falta, el registro del historial y las dos notificaciones.
async function registrarClase(tx, datos) {
  const { docente, estudiante, asignatura, fecha, hora, modalidad, observaciones, programadoPor } = datos;

  await bloquearAgenda(tx, docente.id, estudiante.id);
  await bloquear(tx, CLAVES.CUPO_TUTOR, docente.id);

  const choque = await choqueDeHorario(tx, { docenteId: docente.id, estudianteId: estudiante.id, fecha, hora });
  if (choque === 'docente') return { estado: 409, error: 'El docente ya tiene una sesión a esa fecha y hora' };
  if (choque === 'estudiante') return { estado: 409, error: 'El estudiante ya tiene una sesión a esa fecha y hora' };

  const errorCupo = await errorCupoTutor(docente.id, estudiante.id, tx);
  if (errorCupo) return { estado: 409, error: errorCupo };

  const tutoria = await tx.prepare(`
    INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, modalidad, estado, observaciones)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id
  `).get(estudiante.id, docente.id, asignatura, fecha, hora, modalidad, 'confirmada', observaciones);

  const asignada = await tx.prepare("SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'").get(estudiante.id, docente.id);
  if (!asignada) await tx.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?)').run(estudiante.id, docente.id);

  await tx.prepare('INSERT INTO clases_admin (docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones, programado_por) VALUES (?,?,?,?,?,?,?,?)')
    .run(docente.id, estudiante.id, asignatura, fecha, hora, modalidad, observaciones, programadoPor);

  const cuando = `${fecha} a las ${hora}`;
  const nota = observaciones ? ' Nota: ' + observaciones : '';
  await tx.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    docente.id, '📅', 'Nueva asesoría: ' + asignatura,
    `Sesión programada con ${estudiante.nombres} ${estudiante.apellidos} el ${cuando}. Modalidad: ${modalidad}.${nota}`
  );
  await tx.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    estudiante.id, '📅', 'Asesoría programada: ' + asignatura,
    `El administrador programó una sesión con ${docente.nombres} ${docente.apellidos} el ${cuando}. Modalidad: ${modalidad}.${nota}`
  );

  return { tutoriaId: tutoria.id };
}

// Programa una asesoría entre docente y estudiante y notifica a ambos; todo se guarda junto o no se guarda.
async function programarClase(req, res) {
  const docenteId = enteroPositivo(req.body.docente_id);
  const estudianteId = enteroPositivo(req.body.estudiante_id);
  const asignatura = leerTexto(req.body.asignatura);
  const observaciones = leerTexto(req.body.observaciones);
  const { fecha, modalidad } = req.body;
  const hora = typeof req.body.hora === 'string' ? req.body.hora.trim() : req.body.hora;

  if (!docenteId || !estudianteId || !asignatura || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: docente, estudiante, materia, fecha y hora' });
  }
  if (observaciones === null) return res.status(400).json({ error: 'Las observaciones deben ser un texto' });

  // RRN06 también aplica a las asesorías del admin: antes se creaban para hoy y hasta para fechas pasadas.
  const errorDatos = errorDatosSesion({ fecha, hora, modalidad });
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (asignatura.length > MAX_ASIGNATURA || observaciones.length > MAX_OBSERVACIONES) {
    return res.status(400).json({ error: `La materia admite ${MAX_ASIGNATURA} caracteres y las observaciones ${MAX_OBSERVACIONES}` });
  }

  const docente = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(docenteId);
  const estudiante = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(estudianteId);
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado o inactivo' });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado o inactivo' });

  // La materia tiene que ser una de las que el docente registró en su perfil.
  if (!(await docenteDictaAsignatura(docente.id, asignatura))) {
    return res.status(400).json({ error: `${docente.nombres} ${docente.apellidos} no tiene registrada la materia ${asignatura}` });
  }

  const resultado = await db.transaccion((tx) => registrarClase(tx, {
    docente, estudiante, asignatura, fecha, observaciones,
    hora: horaCorta(hora),
    modalidad: modalidad || 'Virtual',
    programadoPor: req.usuario.id
  }));
  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });

  await auditar(req, 'ASESORIA_PROGRAMADA', `Tutoría #${resultado.tutoriaId}: ${asignatura} — Doc ${docenteId} + Est ${estudianteId}`);
  res.json({
    mensaje: `Asesoría creada. Se notificó a ${docente.nombres} ${docente.apellidos} y a ${estudiante.nombres} ${estudiante.apellidos}.`,
    tutoria_id: resultado.tutoriaId
  });
}

// Lista las clases programadas por el administrador, las más recientes primero; el total va en X-Total-Count.
async function listarClasesAdmin(req, res) {
  const { limite, desplazamiento } = paginacion(req.query, { porDefecto: 100, maximo: 200 });
  const [clases, total] = await Promise.all([
    db.prepare(`
      SELECT ca.id, ca.asignatura, ca.fecha, ca.hora, ca.modalidad, ca.observaciones, ca.creada_en,
             ud.nombres||' '||ud.apellidos AS nombre_docente,
             ue.nombres||' '||ue.apellidos AS nombre_estudiante,
             ua.nombres||' '||ua.apellidos AS programado_por_nombre
      FROM clases_admin ca
      JOIN usuarios ud ON ud.id = ca.docente_id
      JOIN usuarios ue ON ue.id = ca.estudiante_id
      LEFT JOIN usuarios ua ON ua.id = ca.programado_por
      ORDER BY ca.fecha DESC, ca.hora DESC, ca.id DESC
      LIMIT ? OFFSET ?
    `).all(limite, desplazamiento),
    db.prepare('SELECT COUNT(*) AS n FROM clases_admin').get()
  ]);
  res.set('X-Total-Count', String(parseInt(total?.n || 0)));
  res.json(clases);
}

module.exports = { programarClase, listarClasesAdmin };
