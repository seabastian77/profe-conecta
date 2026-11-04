// Calendario mensual de tutorías: festivos de Colombia, filtros, detalle del día y próximas actividades.

const calendario = { mes: 0, anio: 0, tutorias: [], seleccion: '', destino: '' };

registrarLimpieza(() => Object.assign(calendario, { tutorias: [], seleccion: '', destino: '' }));

// Busca un elemento del calendario dentro de su página.
function calEl(nombre) {
  return document.querySelector('#pagina-mi-calendario [data-cal="' + nombre + '"]');
}

// Calcula el domingo de Pascua de un año con el algoritmo de Meeus, Jones y Butcher; devuelve milisegundos UTC.
function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(anio, mes - 1, dia);
}

// Pasa una fecha (milisegundos UTC) al lunes siguiente, o la deja igual si ya es lunes.
function siguienteLunes(ms) {
  const diaSemana = new Date(ms).getUTCDay();
  return ms + ((8 - diaSemana) % 7) * 86400000;
}

const festivosCache = {};

// Calcula los festivos de Colombia de un año según la Ley 51 de 1983 (traslado al lunes) y la Semana Santa.
function festivosColombia(anio) {
  if (festivosCache[anio]) return festivosCache[anio];
  const dia = 86400000;
  const festivos = {};
  const agregar = (ms, nombre) => {
    const clave = new Date(ms).toISOString().slice(0, 10);
    festivos[clave] = festivos[clave] ? festivos[clave] + ' / ' + nombre : nombre;
  };
  const fijo = (mes, d, nombre) => agregar(Date.UTC(anio, mes - 1, d), nombre);
  const trasladado = (mes, d, nombre) => agregar(siguienteLunes(Date.UTC(anio, mes - 1, d)), nombre);
  const domingoPascua = pascua(anio);

  fijo(1, 1, 'Año Nuevo');
  trasladado(1, 6, 'Reyes Magos');
  trasladado(3, 19, 'San José');
  agregar(domingoPascua - 3 * dia, 'Jueves Santo');
  agregar(domingoPascua - 2 * dia, 'Viernes Santo');
  fijo(5, 1, 'Día del Trabajo');
  agregar(domingoPascua + 43 * dia, 'Ascensión');
  agregar(domingoPascua + 64 * dia, 'Corpus Christi');
  agregar(domingoPascua + 71 * dia, 'Sagrado Corazón');
  trasladado(6, 29, 'San Pedro y San Pablo');
  fijo(7, 20, 'Independencia');
  fijo(8, 7, 'Batalla de Boyacá');
  trasladado(8, 15, 'Asunción');
  trasladado(10, 12, 'Día de la Raza');
  trasladado(11, 1, 'Todos los Santos');
  trasladado(11, 11, 'Indep. de Cartagena');
  fijo(12, 8, 'Inmaculada Concepción');
  fijo(12, 25, 'Navidad');
  festivosCache[anio] = festivos;
  return festivos;
}

// Textos del calendario según el rol: el menú lo llama «Mis tutorías» o «Todas las tutorías».
function tituloCalendario() {
  if (sesion.rol === 'admin') return { corto: 'Todas las tutorías', titulo: 'Todas las tutorías', subtitulo: 'Todas las sesiones del sistema; filtra por materia o estado.' };
  if (sesion.rol === 'docente') return { corto: 'Mis tutorías', titulo: 'Mis tutorías', subtitulo: 'Tus sesiones del mes; marca como realizadas las que ya pasaron.' };
  return { corto: 'Mi calendario', titulo: 'Mi calendario', subtitulo: 'Visualiza y filtra todas tus asesorías del mes.' };
}

// Devuelve las tutorías que cumplen los filtros de materia y estado.
function calTutoriasFiltradas() {
  const materia = calEl('calFiltroMateria').value;
  const estado = calEl('calFiltroEstado').value;
  return calendario.tutorias.filter((t) => (!materia || t.asignatura === materia) && (!estado || normalizarEstado(t.estado) === estado));
}

