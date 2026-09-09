const crypto = require('crypto');

const VIDA_MS = 60 * 1000; // 60 segundos
const codigos = new Map();

function limpiarVencidos() {
  const ahora = Date.now();
  for (const [codigo, dato] of codigos) {
    if (dato.venceEn <= ahora) codigos.delete(codigo);
  }
}

function crearCodigo(payload) {
  limpiarVencidos();
  const codigo = crypto.randomBytes(32).toString('hex');
  codigos.set(codigo, { payload, venceEn: Date.now() + VIDA_MS });
  return codigo;
}


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
