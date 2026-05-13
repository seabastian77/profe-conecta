const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const ctrl = require('../controllers/notificacionesController');

router.use(autenticar);

router.get('/',                  ctrl.listar);
router.patch('/:id/leer',        ctrl.marcarLeida);
router.patch('/leer-todas',      ctrl.marcarTodasLeidas);

module.exports = router;
