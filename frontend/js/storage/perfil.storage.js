// Caché de perfil en localStorage
// Evita pedir el perfil al backend en cada navegación
// IMPORTANTE: las claves de fotos incluyen el ID del usuario para evitar
// que las fotos de un usuario aparezcan en otro (bug corregido).

const perfilStorage = {

  // ── Obtener el ID del usuario actual ──────────────────
  _uid() {
    try {
      const s = localStorage.getItem('cp.sesion');
      if (s) return JSON.parse(s).id || 'anon';
    } catch(e) {}
    return 'anon';
  },

  // ── Perfil completo ───────────────────────────────────
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

  // ── Fotos (claves con UID para aislar por usuario) ────
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

  // ── Limpiar todo lo de este usuario ──────────────────
  limpiarTodo() {
    const uid = this._uid();
    ['cp.perfil.' + uid, 'cp.foto.perfil.' + uid, 'cp.foto.portada.' + uid].forEach(k => localStorage.removeItem(k));
    // Compatibilidad: limpiar claves viejas sin UID
    ['cp.perfil', 'cp.foto.perfil', 'cp.foto.portada'].forEach(k => localStorage.removeItem(k));
  }
};
