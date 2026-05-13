// Manejo de sesión y autenticación en localStorage
// Solo guarda lo que necesita el frontend — los datos reales están en el backend

const authStorage = {
  // Token JWT del usuario autenticado
  getToken()          { return localStorage.getItem('cp.token'); },
  setToken(t)         { localStorage.setItem('cp.token', t); },
  removeToken()       { localStorage.removeItem('cp.token'); },

  // Datos básicos de la sesión (id, nombre, rol, correo)
  getSesion()         {
    const s = localStorage.getItem('cp.sesion');
    return s ? JSON.parse(s) : null;
  },
  setSesion(datos)    { localStorage.setItem('cp.sesion', JSON.stringify(datos)); },
  removeSesion()      { localStorage.removeItem('cp.sesion'); },

  // Correo a recordar en el login
  getCorreoRecordado()  { return localStorage.getItem('cp.recordar') || ''; },
  setCorreoRecordado(c) { localStorage.setItem('cp.recordar', c); },
  clearCorreoRecordado(){ localStorage.removeItem('cp.recordar'); },

  // Tiempo de la última actividad del usuario (para expirar sesión)
  getUltimaActividad()  { return parseInt(localStorage.getItem('cp.actividad') || '0'); },
  setUltimaActividad()  { localStorage.setItem('cp.actividad', Date.now().toString()); },

  // Limpia todo lo de autenticación al cerrar sesión
  limpiarTodo() {
    ['cp.token','cp.sesion','cp.actividad'].forEach(k => localStorage.removeItem(k));
  }
};
