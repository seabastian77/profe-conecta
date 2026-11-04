// Caché del perfil y de las fotos; las claves incluyen el id del usuario para no mezclar cuentas.
const perfilStorage = {
  _uid() {
    const sesionGuardada = leerJSON('cp.sesion', null);
    return (sesionGuardada && sesionGuardada.id) || 'anon';
  },

  getPerfil() { return leerJSON('cp.perfil.' + this._uid(), null); },
  setPerfil(datos) { guardarClave('cp.perfil.' + this._uid(), datos); },
  clearPerfil() { borrarClaves(['cp.perfil.' + this._uid()]); },

  getFotoPerfil() { return leerTexto('cp.foto.perfil.' + this._uid()); },
  setFotoPerfil(base64) { return guardarClave('cp.foto.perfil.' + this._uid(), base64); },
  clearFotoPerfil() { borrarClaves(['cp.foto.perfil.' + this._uid()]); },

  getFotoPortada() { return leerTexto('cp.foto.portada.' + this._uid()); },
  setFotoPortada(base64) { return guardarClave('cp.foto.portada.' + this._uid(), base64); },
  clearFotoPortada() { borrarClaves(['cp.foto.portada.' + this._uid()]); },

  limpiarTodo() {
    const uid = this._uid();
    borrarClaves(['cp.perfil.' + uid, 'cp.foto.perfil.' + uid, 'cp.foto.portada.' + uid, 'cp.perfil', 'cp.foto.perfil', 'cp.foto.portada']);
  },
};
