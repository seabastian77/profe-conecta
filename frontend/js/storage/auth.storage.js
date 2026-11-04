// Sesión guardada en el navegador: token, datos básicos del usuario y marca de última actividad.
const authStorage = {
  getToken() { return leerTexto('cp.token'); },
  setToken(token) { guardarClave('cp.token', token); },
  removeToken() { borrarClaves(['cp.token']); },

  getSesion() { return leerJSON('cp.sesion', null); },
  setSesion(datos) { guardarClave('cp.sesion', datos); },
  removeSesion() { borrarClaves(['cp.sesion']); },

  getCorreoRecordado() { return leerTexto('cp.recordar'); },
  setCorreoRecordado(correo) { guardarClave('cp.recordar', correo); },
  clearCorreoRecordado() { borrarClaves(['cp.recordar']); },

  getUltimaActividad() { return parseInt(leerTexto('cp.actividad') || '0', 10) || 0; },
  setUltimaActividad() { guardarClave('cp.actividad', String(Date.now())); },

  limpiarTodo() { borrarClaves(['cp.token', 'cp.sesion', 'cp.actividad']); },
};
