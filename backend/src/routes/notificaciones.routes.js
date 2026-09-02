const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { envolverControlador } = require('../middlewares/envolver');
// envolverControlador hace que un error en cualquier handler async
// devuelva 500 en vez de tumbar el proceso entero.
const ctrl = envolverControlador(require('../controllers/notificacionesController'));

router.use(autenticar);

router.get('/',                  ctrl.listar);
router.patch('/:id/leer',        ctrl.marcarLeida);
router.patch('/leer-todas',      ctrl.marcarTodasLeidas);

module.exports = router;
