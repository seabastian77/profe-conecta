// Reúne las validaciones y utilidades de entrada que comparten los controladores.
const NOMBRE_PERSONA = /^[\p{L}\p{M}\s'.-]{1,80}$/u;
const TEXTO_SEGURO = /^[^<>"`\\\u0000-\u001f]*$/;
const CORREO = /^[^\s@<>"'`\\]+@[^\s@<>"'`\\]+\.[^\s@<>"'`\\]+$/;
const MAX_BYTES_CONTRASENA = 72;
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 200;
const ENTERO_MAXIMO = 2147483647;

// Devuelve el entero positivo (hasta el máximo de INTEGER en PostgreSQL) que representa el valor, o null si no lo es.
function enteroPositivo(valor) {
  const numero = typeof valor === 'number' ? valor : (/^\d{1,10}$/.test(String(valor ?? '')) ? Number(valor) : NaN);
  return Number.isInteger(numero) && numero > 0 && numero <= ENTERO_MAXIMO ? numero : null;
}

// Deja el correo sin espacios y en minúsculas, que es como se guarda y se compara.
function normalizarCorreo(correo) {
  return String(correo ?? '').trim().toLowerCase();
}

// Indica si el texto tiene forma de correo y una longitud razonable.
function correoValido(correo) {
  return typeof correo === 'string' && correo.length <= 120 && CORREO.test(correo);
}

// Indica si el texto es un nombre o apellido admitido.
function nombrePersonaValido(texto) {
  return typeof texto === 'string' && NOMBRE_PERSONA.test(texto.trim());
}

// Indica si el valor es un texto de la longitud pedida y sin caracteres que terminarían como HTML.
function textoSeguro(valor, { min = 0, max = 80 } = {}) {
  if (typeof valor !== 'string') return false;
  const limpio = valor.trim();
  return limpio.length >= min && limpio.length <= max && TEXTO_SEGURO.test(limpio);
}

// Indica si la contraseña cabe en los 72 bytes que bcrypt realmente usa.
function contrasenaDentroDelLimite(contrasena) {
  return Buffer.byteLength(String(contrasena ?? ''), 'utf8') <= MAX_BYTES_CONTRASENA;
}

// Escapa los comodines de LIKE para que la búsqueda trate % y _ como texto normal.
function escaparLike(valor) {
  return String(valor ?? '').replace(/[\\%_]/g, '\\$&');
}

// Lee limite y pagina de la consulta y calcula el desplazamiento, con topes para evitar respuestas enormes.
function paginacion(consulta, { porDefecto = LIMITE_POR_DEFECTO, maximo = LIMITE_MAXIMO } = {}) {
  const limite = Math.min(enteroPositivo(consulta?.limite) || porDefecto, maximo);
  const pagina = enteroPositivo(consulta?.pagina) || 1;
  return { limite, pagina, desplazamiento: (pagina - 1) * limite };
}

module.exports = {
  NOMBRE_PERSONA, MAX_BYTES_CONTRASENA, enteroPositivo, normalizarCorreo, correoValido,
  nombrePersonaValido, textoSeguro, contrasenaDentroDelLimite, escaparLike, paginacion
};
