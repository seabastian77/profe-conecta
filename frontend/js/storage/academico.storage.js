// Caché de datos académicos (tutorías, historial)
// Se refresca al cargar cada panel

const academicoStorage = {
  getTutorias()         {
    const t = localStorage.getItem('cp.tutorias');
    return t ? JSON.parse(t) : [];
  },
  setTutorias(lista)    { localStorage.setItem('cp.tutorias', JSON.stringify(lista)); },

  getHistorial()        {
    const h = localStorage.getItem('cp.historial');
    return h ? JSON.parse(h) : [];
  },
  setHistorial(lista)   { localStorage.setItem('cp.historial', JSON.stringify(lista)); },

  limpiarTodo() {
    ['cp.tutorias','cp.historial'].forEach(k => localStorage.removeItem(k));
  }
};
