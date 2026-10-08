// Configuración central del frontend

// Usa el backend local en desarrollo y rutas relativas en producción.
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api'
  : '/api';

const CONFIG = {
  MODO_DEMO: false,

  // Reglas de negocio
  PROMEDIO_MINIMO: 3.0,
  MAX_INTENTOS: 3,
  MINUTOS_BLOQUEO: 5,
  HORAS_CANCELACION: 24,
  MINUTOS_INACTIVIDAD: 15,
  MAX_ESTUDIANTES: 15,

  // Dominio institucional permitido
  DOMINIO_CORREO: "@amigo.edu.co",
};


// Aplica las reglas que fija el administrador en Configuración; antes la pantalla usaba siempre los valores fijos.
function aplicarReglas(reglas) {
  if (!reglas) return;
  ["PROMEDIO_MINIMO", "HORAS_CANCELACION", "MAX_ESTUDIANTES", "MINUTOS_INACTIVIDAD"].forEach(function (clave) {
    var valor = Number(reglas[clave]);
    if (Number.isFinite(valor) && valor > 0) CONFIG[clave] = valor;
  });
}

// Usa las últimas reglas conocidas mientras se consultan las vigentes.
try { aplicarReglas(JSON.parse(localStorage.getItem("cp.reglas") || "null")); } catch (e) { /* sin caché */ }


// Carga el script del modo demo solo cuando está activado.
if (CONFIG.MODO_DEMO) {
  document.write('<script src="js/demo.js"><\/script>');
}


// Escapa texto para insertarlo sin riesgo dentro de HTML.
function escaparHtml(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
