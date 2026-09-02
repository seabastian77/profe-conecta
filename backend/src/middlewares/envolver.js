// Captura de errores en controladores asíncronos.
//
// Express 4 NO atrapa las promesas rechazadas de un handler `async`. Si uno
// lanza —un ReferenceError, la base que se cae, un dato inesperado— la promesa
// queda rechazada sin manejar y Node mata el proceso. Servidor abajo.
//
// Eso fue exactamente lo que pasó con HORAS_CANCELACION en tutoriasController:
// una variable no definida tumbaba TODA la aplicación cada vez que alguien
// cancelaba una tutoría.
//
// `envolver` atrapa el rechazo y lo manda a next(), donde el manejador de
// errores global de app.js responde 500 en JSON. Un error pasa de "se cae el
// sistema" a "esta petición falló".

function envolver(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Envuelve de una vez todas las funciones exportadas por un controlador.
// Así basta cambiar una línea en cada archivo de rutas y quedan protegidos
// todos los handlers, incluidos los que se agreguen después.
//
// Lo que no sean funciones (por ejemplo los arreglos de reglas de
// express-validator) se deja intacto.
function envolverControlador(controlador) {
  const envuelto = {};

  for (const [nombre, valor] of Object.entries(controlador)) {
    envuelto[nombre] = typeof valor === 'function' ? envolver(valor) : valor;
  }

  return envuelto;
}

module.exports = { envolver, envolverControlador };
