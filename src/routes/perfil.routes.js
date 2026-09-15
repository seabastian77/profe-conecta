const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { soloRol } = require('../middlewares/soloRol');
const { envolverControlador } = require('../middlewares/envolver');
const ctrl = envolverControlador(require('../controllers/perfilController'));

// Todas las rutas de perfil requieren estar autenticado
router.use(autenticar);

router.get('/',               ctrl.obtenerPerfil);
router.post('/estudiante',    soloRol('estudiante'), ctrl.guardarPerfilEstudiante);
router.post('/docente',       soloRol('docente'),    ctrl.guardarPerfilDocente);
router.post('/admin',         soloRol('admin'),      ctrl.guardarPerfilAdmin);
router.post('/foto',          ctrl.subirFoto);

module.exports = router;
