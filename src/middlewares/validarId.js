const { enteroPositivo } = require('../config/validaciones');

// Valida que un parámetro de ruta sea un entero positivo y lo deja como número en req.params.
function validarId(req, res, next, valor, nombre) {
  const id = enteroPositivo(valor);
  if (id === null) {
    return res.status(400).json({ error: `El identificador «${nombre}» no es válido` });
  }
  req.params[nombre] = id;
  next();
}

// Registra la validación sobre el parámetro :id de un router.
function conIdValidado(router, nombre = 'id') {
  router.param(nombre, validarId);
  return router;
}

module.exports = { validarId, conIdValidado };
