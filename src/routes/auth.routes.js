const router   = require('express').Router();
const passport = require('passport');
const { autenticar } = require('../middlewares/autenticar');
const { limiteAuth } = require('../middlewares/limites');
const { envolverControlador } = require('../middlewares/envolver');
const ctrl = envolverControlador(require('../controllers/authController'));
const { generarToken } = require('../config/jwt');
const { crearCodigo, canjearCodigo } = require('../config/codigosOauth');
const { oauthActivo } = require('../config/passport');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')[0]
  .trim()
  .replace(/\/$/, '');

// Login y registro clásicos, protegidos contra fuerza bruta.
router.post('/registro',  limiteAuth, ctrl.reglasRegistro, ctrl.registro);
router.post('/login',     limiteAuth, ctrl.reglasLogin,    ctrl.login);
router.post('/recuperar', limiteAuth, ctrl.recuperar);
router.get('/yo',         autenticar, ctrl.yo);

// Indica al frontend si el botón de Google debe mostrarse.
router.get('/google/estado', (req, res) => res.json({ disponible: oauthActivo }));

// Inicia el flujo de Google OAuth.
router.get('/google', (req, res, next) => {
  if (!oauthActivo) {
    return res.status(503).json({ error: 'El inicio de sesión con Google no está configurado' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// Recibe el retorno de Google y entrega un código de un solo uso.
router.get('/google/callback',
  (req, res, next) => {
    if (!oauthActivo) return res.redirect(`${FRONTEND_URL}?error=oauth_no_configurado`);
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${FRONTEND_URL}?error=oauth`
    })(req, res, next);
  },
  function (req, res) {
    const usuario = req.user;
    if (!usuario || !usuario.id) return res.redirect(`${FRONTEND_URL}?error=oauth`);

    const token = generarToken({ id: usuario.id, correo: usuario.correo, rol: usuario.rol });

    // Manda un código de un solo uso en vez del token en la URL.
    const codigo = crearCodigo({
      token,
      usuario: {
        id:        usuario.id,
        nombres:   usuario.nombres,
        apellidos: usuario.apellidos,
        correo:    usuario.correo,
        rol:       usuario.rol
      }
    });

    res.redirect(`${FRONTEND_URL}?codigo=${codigo}`);
  }
);

// Canjea el código de un solo uso por el token real.
router.post('/google/canjear', limiteAuth, (req, res) => {
  const datos = canjearCodigo(req.body?.codigo);
  if (!datos) {
    return res.status(400).json({ error: 'Código inválido o vencido. Intenta iniciar sesión de nuevo.' });
  }
  res.json(datos);
});

module.exports = router;
