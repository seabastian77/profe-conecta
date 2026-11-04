// Paneles del estudiante y del docente: indicadores, rendimiento, tutorías y estudiantes en alerta.

// Cuenta las tutorías no canceladas del mes en curso.
function tutoriasDelMes(tutorias) {
  const mes = hoyColombiaISO().slice(0, 7);
  return tutorias.filter((t) => String(t.fecha).slice(0, 7) === mes && normalizarEstado(t.estado) !== 'cancelada');
}

// Escribe un texto en el elemento con ese id si existe.
function ponerTexto(id, texto) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = texto;
}

// Devuelve el nivel de rendimiento según el promedio: texto, color del texto y color de la barra.
function estadoRendimiento(promedio) {
  if (!promedio) return { texto: 'Sin calificaciones registradas', clase: 'texto-tenue', relleno: '' };
  if (promedio < CONFIG.PROMEDIO_MINIMO) return { texto: 'En alerta académica', clase: 'texto-peligro', relleno: 'error' };
  if (promedio < 3.8) return { texto: 'Rendimiento aceptable', clase: 'texto-aviso', relleno: 'aviso' };
  if (promedio < 4.5) return { texto: 'Buen rendimiento', clase: 'texto-ok', relleno: 'ok' };
  return { texto: 'Excelente rendimiento', clase: 'texto-ok', relleno: 'ok' };
}

// Dibuja el promedio frente al mínimo aprobatorio y el resumen de sesiones.
function renderizarRendimiento(promedio, tutorias) {
  const envoltorio = document.getElementById('estGraficaWrap');
  const resumen = document.getElementById('estGraficaPie');
  if (!envoltorio || !resumen) return;

  const estado = estadoRendimiento(promedio);
  const minimo = CONFIG.PROMEDIO_MINIMO;
  const posicionMinimo = (minimo / 5) * 100;
  const relleno = estado.relleno ? ' progreso__relleno--' + estado.relleno : '';

  envoltorio.innerHTML =
    '<div class="rendimiento">' +
      '<div class="rendimiento__cifra">' +
        '<span class="rendimiento__valor ' + estado.clase + '">' + (promedio ? numeroCO(promedio, 1) : '—') + '</span>' +
        '<span class="rendimiento__estado ' + estado.clase + '">' + estado.texto + '</span>' +
      '</div>' +
      '<div class="rendimiento__escala">' +
        '<div class="progreso" role="meter" aria-label="Promedio acumulado" aria-valuemin="0" aria-valuemax="5" aria-valuenow="' + promedio + '" aria-valuetext="' + (promedio ? numeroCO(promedio, 1) + ' de 5,0' : 'Sin calificaciones') + '">' +
          '<div class="progreso__relleno' + relleno + '" data-ancho="' + Math.min(100, (promedio / 5) * 100) + '"></div>' +
          '<span class="progreso__marca" data-izq="' + posicionMinimo + '" title="Mínimo aprobatorio"></span>' +
        '</div>' +
        '<div class="rendimiento__marcas" aria-hidden="true">' +
          '<span data-izq="0">0,0</span><span class="minimo" data-izq="' + posicionMinimo + '">' + numeroCO(minimo, 1) + ' mínimo</span><span data-izq="100">5,0</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  aplicarAnchos(envoltorio);

  const activas = tutorias.filter((t) => normalizarEstado(t.estado) !== 'cancelada');
  const completadas = tutorias.filter((t) => normalizarEstado(t.estado) === 'completada').length;
  const pendientes = tutorias.filter((t) => ['pendiente', 'confirmada'].includes(normalizarEstado(t.estado))).length;
  const materias = new Set(activas.map((t) => t.asignatura)).size;
  const dato = (valor, etiqueta) => '<div class="resumen-dato"><span class="resumen-dato__valor">' + valor + '</span><span class="resumen-dato__etiqueta">' + etiqueta + '</span></div>';
  resumen.innerHTML = '<div class="rendimiento__resumen">' + dato(completadas, 'Sesiones completadas') + dato(pendientes, 'Sesiones pendientes') + dato(materias, 'Materias con apoyo') + '</div>';
}

