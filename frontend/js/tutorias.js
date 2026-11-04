// Tutorías: carga de datos, tarjetas, acciones de cancelar y completar, pestañas y formulario para programar.

let tutoriasActuales = [];
const estadoListasTutorias = {};
const LIMITE_LISTA_TUTORIAS = 20;

registrarLimpieza(() => {
  tutoriasActuales = [];
  Object.keys(estadoListasTutorias).forEach((clave) => delete estadoListasTutorias[clave]);
});

// Trae las tutorías del usuario y las deja en memoria y en la caché local.
async function cargarTutorias() {
  const tutorias = await llamarAPI('/tutorias', 'GET');
  tutoriasActuales = Array.isArray(tutorias) ? tutorias : [];
  academicoStorage.setTutorias(tutoriasActuales);
  return tutoriasActuales;
}

// Busca una tutoría ya cargada por su id.
function buscarTutoria(id) {
  return tutoriasActuales.find((t) => Number(t.id) === Number(id)) || null;
}

// Devuelve el marcado de una persona con su ícono.
function personaTutoria(iconoNombre, nombre) {
  return '<span>' + icono(iconoNombre, 's') + escaparHtml(nombre) + '</span>';
}

// Genera el botón o la nota de acción de una tutoría según su estado, la hora y el rol.
function accionTutoriaHTML(tutoria, vistaRol) {
  const estado = normalizarEstado(tutoria.estado);
  if (estado !== 'pendiente' && estado !== 'confirmada') return '';
  const id = Number(tutoria.id);

  if (tutoriaYaPaso(tutoria)) {
    if (vistaRol === 'docente' || vistaRol === 'admin') {
      return '<button type="button" class="btn btn--s" onclick="marcarTutoriaRealizada(' + id + ')">' + icono('ok', 's') + 'Marcar realizada</button>';
    }
    return '<span class="tutoria__nota">La sesión ya pasó; el docente debe registrarla.</span>';
  }
  if (tutoriaCancelable(tutoria, vistaRol)) {
    return '<button type="button" class="btn btn--s btn--contorno-peligro" onclick="cancelarTutoria(' + id + ')">Cancelar</button>';
  }
  return '<span class="tutoria__nota">Faltan menos de ' + CONFIG.HORAS_CANCELACION + ' h: ya no se puede cancelar.</span>';
}

// Construye la tarjeta de una tutoría; la variante es lista (por defecto), compacta o detalle.
function tarjetaTutoriaHTML(tutoria, vistaRol, variante) {
  const estado = normalizarEstado(tutoria.estado);
  const [, mes, dia] = String(tutoria.fecha).slice(0, 10).split('-');
  const hora = String(tutoria.hora || '').slice(0, 5);

  let personas = '';
  if (vistaRol === 'estudiante') personas = personaTutoria('usuario', tutoria.nombre_docente || 'Tutor');
  else if (vistaRol === 'docente') personas = personaTutoria('birrete', tutoria.nombre_estudiante || 'Estudiante');
  else personas = personaTutoria('birrete', tutoria.nombre_estudiante || 'Estudiante') + personaTutoria('usuario', tutoria.nombre_docente || 'Docente');

  const meta = '<span class="tutoria__meta">' + personas +
    '<span>' + icono('reloj', 's') + escaparHtml(hora) + '</span>' +
    '<span>' + icono(iconoModalidad(tutoria.modalidad), 's') + escaparHtml(tutoria.modalidad || '') + '</span></span>';
  const fecha = '<span class="tutoria__fecha"><span class="tutoria__dia">' + Number(dia) + '</span><span class="tutoria__mes">' + MESES_CORTOS[Number(mes) - 1] + '</span></span>';

  if (variante === 'compacta') {
    return '<button type="button" class="tutoria tutoria--compacta estado-' + estado + '" onclick="calIrAFecha(\'' + String(tutoria.fecha).slice(0, 10) + '\')">' +
      fecha + '<span class="tutoria__cuerpo"><span class="tutoria__titulo">' + escaparHtml(tutoria.asignatura) + '</span>' + meta + '</span></button>';
  }

  const observaciones = variante === 'detalle' && tutoria.observaciones
    ? '<span class="tutoria__nota-texto">' + escaparHtml(tutoria.observaciones) + '</span>' : '';
  return '<article class="tutoria estado-' + estado + (variante === 'detalle' ? ' tutoria--detalle' : '') + '">' + fecha +
    '<div class="tutoria__cuerpo"><span class="tutoria__titulo">' + escaparHtml(tutoria.asignatura) + '</span>' + meta + observaciones + '</div>' +
    '<div class="tutoria__lado">' + insigniaEstado(estado) + accionTutoriaHTML(tutoria, vistaRol) + '</div></article>';
}

