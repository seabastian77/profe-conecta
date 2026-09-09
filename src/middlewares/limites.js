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

module.exports = { limiteAuth, limiteGeneral, limiteSubida };
