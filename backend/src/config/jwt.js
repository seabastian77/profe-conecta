const jwt = require('jsonwebtoken');

const esProd = process.env.NODE_ENV === 'production';

// ── Secreto ──────────────────────────────────────────────
// En producción NO hay fallback: si falta JWT_SECRET el servidor no arranca.
// Un secreto por defecto y público significa que cualquiera puede firmar
// un token de admin válido. Es preferible caerse al arrancar que quedar abierto.
const SECRETO = process.env.JWT_SECRET;

if (!SECRETO) {
  if (esProd) {
    throw new Error(
      'JWT_SECRET no está definido. Genéralo con:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
      'y cárgalo como variable de entorno antes de desplegar.'
    );
  }
  console.warn('⚠️  JWT_SECRET no definido — usando secreto efímero de desarrollo.');
}

// En desarrollo se genera uno aleatorio por arranque: nunca hay un valor
// conocido en el repositorio, y reiniciar invalida los tokens viejos.
const CLAVE = SECRETO || require('crypto').randomBytes(48).toString('hex');

const EXPIRA   = process.env.JWT_EXPIRES_IN || '8h';
const EMISOR   = 'conectaprofe';
const AUDIENCIA = 'conectaprofe-app';

function generarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
    CLAVE,
    {
      expiresIn: EXPIRA,
      issuer:    EMISOR,
      audience:  AUDIENCIA,
      algorithm: 'HS256'
    }
  );
}

function verificarToken(token) {
  // algorithms fijo: evita el ataque de cambiar el algoritmo a "none".
  return jwt.verify(token, CLAVE, {
    algorithms: ['HS256'],
    issuer:     EMISOR,
    audience:   AUDIENCIA
  });
}

module.exports = { generarToken, verificarToken };