// Separa las tutorías en próximas (activas) e historial (completadas y canceladas), cada grupo ordenado.
function agruparTutorias(tutorias) {
  const porInstante = (a, b) => (instanteTutoria(a) || 0) - (instanteTutoria(b) || 0);
  const activas = tutorias.filter((t) => ['pendiente', 'confirmada'].includes(normalizarEstado(t.estado)));
  const cerradas = tutorias.filter((t) => !['pendiente', 'confirmada'].includes(normalizarEstado(t.estado)));
  return { proximas: activas.sort(porInstante), historial: cerradas.sort((a, b) => porInstante(b, a)) };
}

// Dibuja la lista de tutorías de un panel según la pestaña elegida y actualiza los contadores.
function pintarListaTutorias(idLista, vistaRol) {
  const lista = document.getElementById(idLista);
  const pestanas = document.querySelector('[data-lista="' + idLista + '"]');
  if (!lista) return;
  const estado = estadoListasTutorias[idLista] || (estadoListasTutorias[idLista] = { filtro: 'proximas', limite: LIMITE_LISTA_TUTORIAS });
  const grupos = agruparTutorias(tutoriasActuales);

  if (pestanas) {
    pestanas.querySelectorAll('.pestana').forEach((p) => {
      const filtro = p.dataset.filtro;
      p.setAttribute('aria-selected', filtro === estado.filtro ? 'true' : 'false');
      p.textContent = (filtro === 'proximas' ? 'Próximas' : 'Historial') + ' · ' + grupos[filtro].length;
    });
  }

  const visibles = grupos[estado.filtro];
  if (!visibles.length) {
    const esProximas = estado.filtro === 'proximas';
    lista.innerHTML = estadoVacio({
      icono: esProximas ? 'calendario' : 'archivo',
      titulo: esProximas ? 'No tienes tutorías próximas' : 'Todavía no hay historial',
      texto: esProximas ? 'Cuando programes una, aparecerá aquí con su fecha y su estado.' : 'Las tutorías completadas o canceladas se guardan aquí.',
      compacto: true,
      accion: esProximas ? { texto: 'Programar tutoría', onclick: "irAPagina('programar-tutoria')" } : null,
    });
    return;
  }

  const mostradas = visibles.slice(0, estado.limite);
  lista.innerHTML = mostradas.map((t) => tarjetaTutoriaHTML(t, vistaRol)).join('') +
    (visibles.length > mostradas.length
      ? '<button type="button" class="btn btn--s" onclick="verMasTutorias(\'' + idLista + '\')">Ver más (' + (visibles.length - mostradas.length) + ' restantes)</button>'
      : '');
}

// Cambia entre las pestañas Próximas e Historial de una lista de tutorías.
function cambiarPestanaTutorias(boton) {
  const contenedor = boton.closest('[data-lista]');
  const idLista = contenedor.dataset.lista;
  estadoListasTutorias[idLista] = { filtro: boton.dataset.filtro, limite: LIMITE_LISTA_TUTORIAS };
  pintarListaTutorias(idLista, contenedor.dataset.rol);
}

// Muestra más tutorías en la lista cuando hay muchas.
function verMasTutorias(idLista) {
  const contenedor = document.querySelector('[data-lista="' + idLista + '"]');
  estadoListasTutorias[idLista].limite += LIMITE_LISTA_TUTORIAS;
  pintarListaTutorias(idLista, contenedor.dataset.rol);
}

