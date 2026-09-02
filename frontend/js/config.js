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


// ── Carga condicional del modo demo ─────────────────────
// demo.js son ~940 líneas de lógica simulada que solo sirven cuando
// MODO_DEMO está en true. Antes se descargaba en el navegador de TODOS
// los usuarios aunque nunca se ejecutara. Ahora solo se pide si hace falta.
//
// Se usa document.write a propósito: escribe la etiqueta durante el análisis
// del documento, así demo.js queda cargado ANTES que auth.js, que es quien lo
// invoca. Un script inyectado con appendChild sería asíncrono y llegaría tarde.
if (CONFIG.MODO_DEMO) {
  document.write('<script src="js/demo.js"><\/script>');
}
