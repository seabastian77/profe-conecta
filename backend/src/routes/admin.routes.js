const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { soloRol }    = require('../middlewares/soloRol');
const ctrl = require('../controllers/adminController');

router.use(autenticar, soloRol('admin'));

// Usuarios
router.get('/usuarios',              ctrl.listarUsuarios);
router.post('/usuarios',             ctrl.crearUsuario);
router.patch('/usuarios/:id/estado', ctrl.cambiarEstado);

// Estadísticas
router.get('/estadisticas',          ctrl.estadisticas);

// Notificaciones
router.post('/notificaciones',       ctrl.enviarNotificacion);
router.get('/notificaciones/historial', ctrl.historialNotificaciones);

// Auditoría
router.get('/auditoria',             ctrl.verAuditoria);

// Asignaciones
router.get('/asignaciones',          ctrl.listarAsignaciones);
router.post('/asignaciones',         ctrl.crearAsignacion);
router.delete('/asignaciones/:id',   ctrl.eliminarAsignacion);

// Configuración
router.get('/configuracion',         ctrl.obtenerConfiguracion);
router.post('/configuracion',        ctrl.guardarConfiguracion);
router.post('/configuracion/reset',  ctrl.resetearConfiguracion);

// Períodos
router.get('/periodos',              ctrl.listarPeriodos);
router.post('/periodos',             ctrl.crearPeriodo);
router.patch('/periodos/:id/cerrar', ctrl.cerrarPeriodo);

// Buscar usuario + Programar clase (admin)
router.get('/buscar-usuario',        ctrl.buscarUsuario);
router.post('/programar-clase',      ctrl.programarClase);
router.get('/clases-programadas',    ctrl.listarClasesAdmin);

module.exports = router;
