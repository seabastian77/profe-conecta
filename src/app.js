const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const path    = require('path');
require('dotenv').config();

// Carga la estrategia de Google si hay credenciales.
require('./config/passport');
const passport = require('passport');

const { limiteGeneral } = require('./middlewares/limites');

const app = express();
const esProd = process.env.NODE_ENV === 'production';

// Confía en el proxy de Railway para leer la IP real del cliente.
app.set('trust proxy', 1);

// Oculta la cabecera X-Powered-By.
app.disable('x-powered-by');

// Aplica las cabeceras de seguridad y la política de contenido.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc:      ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'", 'https://accounts.google.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: esProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Restringe el origen de las peticiones a la lista blanca en producción.
const origenesPermitidos = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin(origen, cb) {
    if (!origen) return cb(null, true);
    const limpio = origen.replace(/\/$/, '');
    if (!esProd) return cb(null, true);
    if (origenesPermitidos.includes(limpio)) return cb(null, true);
    return cb(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// Limita el tamaño del cuerpo JSON para las fotos en base64.
app.use(express.json({ limit: '10mb' }));

if (!esProd) app.use(morgan('dev'));

// Inicializa passport sin sesiones de servidor.
app.use(passport.initialize());

// Sirve los archivos estáticos del frontend.
const rutaFrontend = path.join(__dirname, '..', 'frontend');
app.use(express.static(rutaFrontend));

// Monta las rutas de la API.
app.use('/api', limiteGeneral);

app.use('/api/auth',           require('./routes/auth.routes'));
app.use('/api/perfil',         require('./routes/perfil.routes'));
app.use('/api/tutorias',       require('./routes/tutorias.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/asignaturas',    require('./routes/asignaturas.routes'));

// Responde el estado del servidor para el healthcheck.
app.get('/api/ping', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

// Devuelve el index.html en las rutas del SPA y un 404 JSON en las de la API.
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }
  if (req.method === 'GET') {
    return res.sendFile(path.join(rutaFrontend, 'index.html'));
  }
  next();
});

// Captura los errores y oculta el detalle interno en producción.
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