// Convierte año, mes (0 a 11) y día en una fecha AAAA-MM-DD.
function calFechaISO(anio, mes, dia) {
  return anio + '-' + String(mes + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}

// Dibuja la cuadrícula del mes con las sesiones, los festivos y el día elegido.
function renderCalendario() {
  const celdas = calEl('calCeldas');
  const { mes, anio } = calendario;
  calEl('calTitulo').textContent = MESES[mes] + ' ' + anio;

  const porDia = {};
  calTutoriasFiltradas().forEach((t) => {
    const clave = String(t.fecha).slice(0, 10);
    (porDia[clave] = porDia[clave] || []).push(t);
  });
  Object.values(porDia).forEach((lista) => lista.sort((a, b) => String(a.hora).localeCompare(String(b.hora))));

  const festivos = festivosColombia(anio);
  const hoy = hoyColombiaISO();
  const desfase = (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const vacia = '<div class="cal__celda cal__celda--fuera" aria-hidden="true"></div>';
  let html = vacia.repeat(desfase);

  for (let dia = 1; dia <= diasMes; dia++) {
    const iso = calFechaISO(anio, mes, dia);
    const sesiones = porDia[iso] || [];
    const festivo = festivos[iso] || '';
    const clases = ['cal__celda', iso === hoy ? 'cal__celda--hoy' : '', festivo ? 'cal__celda--festivo' : '',
      (desfase + dia - 1) % 7 >= 5 ? 'cal__celda--fin' : '', iso === calendario.seleccion ? 'cal__celda--seleccion' : ''].filter(Boolean).join(' ');
    const descripcion = dia + ' de ' + MESES[mes].toLowerCase() + (festivo ? ', festivo: ' + festivo : '') +
      (sesiones.length ? ', ' + sesiones.length + (sesiones.length === 1 ? ' sesión' : ' sesiones') : ', sin sesiones');

    const eventos = sesiones.slice(0, 2).map((s) =>
      '<span class="cal__evento estado-' + normalizarEstado(s.estado) + '">' + escaparHtml(String(s.hora).slice(0, 5)) + ' ' + escaparHtml(s.asignatura) + '</span>').join('');
    const puntos = sesiones.slice(0, 4).map((s) => '<span class="cal__punto estado-' + normalizarEstado(s.estado) + '"></span>').join('');

    html += '<button type="button" class="' + clases + '" onclick="calClickDia(\'' + iso + '\')" aria-label="' + escaparHtml(descripcion) + '"' + (iso === hoy ? ' aria-current="date"' : '') + '>' +
      '<span class="cal__cabecera-dia"><span class="cal__num">' + dia + '</span></span>' +
      (festivo ? '<span class="cal__festivo">' + escaparHtml(festivo) + '</span>' : '') +
      (sesiones.length ? '<span class="cal__eventos">' + eventos + '</span>' : '') +
      (sesiones.length > 2 ? '<span class="cal__mas">+' + (sesiones.length - 2) + ' más</span>' : '') +
      (sesiones.length ? '<span class="cal__puntos">' + puntos + '</span>' : '') +
    '</button>';
  }
  html += vacia.repeat((7 - ((desfase + diasMes) % 7)) % 7);
  celdas.innerHTML = html;
}

// Dibuja el detalle de las sesiones del día elegido.
function pintarDetalleDia() {
  const iso = calendario.seleccion;
  const detalle = calEl('calDetalleDia');
  if (!iso) {
    detalle.classList.add('oculto');
    return;
  }
  const [anio, mes, dia] = iso.split('-').map(Number);
  const festivo = festivosColombia(anio)[iso] || '';
  const sesiones = calTutoriasFiltradas().filter((t) => String(t.fecha).slice(0, 10) === iso).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

  calEl('calDetalleTitulo').textContent = 'Sesiones del ' + dia + ' de ' + MESES[mes - 1].toLowerCase() + ' de ' + anio;
  calEl('calDetalleContenido').innerHTML =
    (festivo ? '<div class="aviso aviso--aviso">' + icono('calendario') + '<p><strong>Festivo:</strong> ' + escaparHtml(festivo) + '</p></div>' : '') +
    (sesiones.length
      ? '<div class="tutorias">' + sesiones.map((s) => tarjetaTutoriaHTML(s, sesion.rol, 'detalle')).join('') + '</div>'
      : estadoVacio({ icono: 'calendario', titulo: 'Sin asesorías este día', texto: 'No hay sesiones programadas con los filtros actuales.', compacto: true }));
  detalle.classList.remove('oculto');
}

// Selecciona un día del calendario y muestra sus sesiones.
function calClickDia(iso) {
  calendario.seleccion = iso;
  renderCalendario();
  pintarDetalleDia();
  calEl('calDetalleDia').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Cierra el detalle del día y quita la selección.
function cerrarDetalleCalendario() {
  calendario.seleccion = '';
  calEl('calDetalleDia').classList.add('oculto');
  renderCalendario();
}

// Dibuja las próximas sesiones agrupadas por día.
function renderProximas() {
  const contenedor = calEl('calProximas');
  const hoy = hoyColombiaISO();
  const manana = sumarDiasISO(hoy, 1);
  const proximas = calendario.tutorias
    .filter((t) => String(t.fecha).slice(0, 10) >= hoy && ['pendiente', 'confirmada'].includes(normalizarEstado(t.estado)))
    .sort((a, b) => (String(a.fecha) + String(a.hora)).localeCompare(String(b.fecha) + String(b.hora)))
    .slice(0, 15);

  if (!proximas.length) {
    contenedor.innerHTML = estadoVacio({ icono: 'calendario', titulo: 'Sin actividades próximas', texto: 'Las sesiones pendientes aparecerán aquí.', compacto: true });
    return;
  }

  const grupos = {};
  proximas.forEach((t) => {
    const clave = String(t.fecha).slice(0, 10);
    (grupos[clave] = grupos[clave] || []).push(t);
  });

  contenedor.innerHTML = Object.keys(grupos).sort().map((iso) => {
    const [anio, mes, dia] = iso.split('-').map(Number);
    const festivo = festivosColombia(anio)[iso] || '';
    const titulo = iso === hoy ? 'Hoy' : iso === manana ? 'Mañana' : dia + ' de ' + MESES[mes - 1].toLowerCase();
    return '<section class="proximas-grupo"><h3 class="proximas-grupo__titulo">' + titulo +
      (festivo ? '<span class="insignia insignia--morado insignia--sin-punto">' + escaparHtml(festivo) + '</span>' : '') + '</h3>' +
      grupos[iso].map((t) => tarjetaTutoriaHTML(t, sesion.rol, 'compacta')).join('') + '</section>';
  }).join('');
}

// Llena el filtro de materias con las que aparecen en las tutorías, conservando la elegida.
function llenarFiltroMaterias() {
  const selector = calEl('calFiltroMateria');
  const elegida = selector.value;
  const materias = [...new Set(calendario.tutorias.map((t) => t.asignatura).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  selector.innerHTML = '<option value="">Todas las materias</option>' + materias.map((m) => '<option value="' + escaparHtml(m) + '">' + escaparHtml(m) + '</option>').join('');
  if (materias.includes(elegida)) selector.value = elegida;
}

// Abre el calendario: con «conservar» se queda en el mes y el día que se estaban viendo.
async function iniciarCalendario(conservar) {
  const textos = tituloCalendario();
  document.getElementById('calTituloPagina').textContent = textos.titulo;
  document.getElementById('calSubtituloPagina').textContent = textos.subtitulo;
  document.getElementById('calAcciones').classList.toggle('oculto', sesion.rol === 'admin');

  const destino = calendario.destino;
  calendario.destino = '';
  if (!conservar) {
    const [anio, mes] = hoyColombiaISO().split('-').map(Number);
    Object.assign(calendario, { anio, mes: mes - 1, seleccion: '' });
    calEl('calFiltroMateria').value = '';
    calEl('calFiltroEstado').value = '';
    calEl('calDetalleDia').classList.add('oculto');
  }
  if (destino) {
    const [anio, mes] = destino.split('-').map(Number);
    Object.assign(calendario, { anio, mes: mes - 1, seleccion: destino });
  }
  renderCalendario();

  try {
    calendario.tutorias = await cargarTutorias();
  } catch (err) {
    calEl('calProximas').innerHTML = estadoError(err.mensaje, 'iniciarCalendario(true)');
    mostrarTostada(err.mensaje || 'No se pudieron cargar las tutorías', 'error');
    return;
  }
  llenarFiltroMaterias();
  renderCalendario();
  renderProximas();
  pintarDetalleDia();
  if (destino) calEl('calDetalleDia').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Pasa al mes anterior o siguiente.
function calNavegar(delta) {
  const fecha = new Date(Date.UTC(calendario.anio, calendario.mes + delta, 1));
  Object.assign(calendario, { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth(), seleccion: '' });
  calEl('calDetalleDia').classList.add('oculto');
  renderCalendario();
}

// Salta al mes cuyo nombre empieza con el texto escrito.
function calBuscarMesInput(texto) {
  const buscado = String(texto || '').trim().toLowerCase();
  if (buscado.length < 2) return;
  const indice = MESES.findIndex((m) => m.toLowerCase().startsWith(buscado));
  if (indice === -1) return;
  Object.assign(calendario, { mes: indice, seleccion: '' });
  calEl('calDetalleDia').classList.add('oculto');
  renderCalendario();
  setTimeout(() => { calEl('calBuscarMes').value = ''; }, 900);
}

// Abre el detalle de un día; si el calendario no está a la vista, navega hacia él y deja el día para cuando cargue.
function calIrAFecha(iso) {
  if (!document.getElementById('pagina-mi-calendario').classList.contains('activa')) {
    calendario.destino = iso;
    irAPagina('mi-calendario');
    return;
  }
  const [anio, mes] = iso.split('-').map(Number);
  Object.assign(calendario, { anio, mes: mes - 1 });
  calClickDia(iso);
}
