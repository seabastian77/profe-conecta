// Verifica que el usuario autenticado tenga el rol requerido
// Uso: router.get('/ruta', autenticar, soloRol('admin'), controlador)
function soloRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esto' });
    }
    next();
  };
}

module.exports = { soloRol };