// Muestra la tarjeta de alerta del estudiante según su promedio.
function pintarAlertaEstudiante(promedio) {
  const tarjeta = document.getElementById('estAlertaTarjeta');
  const minimo = numeroCO(CONFIG.PROMEDIO_MINIMO, 1);
  let clase = 'kpi';
  let valor = 'Sin datos';
  let detalle = 'Aún no hay promedio registrado';
  let nombreIcono = 'escudo-ok';

  if (promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO) {
    clase = 'kpi kpi--alerta';
    valor = 'Activa';
    detalle = 'Promedio por debajo del mínimo (' + minimo + ')';
    nombreIcono = 'escudo-alerta';
  } else if (promedio > 0) {
    clase = 'kpi kpi--ok';
    valor = 'Ninguna';
    detalle = 'Promedio sobre el mínimo (' + minimo + ')';
  }
  tarjeta.className = clase;
  document.getElementById('estAlertaIcono').innerHTML = icono(nombreIcono);
  ponerTexto('estAlertaValor', valor);
  ponerTexto('estAlertaDetalle', detalle);
}

// Carga y dibuja el panel del estudiante.
async function cargarPanelEstudiante() {
  const lista = document.getElementById('estListaTutorias');
  if (!lista.children.length) lista.innerHTML = esqueletoLista(2);

  const [resultadoPerfil, resultadoTutorias] = await Promise.allSettled([obtenerPerfil(), cargarTutorias()]);
  const perfil = resultadoPerfil.status === 'fulfilled' ? resultadoPerfil.value : null;
  const datosPerfil = (perfil && perfil.perfil) || {};
  const promedio = parseFloat(datosPerfil.promedio) || 0;

  ponerTexto('estudianteSaludo', (perfil && perfil.nombres ? perfil.nombres : sesion.nombre).split(' ')[0]);
  ponerTexto('panelEstPromedio', promedio > 0 ? numeroCO(promedio, 1) : '—');
  ponerTexto('panelEstSemestre', datosPerfil.semestre ? datosPerfil.semestre + '°' : '—');
  ponerTexto('panelEstPrograma', datosPerfil.programa || 'Programa sin registrar');
  pintarAlertaEstudiante(promedio);

  if (resultadoTutorias.status === 'rejected') {
    ponerTexto('estTutoriasCount', '—');
    ponerTexto('estTutoriasSubtitulo', 'No se pudieron cargar tus tutorías');
    lista.innerHTML = estadoError(resultadoTutorias.reason.mensaje, 'cargarPanelEstudiante()');
    renderizarRendimiento(promedio, []);
    return;
  }

  const tutorias = resultadoTutorias.value;
  const delMes = tutoriasDelMes(tutorias);
  ponerTexto('estTutoriasCount', delMes.length);
  ponerTexto('estTutoriasSubtitulo', tutorias.length
    ? tutorias.length + (tutorias.length === 1 ? ' tutoría registrada' : ' tutorías registradas') + ' · ' + delMes.length + ' este mes'
    : 'Aún no tienes tutorías');
  renderAccion('accionEstudiante', perfil && perfilEstaIncompleto('estudiante', perfil.perfil)
    ? accionPerfilIncompleto('estudiante')
    : accionEstudiante({ promedio, tutorias }));
  renderizarRendimiento(promedio, tutorias);
  pintarListaTutorias('estListaTutorias', 'estudiante');
}

// Construye la lista de estudiantes del docente que están en alerta, de menor a mayor promedio.
function obtenerEstudiantesEnAlerta(tutorias) {
  const porEstudiante = new Map();
  tutorias.forEach((t) => {
    if (!t.estudiante_id) return;
    if (!porEstudiante.has(t.estudiante_id)) {
      porEstudiante.set(t.estudiante_id, {
        id: t.estudiante_id,
        nombre: t.nombre_estudiante || 'Estudiante',
        sesiones: 0,
        materias: new Set(),
        promedio: t.promedio === null || t.promedio === undefined ? null : parseFloat(t.promedio),
      });
    }
    const estudiante = porEstudiante.get(t.estudiante_id);
    estudiante.sesiones++;
    estudiante.materias.add(t.asignatura);
  });
  return [...porEstudiante.values()]
    .filter((e) => e.promedio > 0 && e.promedio < CONFIG.PROMEDIO_MINIMO)
    .sort((a, b) => a.promedio - b.promedio);
}

