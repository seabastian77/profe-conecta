const { db } = require('./db');
const { getConfigNum } = require('./config');

// Indica si la asignatura está entre las que el docente registró en su perfil.
async function docenteDictaAsignatura(docenteUsuarioId, asignatura) {
  const fila = await db.prepare(`
    SELECT 1 AS si
    FROM docente_asignaturas da
    JOIN perfiles_docente pd ON pd.id = da.docente_id
    JOIN asignaturas a ON a.id = da.asignatura_id
    WHERE pd.usuario_id = ? AND lower(a.nombre) = lower(?)
  `).get(docenteUsuarioId, String(asignatura || '').trim());
  return Boolean(fila);
}

// Devuelve el error si el tutor ya llegó al máximo de estudiantes configurado, o null si el estudiante cabe.
async function errorCupoTutor(docenteId, estudianteId) {
  const yaAsignado = await db.prepare(
    "SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'"
  ).get(estudianteId, docenteId);
  if (yaAsignado) return null;

  const maximo = await getConfigNum('RN_MAX_ESTUDIANTES', 15);
  const fila = await db.prepare(
    "SELECT COUNT(DISTINCT estudiante_id) AS n FROM asignaciones WHERE docente_id=? AND estado='activa'"
  ).get(docenteId);
  const actuales = parseInt(fila?.n || 0);
  return actuales >= maximo
    ? `El tutor ya tiene ${actuales} estudiante(s) asignado(s) y el máximo configurado es ${maximo}`
    : null;
}

// Umbral de alerta académica configurado por el administrador (RRN07).
function umbralAlerta() {
  return getConfigNum('RN_PROMEDIO_MINIMO', 3.0);
}

// Condición SQL de alerta: promedio registrado y por debajo del umbral, que va como parámetro.
function condicionAlerta(columna) {
  return `${columna} > 0 AND ${columna} < ?`;
}

module.exports = { docenteDictaAsignatura, errorCupoTutor, umbralAlerta, condicionAlerta };
