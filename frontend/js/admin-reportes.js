// Administración de reportes: indicadores por período y exportación a PDF y a Excel.

const estadoReporte = { reporte: null };

registrarLimpieza(() => {
  estadoReporte.reporte = null;
});

// Devuelve el período del reporte para mostrarlo y exportarlo.
function textoPeriodoReporte(reporte) {
  if (!reporte.periodo) return 'Todo el histórico';
  return reporte.periodo.nombre + ' (' + fechaCorta(reporte.periodo.inicio) + ' — ' + fechaCorta(reporte.periodo.fin) + ')';
}

// Devuelve una barra de porcentaje en miniatura; su ancho se aplica después con aplicarAnchos.
function miniBarra(porcentaje, alerta) {
  const ancho = Math.max(0, Math.min(100, Math.round(Number(porcentaje) || 0)));
  return '<span class="mini-barra' + (alerta ? ' mini-barra--alerta' : '') + '" aria-hidden="true"><span data-ancho="' + ancho + '"></span></span>';
}

// Carga el reporte del período elegido; sin argumento conserva el período que ya se está viendo.
async function cargarReportes(periodo) {
  const generacion = generacionAdmin;
  const selector = document.getElementById('filtroPeriodo');
  const pedido = periodo === undefined ? (selector && selector.dataset.cargado ? selector.value : '') : periodo;
  try {
    const reporte = await llamarAPI('/admin/reportes' + (pedido ? '?periodo=' + encodeURIComponent(pedido) : ''), 'GET');
    if (generacion !== generacionAdmin) return;
    estadoReporte.reporte = reporte;
    if (selector) {
      const opciones = reporte.periodos.map((p) =>
        new Option(p.nombre + (p.estado === 'activo' ? ' (actual)' : p.estado === 'proximo' ? ' (próximo)' : ''), p.id));
      selector.replaceChildren(...opciones, new Option('Todo el histórico', 'todos'));
      selector.value = reporte.periodo ? String(reporte.periodo.id) : 'todos';
      selector.dataset.cargado = '1';
    }
    pintarReporte(reporte);
    ponerTexto('reporteNota', 'Período: ' + textoPeriodoReporte(reporte) +
      '. Las tutorías se cuentan por las fechas del período; las alertas y los promedios muestran el estado actual.');
  } catch (err) {
    if (generacion !== generacionAdmin) return;
    ponerTexto('reporteNota', err.mensaje || 'No se pudo cargar el reporte');
    const cuerpo = document.getElementById('cuerpoReporteProgramas');
    if (cuerpo) cuerpo.innerHTML = filaError(6, err.mensaje, 'cargarReportes()');
  }
}

// Pinta los indicadores y la tabla por programa de un reporte.
function pintarReporte(reporte) {
  const i = reporte.indicadores;
  const umbral = numeroCO(reporte.umbral, 1);
  ponerTexto('repTutorias', miles(i.total_tutorias));
  ponerTexto('repTutoriasDetalle', conteoTexto(i.tutorias_completadas, 'completada', 'completadas') + ' · ' +
    conteoTexto(i.tutorias_pendientes, 'pendiente', 'pendientes') + ' · ' + conteoTexto(i.tutorias_canceladas, 'cancelada', 'canceladas'));
  ponerTexto('repAlertas', miles(i.alertas_activas));
  ponerTexto('repAlertasDetalle', 'Promedio menor a ' + umbral);
  ponerTexto('repRecuperacion', i.tasa_recuperacion === null ? '—' : i.tasa_recuperacion + '%');
  ponerTexto('repRecuperacionDetalle', i.estudiantes_recuperados + ' de ' + conteoTexto(i.perfiles_estudiante, 'perfil', 'perfiles') + ' con promedio ≥ ' + umbral);
  ponerTexto('repEstudiantes', miles(i.estudiantes_activos));
  ponerTexto('repEstudiantesDetalle', i.perfiles_estudiante + ' con perfil registrado');
  ponerTexto('repDocentes', miles(i.docentes_tutores));
  ponerTexto('repPromedio', numeroCO(i.promedio_general, 2));
  ponerTexto('repPromedioDetalle', conteoTexto(i.estudiantes_con_promedio, 'estudiante', 'estudiantes') + ' con promedio registrado');

  const cuerpo = document.getElementById('cuerpoReporteProgramas');
  if (!cuerpo) return;
  cuerpo.innerHTML = reporte.por_programa.length
    ? reporte.por_programa.map((p) => '<tr>' +
        celda('Programa', escaparHtml(p.programa), 'celda-principal') +
        celda('Estudiantes', miles(p.estudiantes), 'num') +
        celda('Alertas', miles(p.alertas), 'num') +
        celda('% de alerta', miniBarra(p.porcentaje_alerta, true) + numeroCO(p.porcentaje_alerta, 1) + '%', 'num') +
        celda('Tutorías realizadas', miles(p.tutorias_realizadas), 'num') +
        celda('Recuperación', miniBarra(p.recuperacion, false) + p.recuperacion + '%', 'num') + '</tr>').join('')
    : filaMensaje(6, 'Aún no hay estudiantes con perfil');
  aplicarAnchos(cuerpo);
}

