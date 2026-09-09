// Atrapa el rechazo de un handler async y lo pasa a next() en vez de tumbar el proceso.
function envolver(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Envuelve todas las funciones de un controlador y deja lo demás intacto.
function envolverControlador(controlador) {
  const envuelto = {};

  for (const [nombre, valor] of Object.entries(controlador)) {
    envuelto[nombre] = typeof valor === 'function' ? envolver(valor) : valor;
  }

  return envuelto;
}

module.exports = { envolver, envolverControlador };
