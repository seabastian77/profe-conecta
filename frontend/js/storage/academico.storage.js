// Caché de las tutorías del usuario, que se refresca cada vez que se abre un panel.
const academicoStorage = {
  getTutorias() { return leerJSON('cp.tutorias', []); },
  setTutorias(lista) { guardarClave('cp.tutorias', lista); },
  limpiarTodo() { borrarClaves(['cp.tutorias', 'cp.historial']); },
};
