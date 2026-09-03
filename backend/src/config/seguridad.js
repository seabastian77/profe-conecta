// Parámetros de seguridad, en un solo sitio.
//
// Antes estos valores estaban repetidos en varios archivos y se habían
// desincronizado sin que nadie lo notara: el registro exigía 8 caracteres y
// hasheaba con 12 rondas, mientras que la edición de usuarios del panel admin
// aceptaba 6 caracteres y hasheaba con 10. Un administrador podía asignar,
// sin querer, una contraseña más débil de lo que el propio requisito RF005
// permite. Duplicar una constante es duplicar la posibilidad de equivocarse.

// Coste de bcrypt. Cada ronda extra duplica el tiempo de cómputo, lo que
// encarece un ataque por fuerza bruta sobre las contraseñas robadas.
const RONDAS_BCRYPT = 12;

// RF005: el sistema debe rechazar contraseñas con menos de 8 caracteres.
const LONGITUD_MINIMA_CONTRASENA = 8;

// Debe coincidir con las reglas del frontend (js/auth.js). Si divergen, el
// usuario recibe del servidor un error que el navegador debió explicarle antes.
function validarContrasena(contrasena) {
  if (!contrasena || contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    return `La contraseña debe tener mínimo ${LONGITUD_MINIMA_CONTRASENA} caracteres`;
  }
  if (!/[A-Za-z]/.test(contrasena)) {
    return 'La contraseña debe incluir al menos una letra';
  }
  if (!/[0-9]/.test(contrasena)) {
    return 'La contraseña debe incluir al menos un número';
  }
  return null; // válida
}

module.exports = { RONDAS_BCRYPT, LONGITUD_MINIMA_CONTRASENA, validarContrasena };
