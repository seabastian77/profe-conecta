const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
require('dotenv').config();

// Inicializar passport (carga la estrategia de Google si hay credenciales)
require('./config/passport');
const passport = require('passport');

const { limiteGeneral } = require('./middlewares/limites');

const app = express();
const esProd = process.env.NODE_ENV === 'production';

// Railway va detrás de un proxy. Sin esto, el rate limiting ve la IP del
// proxy para todo el mundo y limita a todos los usuarios como si fueran uno.
app.set('trust proxy', 1);

// Oculta la cabecera "X-Powered-By: Express" (no le regales la versión a nadie).
app.disable('x-powered-by');

// ── Cabeceras de seguridad ──────────────────────────────
// Content-Security-Policy: aunque alguien logre inyectar un <script>,
// el navegador se niega a ejecutarlo si no viene de un origen permitido.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      // OJO: index.html tiene 99 manejadores onclick="..." en línea. Sin esto
      // el navegador los bloquea y la navegación de la app deja de funcionar.
      // Es la directiva más floja de esta política: mientras siga aquí, un
      // atacante que logre inyectar HTML podría ejecutar código en un atributo.
      // El arreglo de fondo es pasar esos onclick a addEventListener en
      // frontend/js/ y luego borrar esta línea. Queda como deuda técnica.
      scriptSrcAttr: ["'unsafe-inline'"],
      // 171 atributos style="..." en el HTML: mismo caso, menos grave.
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:      ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],   // impide que te metan en un iframe (clickjacking)
      baseUri:     ["'self'"],
      formAction:  ["'self'", 'https://accounts.google.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  // HSTS: fuerza HTTPS en visitas siguientes. Solo en producción.
  hsts: esProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// ── CORS ────────────────────────────────────────────────
// Antes: origin: FRONTEND_URL || true. Ese `true` refleja CUALQUIER origen y,
// junto a credentials:true, deja que cualquier web haga peticiones con la
// sesión del usuario. En producción ahora exige lista blanca explícita.
const origenesPermitidos = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origen, cb) {
    // Peticiones del mismo servidor (el frontend estático) no traen Origin.
    if (!origen) return cb(null, true);
    const limpio = origen.replace(/\/$/, '');
    if (!esProd) return cb(null, true);            // en desarrollo, libre
    if (origenesPermitidos.includes(limpio)) return cb(null, true);
    return cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// ── Cuerpo de la petición ───────────────────────────────
// 10mb es para las fotos en base64. Es un límite alto: mantenlo vigilado.
app.use(express.json({ limit: '10mb' }));

if (!esProd) app.use(morgan('dev'));

// Passport sin sesiones de servidor: la autenticación es por JWT.
// (Se quitó express-session: no se usaba en ninguna ruta y su secreto por
// defecto 'secreto-local-dev' era otro valor conocido en el repositorio.)
app.use(passport.initialize());

// ── Frontend estático ───────────────────────────────────
const rutaFrontend = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(rutaFrontend));

// ── Rutas API ───────────────────────────────────────────
app.use('/api', limiteGeneral);

app.use('/api/auth',           require('./routes/auth.routes'));
app.use('/api/perfil',         require('./routes/perfil.routes'));
app.use('/api/tutorias',       require('./routes/tutorias.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/asignaturas',    require('./routes/asignaturas.routes'));

// Estado del servidor (lo usa el healthcheck de Railway)
app.get('/api/ping', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

// Cualquier ruta que no sea /api → devolver el index.html (SPA)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }
  if (req.method === 'GET') {
    return res.sendFile(path.join(rutaFrontend, 'index.html'));
  }
  next();
});

// ── Error global ────────────────────────────────────────
// Antes devolvía err.message al cliente. Eso filtra rutas de archivos,
// nombres de tablas y detalles del motor de base de datos a cualquiera que
// provoque un error. Ahora el detalle va al log y el cliente recibe un
// mensaje genérico (salvo en desarrollo, donde sí ayuda verlo).
app.use((err, req, res, next) => {
  const esCors = err && err.message === 'Origen no permitido por CORS';
  const estado = esCors ? 403 : (err.status || 500);

  console.error('Error no manejado:', {
    ruta:   `${req.method} ${req.originalUrl}`,
    mensaje: err?.message,
    stack:  esProd ? undefined : err?.stack
  });

  if (res.headersSent) return next(err);

  res.status(estado).json({
    error: esProd
      ? (esCors ? 'Origen no permitido' : 'Error interno del servidor')
      : (err?.message || 'Error interno del servidor')
  });
});

module.exports = app;
