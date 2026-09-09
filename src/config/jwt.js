const jwt = require('jsonwebtoken');

const esProd = process.env.NODE_ENV === 'production';

// Exige JWT_SECRET en producción: sin él el servidor no arranca.
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

// En desarrollo usa un secreto aleatorio por arranque.
const CLAVE = SECRETO || require('crypto').randomBytes(48).toString('hex');

const EXPIRA   = process.env.JWT_EXPIRES_IN || '8h';
const EMISOR   = 'conectaprofe';
const AUDIENCIA = 'conectaprofe-app';

// Firma un token con los datos del usuario, emisor y audiencia fijos.
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

// Verifica el token con algoritmo fijo HS256 para bloquear el ataque "none".
function verificarToken(token) {
  return jwt.verify(token, CLAVE, {
    algorithms: ['HS256'],
    issuer:     EMISOR,
    audience:   AUDIENCIA
  });
}

module.exports = { generarToken, verificarToken };