// Pide confirmación y cancela una tutoría.
async function cancelarTutoria(id) {
  const tutoria = buscarTutoria(id);
  const detalle = tutoria ? tutoria.asignatura + ' · ' + fechaLegible(tutoria.fecha) + ' a las ' + String(tutoria.hora).slice(0, 5) + '. ' : '';
  const acepta = await confirmarAccion({
    titulo: '¿Cancelar esta tutoría?',
    texto: detalle + 'Se avisará a la otra persona y no podrás deshacerlo.',
    confirmar: 'Sí, cancelar',
    cancelar: 'Mantenerla',
    tipo: 'peligro',
    icono: 'calendario-x',
  });
  if (!acepta) return;
  try {
    await llamarAPI('/tutorias/' + id + '/cancelar', 'PATCH');
    mostrarTostada('Tutoría cancelada', 'exito');
    recargarVistaTutorias();
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo cancelar la tutoría', 'error');
  }
}

// Pide confirmación y marca una tutoría como realizada (docente o administrador).
async function marcarTutoriaRealizada(id) {
  const tutoria = buscarTutoria(id);
  const detalle = tutoria ? tutoria.asignatura + ' · ' + fechaLegible(tutoria.fecha) + '. ' : '';
  const acepta = await confirmarAccion({
    titulo: '¿Marcar como realizada?',
    texto: detalle + 'Quedará en el historial y ya no se podrá cancelar.',
    confirmar: 'Sí, marcar realizada',
    tipo: 'info',
    icono: 'calendario-ok',
  });
  if (!acepta) return;
  try {
    await llamarAPI('/tutorias/' + id + '/realizada', 'PATCH');
    mostrarTostada('Tutoría marcada como realizada', 'exito');
    recargarVistaTutorias();
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo marcar la tutoría', 'error');
  }
}

// Recarga la vista donde estaba la persona (calendario o su panel) y la campana.
function recargarVistaTutorias() {
  if (document.getElementById('pagina-mi-calendario').classList.contains('activa')) iniciarCalendario(true);
  else if (sesion.rol === 'estudiante') cargarPanelEstudiante();
  else if (sesion.rol === 'docente') cargarPanelDocente();
  cargarNotificaciones();
}

let estudianteEncontrado = null;

// Busca por documento exacto al estudiante que se va a programar; devuelve el registro o null.
async function resolverEstudiante(documento) {
  if (estudianteEncontrado && estudianteEncontrado.documento === documento) return estudianteEncontrado;
  const resultados = await llamarAPI('/tutorias/buscar-estudiante?q=' + encodeURIComponent(documento), 'GET');
  estudianteEncontrado = resultados.find((r) => r.documento === documento) || null;
  return estudianteEncontrado;
}

// Muestra bajo el campo el nombre del estudiante que coincide con el documento escrito.
const mostrarEstudianteEncontrado = debounce(async () => {
  const ayuda = document.getElementById('ayudaTutEstudiante');
  const documento = document.getElementById('tutEstudiante').value.trim();
  estudianteEncontrado = null;
  if (!/^\d{6,11}$/.test(documento)) {
    ayuda.textContent = '';
    return;
  }
  try {
    const estudiante = await resolverEstudiante(documento);
    ayuda.textContent = estudiante ? 'Estudiante: ' + estudiante.nombre + ' · ' + estudiante.programa : '';
  } catch (err) {
    ayuda.textContent = '';
  }
}, 450);

// Prepara el formulario de tutoría según el rol de quien lo abre.
async function prepararFormTutoria() {
  const formulario = document.getElementById('formularioTutoria');
  const selectTutor = document.getElementById('tutTutor');
  formulario.reset();
  limpiarErrores(formulario);
  estudianteEncontrado = null;
  document.getElementById('ayudaTutEstudiante').textContent = '';
  document.getElementById('tutFecha').min = fechaMananaISO();
  actualizarTextosReglas();

  const rol = sesion.rol;
  document.getElementById('campoTutEstudiante').classList.toggle('oculto', rol === 'estudiante');
  document.getElementById('campoTutTutor').classList.toggle('oculto', rol === 'docente');

  if (rol === 'docente') {
    cargarMateriasDeDocente('tutAsignatura', sesion.id);
    return;
  }

  cargarMateriasDeDocente('tutAsignatura', '');
  selectTutor.innerHTML = '<option value="">Cargando tutores…</option>';
  try {
    const docentes = await obtenerDocentesConMaterias(true);
    selectTutor.innerHTML = docentes.length
      ? '<option value="">Selecciona un tutor</option>' + docentes.map((d) =>
        '<option value="' + Number(d.id) + '">' + escaparHtml(d.nombre) + ' · ' + escaparHtml(d.facultad) + '</option>').join('')
      : '<option value="">No hay tutores disponibles</option>';
  } catch (err) {
    selectTutor.innerHTML = '<option value="">No se pudieron cargar los tutores</option>';
    mostrarTostada(err.mensaje || 'No se pudieron cargar los tutores', 'error');
  }
}

