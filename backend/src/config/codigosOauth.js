// Códigos de un solo uso para el retorno de Google OAuth.
//
// Por qué existe esto: antes el callback redirigía a
//   /?token=eyJhbGciOi...&correo=...&rol=admin
// Un JWT en la barra de direcciones queda registrado en el historial del
// navegador, en los logs del servidor, en la cabecera Referer que se manda a
// terceros y en cualquier extensión instalada. Es una fuga de credenciales.
//
// Ahora el callback redirige con un código corto de un solo uso, y el frontend
// lo cambia por el token mediante un POST. El token nunca aparece en una URL.
//
// El almacén es en memoria: suficiente para una instancia (como en Railway) y
// los códigos viven 60 segundos. Si algún día corren varias instancias, esto
// debe moverse a la tabla de la base de datos o a Redis.

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

// Devuelve el payload y borra el código: un código sirve exactamente una vez.
function canjearCodigo(codigo) {
  limpiarVencidos();
  if (typeof codigo !== 'string') return null;
  const dato = codigos.get(codigo);
  if (!dato) return null;
  codigos.delete(codigo);
  if (dato.venceEn <= Date.now()) return null;
  return dato.payload;
}

// Barrido periódico para que el Map no crezca si nadie canjea.
// unref() evita que este temporizador mantenga vivo el proceso.
const temporizador = setInterval(limpiarVencidos, VIDA_MS);
if (temporizador.unref) temporizador.unref();

module.exports = { crearCodigo, canjearCodigo, VIDA_MS };
