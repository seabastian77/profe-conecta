// Límites de peticiones (rate limiting).
//
// Sin esto, un atacante puede lanzar miles de intentos de login por minuto
// contra el endpoint /api/auth/login y probar contraseñas hasta acertar.

const rateLimit = require('express-rate-limit');

const mensaje = (texto) => ({ error: texto });

// Login y registro: lo más sensible. 10 intentos cada 15 minutos por IP.
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // solo cuentan los intentos fallidos
  message: mensaje('Demasiados intentos. Espera unos minutos y vuelve a probar.')
});

// Resto de la API: generoso, solo frena abusos evidentes.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas peticiones. Espera un momento.')
});

// Subida de fotos: son base64 pesados, conviene apretar más.
const limiteSubida = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: mensaje('Demasiadas subidas seguidas. Espera unos minutos.')
});

module.exports = { limiteAuth, limiteGeneral, limiteSubida };
