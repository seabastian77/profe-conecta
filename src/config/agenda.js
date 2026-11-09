const { CLAVES, bloquear } = require('./bloqueos');

// Deja la hora en HH:MM, que es como se guarda y se compara.
function horaCorta(hora) {
  return String(hora ?? '').trim().slice(0, 5);
}

// Bloquea la agenda del docente y del estudiante hasta que termine la transacción, para que dos reservas no se crucen.
async function bloquearAgenda(tx, docenteId, estudianteId) {
  await bloquear(tx, CLAVES.AGENDA_DOCENTE, docenteId);
  await bloquear(tx, CLAVES.AGENDA_ESTUDIANTE, estudianteId);
}

// Indica quién ya tiene una tutoría vigente a esa fecha y hora: 'docente', 'estudiante' o null si ambos están libres.
async function choqueDeHorario(tx, { docenteId, estudianteId, fecha, hora }) {
  const sql = "SELECT id FROM tutorias WHERE %COLUMNA% = ? AND fecha = ? AND substr(hora, 1, 5) = ? AND estado <> 'cancelada' LIMIT 1";
  const docente = await tx.prepare(sql.replace('%COLUMNA%', 'docente_id')).get(docenteId, fecha, hora);
  if (docente) return 'docente';
  const estudiante = await tx.prepare(sql.replace('%COLUMNA%', 'estudiante_id')).get(estudianteId, fecha, hora);
  return estudiante ? 'estudiante' : null;
}

module.exports = { horaCorta, bloquearAgenda, choqueDeHorario };