// Abre la impresión del reporte que se está viendo para guardarlo como PDF.
function exportarReportePDF() {
  const reporte = estadoReporte.reporte;
  if (!reporte) {
    mostrarTostada('Espera a que cargue el reporte', 'advertencia');
    return;
  }
  const i = reporte.indicadores;
  const umbral = numeroCO(reporte.umbral, 1);
  const filas = reporte.por_programa.map((p) =>
    '<tr><td>' + escaparHtml(p.programa) + '</td><td>' + p.estudiantes + '</td><td>' + p.alertas + '</td><td>' +
    numeroCO(p.porcentaje_alerta, 1) + '%</td><td>' + p.tutorias_realizadas + '</td><td>' + p.recuperacion + '%</td></tr>').join('');

  const zona = document.createElement('div');
  zona.className = 'zona-impresion';
  zona.innerHTML =
    '<h1>Reporte académico — ConectaProfe</h1>' +
    '<p>Universidad Católica Luis Amigó</p>' +
    '<p><strong>Período:</strong> ' + escaparHtml(textoPeriodoReporte(reporte)) + '</p>' +
    '<p><strong>Generado:</strong> ' + escaparHtml(new Date().toLocaleString('es-CO')) + '</p>' +
    '<h2>Indicadores</h2>' +
    '<table><tbody>' +
    '<tr><th>Tutorías programadas</th><td>' + i.total_tutorias + ' (completadas ' + i.tutorias_completadas + ', pendientes ' + i.tutorias_pendientes + ', canceladas ' + i.tutorias_canceladas + ')</td></tr>' +
    '<tr><th>Alertas activas (promedio menor a ' + umbral + ')</th><td>' + i.alertas_activas + '</td></tr>' +
    '<tr><th>Tasa de recuperación</th><td>' + (i.tasa_recuperacion === null ? '—' : i.tasa_recuperacion + '%') + ' — ' + i.estudiantes_recuperados + ' de ' + i.perfiles_estudiante + ' perfiles</td></tr>' +
    '<tr><th>Estudiantes activos</th><td>' + i.estudiantes_activos + '</td></tr>' +
    '<tr><th>Docentes tutores</th><td>' + i.docentes_tutores + '</td></tr>' +
    '<tr><th>Promedio general</th><td>' + numeroCO(i.promedio_general, 2) + ' (' + i.estudiantes_con_promedio + ' con promedio registrado)</td></tr>' +
    '</tbody></table>' +
    '<h2>Alertas por programa académico</h2>' +
    '<table><thead><tr><th>Programa</th><th>Estudiantes</th><th>Alertas</th><th>% de alerta</th><th>Tutorías realizadas</th><th>Recuperación</th></tr></thead>' +
    '<tbody>' + (filas || '<tr><td colspan="6">Sin estudiantes con perfil</td></tr>') + '</tbody></table>' +
    '<p>Las tutorías se cuentan por las fechas del período. Las alertas y los promedios muestran el estado actual.</p>';

  document.body.appendChild(zona);
  document.body.classList.add('imprimiendo-reporte');
  const limpiar = () => {
    document.body.classList.remove('imprimiendo-reporte');
    zona.remove();
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  mostrarTostada('Se abrió la impresión: elige «Guardar como PDF»', 'info');
  setTimeout(() => {
    window.print();
    setTimeout(limpiar, 1000);
  }, 50);
}

// Descarga el reporte que se está viendo como CSV para Excel.
function exportarReporteExcel() {
  const reporte = estadoReporte.reporte;
  if (!reporte) {
    mostrarTostada('Espera a que cargue el reporte', 'advertencia');
    return;
  }
  const i = reporte.indicadores;
  const filas = [
    ['Reporte académico ConectaProfe'],
    ['Período', textoPeriodoReporte(reporte)],
    ['Generado', new Date().toLocaleString('es-CO')],
    [],
    ['Indicador', 'Valor'],
    ['Tutorías programadas', i.total_tutorias],
    ['Tutorías completadas', i.tutorias_completadas],
    ['Tutorías pendientes', i.tutorias_pendientes],
    ['Tutorías canceladas', i.tutorias_canceladas],
    ['Alertas activas', i.alertas_activas],
    ['Tasa de recuperación (%)', i.tasa_recuperacion === null ? '' : i.tasa_recuperacion],
    ['Estudiantes activos', i.estudiantes_activos],
    ['Docentes tutores', i.docentes_tutores],
    ['Promedio general', numeroCO(i.promedio_general, 2)],
    [],
    ['Programa', 'Estudiantes', 'Alertas', '% de alerta', 'Tutorías realizadas', 'Recuperación (%)'],
  ].concat(reporte.por_programa.map((p) => [p.programa, p.estudiantes, p.alertas, numeroCO(p.porcentaje_alerta, 1), p.tutorias_realizadas, p.recuperacion]));

  descargarArchivo('reporte-conectaprofe-' + hoyColombiaISO() + '.csv', armarCSV(filas), 'text/csv;charset=utf-8');
  mostrarTostada('Reporte descargado: ábrelo con Excel', 'exito');
}
