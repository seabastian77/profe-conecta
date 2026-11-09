const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { conIdValidado } = require('../middlewares/validarId');
const { envolverControlador } = require('../middlewares/envolver');
const ctrl = envolverControlador(require('../controllers/notificacionesController'));

router.use(autenticar);
conIdValidado(router);

router.get('/',                  ctrl.listar);
router.patch('/leer-todas',      ctrl.marcarTodasLeidas);
router.patch('/:id/leer',        ctrl.marcarLeida);

module.exports = router;
