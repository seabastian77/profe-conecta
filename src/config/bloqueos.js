// Claves de los bloqueos de aviso de PostgreSQL: cada tipo de recurso que se serializa tiene la suya.
const CLAVES = Object.freeze({
  MIGRACION: 7000,
  ADMINISTRADORES: 7001,
  AGENDA_DOCENTE: 7002,
  AGENDA_ESTUDIANTE: 7003,
  CUPO_TUTOR: 7004,
  PERIODOS: 7005
});

// Hace esperar a las demás transacciones sobre el mismo recurso hasta que esta termine; siempre se pide en orden ascendente de clave.
function bloquear(tx, clave, id = 0) {
  return tx.prepare('SELECT pg_advisory_xact_lock(?, ?)').get(clave, id);
}

module.exports = { CLAVES, bloquear };
