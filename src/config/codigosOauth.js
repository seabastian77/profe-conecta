const crypto = require('crypto');

const VIDA_MS = 60 * 1000;
const codigos = new Map();

// Descarta los códigos ya vencidos del almacén en memoria.
function limpiarVencidos() {
  const ahora = Date.now();
  for (const [codigo, dato] of codigos) {
    if (dato.venceEn <= ahora) codigos.delete(codigo);
  }
}

// Genera un código de un solo uso que expira en 60 segundos.
function crearCodigo(payload) {
  limpiarVencidos();
  const codigo = crypto.randomBytes(32).toString('hex');
  codigos.set(codigo, { payload, venceEn: Date.now() + VIDA_MS });
  return codigo;
}

// Canjea el código por su payload y lo invalida; null si no sirve o venció.
function canjearCodigo(codigo) {
  limpiarVencidos();
  if (typeof codigo !== 'string') return null;
  const dato = codigos.get(codigo);
  if (!dato) return null;
  codigos.delete(codigo);
  if (dato.venceEn <= Date.now()) return null;
  return dato.payload;
}

const temporizador = setInterval(limpiarVencidos, VIDA_MS);
if (temporizador.unref) temporizador.unref();

module.exports = { crearCodigo, canjearCodigo, VIDA_MS };
