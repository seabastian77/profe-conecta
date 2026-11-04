const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const path        = require('path');
require('dotenv').config();

// Carga la estrategia de Google si hay credenciales.
require('./config/passport');
const passport = require('passport');

const { limiteGeneral } = require('./middlewares/limites');
const { rutaNoEncontrada, manejarErrores } = require('./middlewares/manejoErrores');
const { db } = require('./config/db');

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
      styleSrc:    ["'self'"],
      fontSrc:     ["'self'"],
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

// Comprime las respuestas de texto: el HTML, el CSS y el JS del frontend pesan casi tres veces menos.
app.use(compression());

// Admite hasta 3 MB solo en la subida de fotos en base64 y 100 KB en el resto de la API.
app.use('/api/perfil/foto', express.json({ limit: '3mb' }));
app.use(express.json({ limit: '100kb' }));

// Deja el cuerpo como objeto vacío cuando la petición no trae JSON, para que los controladores no fallen al leerlo.
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

// Inicializa passport sin sesiones de servidor.
app.use(passport.initialize());

// Sirve el frontend: los archivos de código se revalidan con ETag y las fuentes e imágenes se guardan en caché.
const rutaFrontend = path.join(__dirname, '..', 'frontend');
app.use(express.static(rutaFrontend, {
  etag: true,
  setHeaders(res, archivo) {
    if (/\.(woff2?|ttf)$/i.test(archivo)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/\.(png|jpe?g|webp|svg|ico)$/i.test(archivo)) res.setHeader('Cache-Control', 'public, max-age=86400');
    else res.setHeader('Cache-Control', 'no-cache');
  }
}));

// Registra solo las peticiones con error, sin la query string para no guardar datos personales.
morgan.token('ruta', (req) => req.originalUrl.split('?')[0]);
app.use(morgan(esProd ? ':method :ruta :status :response-time ms' : 'dev', {
  skip: (req, res) => esProd && res.statusCode < 400
}));

// Responde el estado del servidor: ping para el healthcheck de Railway y salud para comprobar la base de datos.
app.get('/api/ping', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));
app.get('/api/salud', async (req, res) => {
  const base = await db.verificar();
  res.status(base ? 200 : 503).json({
    estado: base ? 'ok' : 'degradado',
    base: base ? 'ok' : 'sin conexión',
    segundos_activo: Math.round(process.uptime()),
    hora: new Date().toISOString()
  });
});

// Monta las rutas de la API.
app.use('/api', limiteGeneral);

app.use('/api/auth',           require('./routes/auth.routes'));
app.use('/api/perfil',         require('./routes/perfil.routes'));
app.use('/api/tutorias',       require('./routes/tutorias.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/asignaturas',    require('./routes/asignaturas.routes'));
app.use('/api/reglas',         require('./routes/reglas.routes'));

// Devuelve el index.html en las rutas del SPA, un 404 JSON en las de la API y un 404 simple en los archivos que no existen.
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return rutaNoEncontrada(req, res);
  if (req.method !== 'GET') return next();
  if (path.extname(req.path)) return res.status(404).type('text/plain').send('Archivo no encontrado');
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(rutaFrontend, 'index.html'));
});

// Captura los errores y oculta el detalle interno en producción.
app.use(manejarErrores);

module.exports = app;
