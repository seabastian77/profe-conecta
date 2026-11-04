// Clasifica los errores técnicos y los traduce a respuestas HTTP claras para el cliente.
const CODIGOS_CONEXION = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '53300'
]);

const TEXTOS_CONEXION = /Connection terminated|timeout exceeded when trying to connect|connection error|database system is (starting up|shutting down)|Client has encountered/i;

// Lee el código del error, incluso cuando viene dentro de un AggregateError.
function codigoDe(err) {
  return err?.code || err?.errors?.[0]?.code;
}

// Indica si el error se debe a que la base de datos no está disponible.
function esErrorDeConexion(err) {
  if (!err) return false;
  if (CODIGOS_CONEXION.has(codigoDe(err))) return true;
  // Un fallo al abrir la conexión, incluso con un código inesperado (por ejemplo ENOENT si falta el socket local).
  if (err.syscall === 'connect' || err.errors?.[0]?.syscall === 'connect') return true;
  return TEXTOS_CONEXION.test(String(err.message || ''));
}

const MENSAJES_PG = {
  '22P02': [400, 'Alguno de los datos tiene un formato no válido'],
  '22003': [400, 'Alguno de los números está fuera del rango permitido'],
  '22001': [400, 'Alguno de los textos es demasiado largo'],
  '23502': [400, 'Falta un dato obligatorio'],
  '23514': [400, 'Alguno de los datos no es válido'],
  '23505': [409, 'Ya existe un registro con esos datos'],
  '23503': [409, 'La operación depende de registros que no existen o que siguen en uso'],
  '40001': [409, 'Otra operación se cruzó con esta. Intenta de nuevo'],
  '40P01': [409, 'Otra operación se cruzó con esta. Intenta de nuevo']
};

const MENSAJES_CUERPO = {
  'entity.parse.failed': [400, 'El cuerpo de la petición no es un JSON válido'],
  'entity.too.large': [413, 'El cuerpo de la petición es demasiado grande'],
  'encoding.unsupported': [415, 'La codificación de la petición no es compatible'],
  'request.aborted': [400, 'La petición se interrumpió antes de terminar']
};

// Devuelve el estado HTTP, el mensaje y si conviene pedir al cliente que reintente.
function describirError(err) {
  if (err?.message === 'Origen no permitido por CORS') {
    return { estado: 403, mensaje: 'Origen no permitido', reintentar: false };
  }
  if (MENSAJES_CUERPO[err?.type]) {
    const [estado, mensaje] = MENSAJES_CUERPO[err.type];
    return { estado, mensaje, reintentar: false };
  }
  if (esErrorDeConexion(err)) {
    return { estado: 503, mensaje: 'El servicio de datos no está disponible en este momento. Intenta de nuevo en unos segundos', reintentar: true };
  }
  if (err?.code === '57014') {
    return { estado: 503, mensaje: 'La consulta tardó demasiado. Intenta de nuevo', reintentar: true };
  }
  if (MENSAJES_PG[err?.code]) {
    const [estado, mensaje] = MENSAJES_PG[err.code];
    return { estado, mensaje, reintentar: false };
  }
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
    return { estado: err.status, mensaje: 'La petición no es válida', reintentar: false };
  }
  return { estado: 500, mensaje: 'Error interno del servidor', reintentar: false };
}

module.exports = { esErrorDeConexion, describirError, codigoDe };
