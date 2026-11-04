// Define los límites de peticiones (rate limiting) por tipo de endpoint.
const rateLimit = require('express-rate-limit');

const mensaje = (texto) => ({ error: texto });

// Login y registro: 10 intentos fallidos cada 15 minutos por IP.
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensaje('Demasiados intentos. Espera unos minutos y vuelve a probar.')
});

// Recuperación de contraseña: cuenta todas las solicitudes, porque cada una avisa a los administradores.
const limiteRecuperacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Ya enviaste varias solicitudes. Espera unos minutos y vuelve a intentar.')
});

// Creación de cuentas: cuenta también los registros exitosos para frenar la creación masiva desde una IP.
const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Se crearon muchas cuentas desde esta conexión. Espera un rato e intenta de nuevo.')
});

// Resto de la API: límite amplio contra abusos evidentes.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas peticiones. Espera un momento.')
});

// Subida de fotos: límite más estricto por el peso del base64.
const limiteSubida = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas subidas seguidas. Espera unos minutos.')
});

module.exports = { limiteAuth, limiteGeneral, limiteSubida, limiteRecuperacion, limiteRegistro };
