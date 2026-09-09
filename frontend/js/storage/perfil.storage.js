// Caché de perfil en localStorage; las claves incluyen el ID del usuario.

const perfilStorage = {

  // Obtiene el ID del usuario actual.
  _uid() {
    try {
      const s = localStorage.getItem('cp.sesion');
      if (s) return JSON.parse(s).id || 'anon';
    } catch(e) {}
    return 'anon';
  },

  // Perfil completo del usuario.
  getPerfil() {
    const uid = this._uid();
    const p = localStorage.getItem('cp.perfil.' + uid);
    return p ? JSON.parse(p) : null;
  },
  setPerfil(datos) {
    const uid = this._uid();
    localStorage.setItem('cp.perfil.' + uid, JSON.stringify(datos));
  },
  clearPerfil() {
    const uid = this._uid();
    localStorage.removeItem('cp.perfil.' + uid);
  },

  // Fotos de perfil y portada, con clave por usuario.
  getFotoPerfil() {
    const uid = this._uid();
    return localStorage.getItem('cp.foto.perfil.' + uid) || '';
  },
  setFotoPerfil(b) {
    const uid = this._uid();
    localStorage.setItem('cp.foto.perfil.' + uid, b);
  },

  getFotoPortada() {
    const uid = this._uid();
    return localStorage.getItem('cp.foto.portada.' + uid) || '';
  },
  setFotoPortada(b) {
    const uid = this._uid();
    localStorage.setItem('cp.foto.portada.' + uid, b);
  },

  // Limpia todo lo de este usuario.
  limpiarTodo() {
    const uid = this._uid();
    ['cp.perfil.' + uid, 'cp.foto.perfil.' + uid, 'cp.foto.portada.' + uid].forEach(k => localStorage.removeItem(k));
    ['cp.perfil', 'cp.foto.perfil', 'cp.foto.portada'].forEach(k => localStorage.removeItem(k));
  }
};
