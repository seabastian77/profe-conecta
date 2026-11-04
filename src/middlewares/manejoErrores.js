const crypto = require('crypto');
const { describirError } = require('../config/errores');

const esProd = process.env.NODE_ENV === 'production';

// Responde 404 en JSON a las rutas de la API que no existen.
function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

// Convierte cualquier error en una respuesta JSON controlada y sin detalles internos en producción.
function manejarErrores(err, req, res, next) {
  const { estado, mensaje, reintentar } = describirError(err);
  const esFalloDelServidor = estado >= 500;
  const referencia = estado === 500 ? crypto.randomBytes(3).toString('hex') : undefined;

  if (esFalloDelServidor) {
    console.error('Error no manejado:', {
      referencia,
      ruta: `${req.method} ${req.originalUrl}`,
      codigo: err?.code,
      mensaje: err?.message,
      stack: esProd ? undefined : err?.stack
    });
  }

  if (res.headersSent) return next(err);

  const cuerpo = { error: !esProd && estado === 500 ? (err?.message || mensaje) : mensaje };
  if (referencia) cuerpo.referencia = referencia;
  if (reintentar) res.set('Retry-After', '5');

  res.status(estado).json(cuerpo);
}

module.exports = { rutaNoEncontrada, manejarErrores };
