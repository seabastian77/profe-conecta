// Dirección del backend: el servidor local en desarrollo y rutas relativas en producción.
const API_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://localhost:3000/api'
  : '/api';

// Reglas de negocio y dominio institucional; las reglas se reemplazan con las que fija el administrador.
const CONFIG = {
  PROMEDIO_MINIMO: 3.0,
  HORAS_CANCELACION: 24,
  MINUTOS_INACTIVIDAD: 15,
  MAX_ESTUDIANTES: 15,
  DOMINIO_CORREO: '@amigo.edu.co',
};

// Lee un valor JSON del almacenamiento local sin romper la página si está dañado o bloqueado.
function leerJSON(clave, porDefecto) {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo === null ? porDefecto : JSON.parse(crudo);
  } catch (e) {
    return porDefecto;
  }
}

// Lee un texto del almacenamiento local y devuelve una cadena vacía si no existe o no hay acceso.
function leerTexto(clave) {
  try {
    return localStorage.getItem(clave) || '';
  } catch (e) {
    return '';
  }
}

// Guarda un valor en el almacenamiento local; devuelve false si no hay espacio o está bloqueado.
function guardarClave(clave, valor) {
  try {
    localStorage.setItem(clave, typeof valor === 'string' ? valor : JSON.stringify(valor));
    return true;
  } catch (e) {
    return false;
  }
}

// Borra claves del almacenamiento local e ignora los errores de acceso.
function borrarClaves(claves) {
  claves.forEach((clave) => {
    try {
      localStorage.removeItem(clave);
    } catch (e) {
      /* sin acceso al almacenamiento */
    }
  });
}

// Aplica las reglas que fija el administrador en Configuración sobre los valores por defecto.
function aplicarReglas(reglas) {
  if (!reglas) return;
  ['PROMEDIO_MINIMO', 'HORAS_CANCELACION', 'MAX_ESTUDIANTES', 'MINUTOS_INACTIVIDAD'].forEach((clave) => {
    const valor = Number(reglas[clave]);
    if (Number.isFinite(valor) && valor > 0) CONFIG[clave] = valor;
  });
}

aplicarReglas(leerJSON('cp.reglas', null));

// Escapa texto para insertarlo sin riesgo dentro de HTML.
function escaparHtml(valor) {
  const reemplazos = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(valor === null || valor === undefined ? '' : valor).replace(/[&<>"']/g, (c) => reemplazos[c]);
}