// Actualiza la lista de materias cuando se elige otro tutor.
function actualizarMateriasTutoria() {
  quitarError('tutAsignatura');
  cargarMateriasDeDocente('tutAsignatura', document.getElementById('tutTutor').value);
}

// Lleva el mensaje de error del servidor al campo que lo causó.
function mostrarErrorTutoria(err) {
  const m = (err.mensaje || '').toLowerCase();
  if (err.status === 409) ponerError('tutHora', err.mensaje);
  else if (m.includes('asignatura')) ponerError('tutAsignatura', err.mensaje);
  else if (m.includes('modalidad')) ponerError('tutModalidad', err.mensaje);
  else if (m.includes('fecha')) ponerError('tutFecha', err.mensaje);
  else if (m.includes('hora')) ponerError('tutHora', err.mensaje);
  else mostrarTostada(err.mensaje || 'No se pudo programar la tutoría', 'error');
}

// Valida y envía el formulario para programar una tutoría.
async function alEnviarTutoria(e) {
  e.preventDefault();
  const formulario = e.target;
  const boton = document.getElementById('btnProgramarTutoria');
  const rol = sesion.rol;
  const asignatura = document.getElementById('tutAsignatura').value;
  const modalidad = document.getElementById('tutModalidad').value;
  const fecha = document.getElementById('tutFecha').value;
  const hora = document.getElementById('tutHora').value;
  const observaciones = document.getElementById('tutObservaciones').value.trim();
  const documento = document.getElementById('tutEstudiante').value.trim();
  const docenteId = rol === 'docente' ? null : Number(document.getElementById('tutTutor').value) || null;

  limpiarErrores(formulario);
  let hayError = false;
  if (rol !== 'docente' && !docenteId) { ponerError('tutTutor', 'Selecciona un tutor'); hayError = true; }
  if (rol !== 'estudiante') {
    if (!documento) { ponerError('tutEstudiante', 'Escribe el documento del estudiante'); hayError = true; }
    else if (!/^\d{6,11}$/.test(documento)) { ponerError('tutEstudiante', 'Solo números, entre 6 y 11 dígitos'); hayError = true; }
  }
  if (!asignatura) { ponerError('tutAsignatura', 'Selecciona una asignatura'); hayError = true; }
  if (!modalidad) { ponerError('tutModalidad', 'Selecciona la modalidad'); hayError = true; }
  if (!fecha) { ponerError('tutFecha', 'La fecha es obligatoria'); hayError = true; }
  else if (problemaFechaSesion(fecha)) { ponerError('tutFecha', problemaFechaSesion(fecha)); hayError = true; }
  if (!hora) { ponerError('tutHora', 'La hora es obligatoria'); hayError = true; }
  if (hayError) {
    enfocarPrimerError(formulario);
    return;
  }

  await conOcupado(boton, async () => {
    try {
      let estudianteId = null;
      if (rol !== 'estudiante') {
        const estudiante = await resolverEstudiante(documento);
        if (!estudiante) {
          ponerError('tutEstudiante', 'No existe un estudiante activo con ese documento');
          enfocarPrimerError(formulario);
          return;
        }
        estudianteId = estudiante.id;
      }
      await llamarAPI('/tutorias', 'POST', { docente_id: docenteId, estudiante_id: estudianteId, asignatura, modalidad, fecha, hora, observaciones });
      mostrarTostada('Tutoría programada. Se avisó a las dos personas.', 'exito');
      formulario.reset();
      cargarNotificaciones();
      irAlPanel();
    } catch (err) {
      mostrarErrorTutoria(err);
      enfocarPrimerError(formulario);
    }
  });
}
