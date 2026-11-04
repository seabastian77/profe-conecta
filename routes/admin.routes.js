const router = require('express').Router();
const { autenticar } = require('../middlewares/autenticar');
const { soloRol }    = require('../middlewares/soloRol');
const { conIdValidado } = require('../middlewares/validarId');
const { envolverControlador } = require('../middlewares/envolver');

const usuarios      = envolverControlador(require('../controllers/admin/usuariosController'));
const panel         = envolverControlador(require('../controllers/admin/panelController'));
const notificaciones = envolverControlador(require('../controllers/admin/notificacionesAdminController'));
const auditoria     = envolverControlador(require('../controllers/admin/auditoriaController'));
const asignaciones  = envolverControlador(require('../controllers/admin/asignacionesController'));
const configuracion = envolverControlador(require('../controllers/admin/configuracionController'));
const periodos      = envolverControlador(require('../controllers/admin/periodosController'));
const clases        = envolverControlador(require('../controllers/admin/clasesController'));

router.use(autenticar, soloRol('admin'));
conIdValidado(router);

// Usuarios
router.get('/usuarios',              usuarios.listarUsuarios);
router.post('/usuarios',             usuarios.crearUsuario);
router.put('/usuarios/:id',          usuarios.actualizarUsuario);
router.patch('/usuarios/:id/estado', usuarios.cambiarEstado);
router.delete('/usuarios/:id',       usuarios.eliminarUsuario);
router.get('/buscar-usuario',        usuarios.buscarUsuario);

// Estadísticas y reportes
router.get('/estadisticas',          panel.estadisticas);
router.get('/reportes',              panel.reportes);
router.get('/programas',             panel.listarProgramas);

// Notificaciones
router.post('/notificaciones',          notificaciones.enviarNotificacion);
router.get('/notificaciones/historial', notificaciones.historialNotificaciones);

// Auditoría
router.get('/auditoria',             auditoria.verAuditoria);
router.post('/auditoria/archivar',   auditoria.archivarAuditoria);

// Asignaciones
router.get('/asignaciones',          asignaciones.listarAsignaciones);
router.post('/asignaciones',         asignaciones.crearAsignacion);
router.delete('/asignaciones/:id',   asignaciones.eliminarAsignacion);

// Configuración
router.get('/configuracion',         configuracion.obtenerConfiguracion);
router.post('/configuracion',        configuracion.guardarConfiguracion);
router.post('/configuracion/reset',  configuracion.resetearConfiguracion);

// Períodos
router.get('/periodos',               periodos.listarPeriodos);
router.post('/periodos',              periodos.crearPeriodo);
router.patch('/periodos/:id/cerrar',  periodos.cerrarPeriodo);
router.patch('/periodos/:id/activar', periodos.activarPeriodo);

// Asesorías programadas por el administrador
router.post('/programar-clase',      clases.programarClase);
router.get('/clases-programadas',    clases.listarClasesAdmin);

module.exports = router;
