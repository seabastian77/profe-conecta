const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const ctrl = require('../controllers/asignaturasController');

router.get('/todas',  autenticar, ctrl.listarTodas);
router.get('/areas',  autenticar, ctrl.listarPorAreas);
router.get('/',       autenticar, ctrl.buscar);
router.post('/',      autenticar, ctrl.crearOBuscar);

module.exports = router;
