const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const ctrl = require('../controllers/tutoriasController');

router.use(autenticar);

router.get('/docentes-disponibles', ctrl.docentesDisponibles);
router.get('/buscar-estudiante',    ctrl.buscarEstudiante);
router.get('/',                     ctrl.listar);
router.post('/',                    ctrl.programar);
router.patch('/:id/cancelar',       ctrl.cancelar);
router.patch('/:id/realizada',      ctrl.marcarRealizada);

module.exports = router;
