const { db } = require('../../config/db');
const { CLAVES, bloquear } = require('../../config/bloqueos');
const { auditar } = require('../../config/auditoria');
const { errorCupoTutor } = require('../../config/reglasTutoria');
const { enteroPositivo, paginacion } = require('../../config/validaciones');

// Lista las asignaciones activas de estudiante a docente; el total va en X-Total-Count.
async function listarAsignaciones(req, res) {
  const { limite, desplazamiento } = paginacion(req.query, { porDefecto: 500, maximo: 500 });
  const [filas, total] = await Promise.all([
    db.prepare(`
      SELECT a.id, a.estado, a.creada_en,
             ue.nombres||' '||ue.apellidos AS nombre_estudiante, pe.programa, pe.promedio,
             ud.nombres||' '||ud.apellidos AS nombre_docente
      FROM asignaciones a
      JOIN usuarios ue ON ue.id = a.estudiante_id
      JOIN usuarios ud ON ud.id = a.docente_id
      LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = a.estudiante_id
      WHERE a.estado = 'activa'
      ORDER BY a.creada_en DESC, a.id DESC LIMIT ? OFFSET ?
    `).all(limite, desplazamiento),
    db.prepare("SELECT COUNT(*) AS n FROM asignaciones WHERE estado = 'activa'").get()
  ]);
  res.set('X-Total-Count', String(parseInt(total?.n || 0)));
  res.json(filas);
}

// Crea una asignación si ambos existen con su rol y el tutor aún tiene cupo, sin que dos a la vez superen el máximo.
async function crearAsignacion(req, res) {
  const estudianteId = enteroPositivo(req.body.estudiante_id);
  const docenteId = enteroPositivo(req.body.docente_id);
  if (!estudianteId || !docenteId) return res.status(400).json({ error: 'Faltan datos' });

  const resultado = await db.transaccion(async (tx) => {
    await bloquear(tx, CLAVES.CUPO_TUTOR, docenteId);

    const estudiante = await tx.prepare("SELECT id FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(estudianteId);
    if (!estudiante) return { estado: 404, error: 'Estudiante no encontrado o inactivo' };
    const docente = await tx.prepare("SELECT id FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(docenteId);
    if (!docente) return { estado: 404, error: 'Docente no encontrado o inactivo' };

    const existe = await tx.prepare("SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'").get(estudianteId, docenteId);
    if (existe) return { estado: 409, error: 'Ya existe esta asignación' };

    const errorCupo = await errorCupoTutor(docenteId, estudianteId, tx);
    if (errorCupo) return { estado: 409, error: errorCupo };

    const creada = await tx.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?) RETURNING id').get(estudianteId, docenteId);
    return { id: creada.id };
  });

  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  await auditar(req, 'ASIGNACION_CREADA', 'Est ' + estudianteId + ' → Doc ' + docenteId);
  res.json({ mensaje: 'Asignación creada', id: resultado.id });
}

// Marca una asignación activa como removida.
async function eliminarAsignacion(req, res) {
  const id = Number(req.params.id);
  const resultado = await db.prepare("UPDATE asignaciones SET estado='removida' WHERE id=? AND estado='activa'").run(id);
  if (!resultado.rowCount) return res.status(404).json({ error: 'La asignación no existe o ya estaba removida' });

  await auditar(req, 'ASIGNACION_ELIMINADA', 'ID ' + id);
  res.json({ mensaje: 'Asignación eliminada' });
}

module.exports = { listarAsignaciones, crearAsignacion, eliminarAsignacion };
