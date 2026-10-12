const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { envolver } = require('../middlewares/envolver');
const { obtenerReglas } = require('../config/config');

// Entrega a cualquier usuario con sesión las reglas vigentes, para que la pantalla aplique las mismas que el servidor.
router.get('/', autenticar, envolver(async (req, res) => {
  const reglas = await obtenerReglas();
  res.json({
    PROMEDIO_MINIMO: reglas.RN_PROMEDIO_MINIMO,
    HORAS_CANCELACION: reglas.RN_HORAS_CANCELACION,
    MAX_ESTUDIANTES: reglas.RN_MAX_ESTUDIANTES,
    MINUTOS_INACTIVIDAD: reglas.RN_MINUTOS_SESION,
  });
}));

module.exports = router;
