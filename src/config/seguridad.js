// Centraliza los parámetros de seguridad de contraseñas.
const RONDAS_BCRYPT = 12;
const LONGITUD_MINIMA_CONTRASENA = 8;

// Valida longitud y composición de la contraseña; devuelve el error o null.
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
  return null;
}

module.exports = { RONDAS_BCRYPT, LONGITUD_MINIMA_CONTRASENA, validarContrasena };
