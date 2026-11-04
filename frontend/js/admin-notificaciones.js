// Administración de notificaciones: envío a grupos, programas o personas e historial de envíos.

// Muestra el campo de programa o el de usuario según el destinatario elegido.
function cambiarDestinatarioNotif() {
  const destino = valorDe('notifDestinatario');
  document.getElementById('notifProgramaCampo').classList.toggle('oculto', destino !== 'programa');
  document.getElementById('notifUsuarioCampo').classList.toggle('oculto', destino !== 'usuario');
  quitarError('notifPrograma');
  quitarError('notifUsuario');
}

// Llena la lista de programas que tienen estudiantes activos.
async function cargarProgramasNotificacion() {
  const generacion = generacionAdmin;
  const selector = document.getElementById('notifPrograma');
  if (!selector) return;
  try {
    const programas = await llamarAPI('/admin/programas', 'GET');
    if (generacion !== generacionAdmin) return;
    const elegido = selector.value;
    selector.replaceChildren(new Option(programas.length ? 'Selecciona el programa' : 'No hay estudiantes con programa registrado', ''));
    programas.forEach((p) => selector.add(new Option(p.programa + ' (' + p.estudiantes + ')', p.programa)));
    if (programas.some((p) => p.programa === elegido)) selector.value = elegido;
  } catch (err) {
    selector.replaceChildren(new Option('No se pudieron cargar los programas', ''));
  }
}

// Carga el historial de las últimas notificaciones enviadas.
async function cargarHistorialNotificaciones() {
  const generacion = generacionAdmin;
  const cuerpo = document.getElementById('cuerpoHistorialNotificaciones');
  if (!cuerpo) return;
  try {
    const historial = await llamarAPI('/admin/notificaciones/historial', 'GET');
    if (generacion !== generacionAdmin) return;
    cuerpo.innerHTML = historial.length
      ? historial.map((n) => '<tr>' +
          celda('Fecha', formatearFechaHora(n.creada_en)) +
          celda('Tipo', escaparHtml(n.tipo || '—')) +
          celda('Destinatario', escaparHtml(n.destinatario || '—') + ' (' + Number(n.cantidad || 0) + ')') +
          celda('Asunto', escaparHtml(n.asunto), 'celda-principal') +
          celda('Estado', '<span class="insignia insignia--ok">Enviado</span>') + '</tr>').join('')
      : filaMensaje(5, 'Todavía no se han enviado notificaciones');
  } catch (err) {
    if (generacion === generacionAdmin) cuerpo.innerHTML = filaError(5, err.mensaje, 'cargarHistorialNotificaciones()');
  }
}

// Prepara la página de notificaciones: destinatarios, programas e historial.
function iniciarNotificacionesAdmin() {
  cambiarDestinatarioNotif();
  return Promise.all([cargarProgramasNotificacion(), cargarHistorialNotificaciones()]);
}

// Describe a quién llegará una notificación para pedir confirmación.
function descripcionDestino(datos) {
  const grupos = {
    alerta: 'los estudiantes en alerta',
    docentes: 'todos los docentes tutores',
    estudiantes: 'todos los estudiantes',
    todos: 'todos los usuarios',
  };
  return datos.destinatario === 'programa' ? 'los estudiantes de ' + datos.programa : grupos[datos.destinatario] || 'el grupo elegido';
}

// Valida, pide confirmación si es un envío masivo y envía la notificación.
async function enviarNotificacion() {
  const pagina = document.getElementById('pagina-admin-notificaciones');
  limpiarErrores(pagina);

  const datos = { destinatario: valorDe('notifDestinatario'), tipo: valorDe('notifTipo'), asunto: valorDe('notifAsunto'), mensaje: valorDe('notifMensaje') };
  if (datos.destinatario === 'programa') {
    datos.programa = valorDe('notifPrograma');
    if (!datos.programa) ponerError('notifPrograma', 'Elige el programa');
  }
  if (datos.destinatario === 'usuario') {
    datos.usuario_id = Number(valorDe('notifUsuarioId')) || 0;
    if (!datos.usuario_id) ponerError('notifUsuario', 'Busca y elige un usuario de la lista');
  }
  if (!datos.asunto) ponerError('notifAsunto', 'Escribe el asunto');
  else if (!textoSinSimbolos(datos.asunto)) ponerError('notifAsunto', 'El asunto no admite los símbolos < > " ` \\');
  if (!datos.mensaje) ponerError('notifMensaje', 'Escribe el mensaje');
  else if (!textoSinSimbolos(datos.mensaje)) ponerError('notifMensaje', 'El mensaje no admite los símbolos < > " ` \\');
  if (pagina.querySelector('.campo--invalido')) {
    enfocarPrimerError(pagina);
    return;
  }

  if (datos.destinatario !== 'usuario') {
    const acepta = await confirmarAccion({
      titulo: '¿Enviar la notificación?',
      texto: 'Se enviará «' + datos.asunto + '» a ' + descripcionDestino(datos) + '. No se puede deshacer.',
      confirmar: 'Enviar',
      tipo: 'info',
      icono: 'enviar',
    });
    if (!acepta) return;
  }

  await conOcupado(document.getElementById('btnEnviarNotificacion'), async () => {
    try {
      const resp = await llamarAPI('/admin/notificaciones', 'POST', datos);
      document.getElementById('notifAsunto').value = '';
      document.getElementById('notifMensaje').value = '';
      mostrarTostada(resp.mensaje || 'Notificación enviada', 'exito');
      cargarHistorialNotificaciones();
      cargarNotificaciones();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo enviar la notificación', 'error');
    }
  });
}
