const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { soloRol } = require('../middlewares/soloRol');
const { conIdValidado } = require('../middlewares/validarId');
const { envolverControlador } = require('../middlewares/envolver');
const ctrl = envolverControlador(require('../controllers/tutoriasController'));

router.use(autenticar);
conIdValidado(router);

router.get('/docentes-disponibles', ctrl.docentesDisponibles);
router.get('/buscar-estudiante',    soloRol('docente', 'admin'), ctrl.buscarEstudiante);
router.get('/',                     ctrl.listar);
router.post('/',                    ctrl.programar);
router.patch('/:id/cancelar',       ctrl.cancelar);
router.patch('/:id/realizada',      ctrl.marcarRealizada);

module.exports = router;
