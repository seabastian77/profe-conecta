// Configuración central del frontend

// En desarrollo: apunta al backend local
// En producción (Railway/Render): usa rutas relativas (mismo servidor)
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api'
  : '/api';

const CONFIG = {
  MODO_DEMO: false,

  // ── Reglas de negocio ───────────────────────────────
  PROMEDIO_MINIMO: 3.0,
  MAX_INTENTOS: 5,
  MINUTOS_BLOQUEO: 5,
  HORAS_CANCELACION: 24,
  MINUTOS_INACTIVIDAD: 120,

  // Dominio institucional permitido
  DOMINIO_CORREO: "@amigo.edu.co",
};
