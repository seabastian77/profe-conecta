const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const session  = require('express-session');
const path     = require('path');
require('dotenv').config();

// Inicializar passport (carga la estrategia de Google)
require('./config/passport');
const passport = require('passport');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// ── Middlewares globales ────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
if (!isProd) app.use(morgan('dev'));

// Sesión para passport-google-oauth20
app.use(session({
  secret:            process.env.SESSION_SECRET || 'secreto-local-dev',
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: isProd, httpOnly: true, sameSite: 'lax' }
}));

app.use(passport.initialize());
app.use(passport.session());

// ── Servir frontend estático (producción) ───────────────
// En dev se usa Live Server; en prod el mismo Express sirve los archivos
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// ── Rutas API ───────────────────────────────────────────
app.use('/api/auth',           require('./routes/auth.routes'));
app.use('/api/perfil',         require('./routes/perfil.routes'));
app.use('/api/tutorias',       require('./routes/tutorias.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));
app.use('/api/notificaciones', require('./routes/notificaciones.routes'));
app.use('/api/asignaturas',    require('./routes/asignaturas.routes'));

// Estado del servidor
app.get('/api/ping', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

// Cualquier ruta que no sea /api → devolver el index.html (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `${req.method} ${req.url} no existe` });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
