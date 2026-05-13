const router  = require('express').Router();
const passport = require('passport');
const { autenticar } = require('../middlewares/autenticar');
const ctrl    = require('../controllers/authController');
const { generarToken } = require('../config/jwt');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

// ── Login / Registro clásico ────────────────────────────
router.post('/registro',  ctrl.reglasRegistro, ctrl.registro);
router.post('/login',     ctrl.reglasLogin,    ctrl.login);
router.post('/recuperar', ctrl.recuperar);
router.get('/yo',         autenticar,           ctrl.yo);

// ── Google OAuth ────────────────────────────────────────
// Paso 1: redirigir a Google para que el usuario autorice
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

// Paso 2: Google redirige aquí con el código de autorización
router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}?error=oauth` }),
  function(req, res) {
    const usuario = req.user;

    // Generar JWT y redirigir al frontend con el token en la URL
    const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });

    // El frontend detecta ?token=... en la URL y aplica la sesión
    res.redirect(
      `${FRONTEND_URL}?token=${token}` +
      `&id=${usuario.id}` +
      `&nombres=${encodeURIComponent(usuario.nombres)}` +
      `&apellidos=${encodeURIComponent(usuario.apellidos)}` +
      `&correo=${encodeURIComponent(usuario.correo)}` +
      `&rol=${usuario.rol}`
    );
  }
);

module.exports = router;
