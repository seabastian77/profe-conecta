const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const ctrl = require('../controllers/perfilController');

// Todas las rutas de perfil requieren estar autenticado
router.use(autenticar);

router.get('/',               ctrl.obtenerPerfil);
router.post('/estudiante',    ctrl.guardarPerfilEstudiante);
router.post('/docente',       ctrl.guardarPerfilDocente);
router.post('/admin',         ctrl.guardarPerfilAdmin);
router.post('/foto',          ctrl.subirFoto);

module.exports = router;
