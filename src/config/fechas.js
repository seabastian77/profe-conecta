// Centraliza fechas y horas en la zona de Colombia, que no tiene horario de verano.
const DESFASE_COLOMBIA = '-05:00';
const HORAS_DESFASE = 5;
const MODALIDADES = ['Presencial', 'Virtual', 'Híbrida'];

// Indica si el texto es una fecha que existe, con formato AAAA-MM-DD.
function esFechaValida(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Indica si el texto es una hora que existe, con formato HH:MM (los segundos son opcionales).
function esHoraValida(hora) {
  return typeof hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(hora);
}

// Convierte fecha y hora de Colombia en un instante, sin depender de la zona del servidor.
function instanteColombia(fecha, hora) {
  const conSegundos = String(hora).length === 5 ? `${hora}:00` : hora;
  return new Date(`${fecha}T${conSegundos}${DESFASE_COLOMBIA}`);
}

// Devuelve la fecha de hoy en Colombia como AAAA-MM-DD.
function hoyColombia(ahora = new Date()) {
  return new Date(ahora.getTime() - HORAS_DESFASE * 3600000).toISOString().slice(0, 10);
}

// Valida fecha, hora y modalidad de una sesión y aplica RRN06 (desde mañana); devuelve el error o null.
function errorDatosSesion({ fecha, hora, modalidad }) {
  if (!esFechaValida(fecha)) return 'La fecha no es válida (formato AAAA-MM-DD)';
  if (!esHoraValida(hora)) return 'La hora no es válida (formato HH:MM)';
  if (fecha <= hoyColombia()) return 'La fecha debe ser a partir de mañana (RN06)';
  if (modalidad !== undefined && modalidad !== null && modalidad !== '' && !MODALIDADES.includes(modalidad)) {
    return 'Modalidad inválida: usa Presencial, Virtual o Híbrida';
  }
  return null;
}

module.exports = { MODALIDADES, esFechaValida, esHoraValida, instanteColombia, hoyColombia, errorDatosSesion };