// Dibuja las tarjetas de estudiantes en alerta con su nivel de riesgo.
function renderizarAlertasDocente(estudiantes) {
  const contenedor = document.getElementById('docListaAlertas');
  if (!estudiantes.length) {
    contenedor.innerHTML = estadoVacio({ icono: 'escudo-ok', titulo: 'Ningún estudiante en alerta', texto: 'Tus estudiantes tienen un promedio igual o superior al mínimo.', compacto: true });
    return;
  }
  contenedor.innerHTML = estudiantes.map((e) => {
    const nivel = e.promedio < 2.5 ? { clase: 'critico', texto: 'Crítico', insignia: 'error' }
      : e.promedio < 2.8 ? { clase: 'alto', texto: 'Alto', insignia: 'aviso' }
        : { clase: 'moderado', texto: 'Moderado', insignia: 'aviso' };
    const materias = [...e.materias].slice(0, 2).join(', ') || '—';
    return '<article class="alerta-estudiante alerta-estudiante--' + nivel.clase + '">' +
      '<span class="avatar">' + escaparHtml(iniciales(e.nombre)) + '</span>' +
      '<div class="alerta-estudiante__datos">' +
        '<span class="alerta-estudiante__nombre">' + escaparHtml(e.nombre) + '</span>' +
        '<span class="alerta-estudiante__detalle">' + e.sesiones + (e.sesiones === 1 ? ' sesión' : ' sesiones') + ' · ' + escaparHtml(materias) + '</span>' +
        '<span class="insignia insignia--' + nivel.insignia + '">' + nivel.texto + '</span>' +
      '</div>' +
      '<div class="alerta-estudiante__promedio">' + numeroCO(e.promedio, 1) + '<small>promedio</small></div>' +
    '</article>';
  }).join('');
}

// Carga y dibuja el panel del docente.
async function cargarPanelDocente() {
  const lista = document.getElementById('docListaTutorias');
  if (!lista.children.length) lista.innerHTML = esqueletoLista(2);
  ponerTexto('docenteSaludo', sesion.nombre.split(' ')[0]);

  const [resultadoTutorias, resultadoPerfil] = await Promise.allSettled([cargarTutorias(), obtenerPerfil()]);
  if (resultadoTutorias.status === 'rejected') {
    ['docEstudiantesCount', 'docAlertasCount', 'docTutoriasMes', 'docRecuperacion'].forEach((id) => ponerTexto(id, '—'));
    ponerTexto('docTutoriasSubtitulo', 'No se pudieron cargar tus tutorías');
    lista.innerHTML = estadoError(resultadoTutorias.reason.mensaje, 'cargarPanelDocente()');
    return;
  }
  const tutorias = resultadoTutorias.value;
  const perfilIncompleto = resultadoPerfil.status === 'fulfilled' && perfilEstaIncompleto('docente', resultadoPerfil.value.perfil);

  const delMes = tutoriasDelMes(tutorias);
  const estudiantes = new Set(tutorias.map((t) => t.estudiante_id));
  const enAlerta = obtenerEstudiantesEnAlerta(tutorias);
  const sinAlerta = estudiantes.size ? Math.round(((estudiantes.size - enAlerta.length) / estudiantes.size) * 100) + '%' : '—';

  ponerTexto('docEstudiantesCount', estudiantes.size);
  ponerTexto('docAlertasCount', enAlerta.length);
  ponerTexto('docTutoriasMes', delMes.length);
  ponerTexto('docRecuperacion', sinAlerta);
  document.getElementById('docAlertasTarjeta').className = enAlerta.length ? 'kpi kpi--alerta' : 'kpi';
  ponerTexto('docTutoriasSubtitulo', tutorias.length
    ? tutorias.length + (tutorias.length === 1 ? ' tutoría' : ' tutorías') + ' · ' + delMes.length + ' este mes'
    : 'Aún no tienes tutorías');

  renderAccion('accionDocente', perfilIncompleto
    ? accionPerfilIncompleto('docente')
    : accionDocente({ enAlerta: enAlerta.length, tutorias, tutoriasMes: delMes.length }));
  renderizarAlertasDocente(enAlerta);
  pintarListaTutorias('docListaTutorias', 'docente');
}
