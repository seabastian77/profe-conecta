// Busca elemento solo en la página activa del calendario
function calEl(id) {
  // Buscar primero en la página activa para evitar conflictos de IDs duplicados
  var pagina = document.querySelector('.pagina.activa');
  if (pagina) {
    var el = pagina.querySelector('#' + id);
    if (el) return el;
  }
  return document.getElementById(id);
}

// calendario.js — Calendario dinámico de asesorías
const CAL_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const CAL_FESTIVOS = {
  '2025-01-01':'Año Nuevo','2025-01-06':'Reyes Magos','2025-03-24':'San José',
  '2025-04-17':'Jueves Santo','2025-04-18':'Viernes Santo','2025-05-01':'Día del Trabajo',
  '2025-05-15':'Día del Maestro','2025-06-02':'Ascensión','2025-06-23':'Corpus Christi',
  '2025-06-29':'San Pedro y San Pablo','2025-07-20':'Independencia',
  '2025-08-07':'Batalla de Boyacá','2025-08-18':'Asunción',
  '2025-10-13':'Día de la Raza','2025-11-03':'Todos los Santos',
  '2025-11-17':'Indep. Cartagena','2025-12-08':'Inmaculada Concepción','2025-12-25':'Navidad',
  '2026-01-01':'Año Nuevo','2026-01-12':'Reyes Magos','2026-03-23':'San José',
  '2026-04-02':'Jueves Santo','2026-04-03':'Viernes Santo','2026-05-01':'Día del Trabajo',
  '2026-05-15':'Día del Maestro','2026-05-18':'Ascensión','2026-06-08':'Corpus Christi',
  '2026-06-15':'Sagrado Corazón','2026-06-29':'San Pedro y San Pablo',
  '2026-07-20':'Independencia','2026-08-07':'Batalla de Boyacá','2026-08-17':'Asunción',
  '2026-10-12':'Día de la Raza','2026-11-02':'Todos los Santos',
  '2026-11-16':'Indep. Cartagena','2026-12-08':'Inmaculada Concepción','2026-12-25':'Navidad'
};

const CAL_COLORES_ESTADO = {
  pendiente:  { bg:'#007b99', texto:'#fff', punto:'#007b99' },
  confirmada: { bg:'#059669', texto:'#fff', punto:'#059669' },
  completada: { bg:'#7c3aed', texto:'#fff', punto:'#7c3aed' },
  cancelada:  { bg:'#dc2626', texto:'#fff', punto:'#dc2626' }
};

let _cal = { mes: new Date().getMonth(), anio: new Date().getFullYear(), tutorias: [], diaSeleccionado: null };

async function iniciarCalendario() {
  _cal.mes = new Date().getMonth();
  _cal.anio = new Date().getFullYear();
  _cal.diaSeleccionado = null;
  const detalle = calEl('calDetalleDia');
  if (detalle) detalle.style.display = 'none';

  try {
    const data = await llamarAPI('/tutorias', 'GET');
    _cal.tutorias = Array.isArray(data) ? data : [];
  } catch(e) {
    _cal.tutorias = (typeof academicoStorage !== 'undefined' ? academicoStorage.getTutorias() : []) || [];
  }

  // Llenar filtro de materias
  var selMat = calEl('calFiltroMateria');
  if (selMat) {
    var mats = [...new Set(_cal.tutorias.map(t => t.asignatura).filter(Boolean))].sort();
    selMat.innerHTML = '<option value="">📚 Todas las materias</option>' +
      mats.map(m => '<option value="' + m + '">' + m + '</option>').join('');
  }

  renderCalendario();
  renderProximas();
}

function renderCalendario() {
  var celdas = calEl('calCeldas');
  var titulo = calEl('calTitulo');
  if (!celdas || !titulo) return;

  var mes = _cal.mes, anio = _cal.anio;
  titulo.textContent = CAL_MESES[mes] + ' ' + anio;

  var fMat = (calEl('calFiltroMateria') || {}).value || '';
  var fEst = (calEl('calFiltroEstado') || {}).value || '';
  var tutFilt = _cal.tutorias.filter(function(t) {
    if (fMat && t.asignatura !== fMat) return false;
    if (fEst && t.estado !== fEst) return false;
    return true;
  });

  // Agrupar por día del mes actual
  var porDia = {};
  tutFilt.forEach(function(t) {
    if (!t.fecha) return;
    var pts = t.fecha.split('-').map(Number);
    if (pts[0] === anio && (pts[1]-1) === mes) {
      if (!porDia[pts[2]]) porDia[pts[2]] = [];
      porDia[pts[2]].push(t);
    }
  });

  var primerDia = new Date(anio, mes, 1);
  var diasEnMes = new Date(anio, mes + 1, 0).getDate();
  var offset = primerDia.getDay();
  offset = offset === 0 ? 6 : offset - 1;

  var hoy = new Date();
  var esHoyMes = hoy.getMonth() === mes && hoy.getFullYear() === anio;
  var html = '';

  for (var i = 0; i < offset; i++) {
    html += '<div style="min-height:72px;border-radius:8px;background:#f9fafb"></div>';
  }

  for (var dia = 1; dia <= diasEnMes; dia++) {
    var mm = String(mes+1).padStart(2,'0'), dd = String(dia).padStart(2,'0');
    var fechaStr = anio + '-' + mm + '-' + dd;
    var festivo = CAL_FESTIVOS[fechaStr] || '';
    var sesiones = porDia[dia] || [];
    var esHoy = esHoyMes && hoy.getDate() === dia;
    var esSel = _cal.diaSeleccionado === dia;
    var dSem = new Date(anio, mes, dia).getDay();
    var esFin = dSem === 0 || dSem === 6;

    var bg = festivo ? '#fffbeb' : esHoy ? '#e0f4f8' : esSel ? '#dbeafe' : esFin ? '#fafafa' : '#fff';
    var border = esHoy ? '2px solid #007b99' : esSel ? '2px solid #3b82f6' : '0.5px solid #e5e7eb';
    var numColor = esFin ? '#ef4444' : esHoy ? '#007b99' : '#1f2937';

    var puntos = sesiones.slice(0,5).map(function(s) {
      var col = (CAL_COLORES_ESTADO[s.estado] || CAL_COLORES_ESTADO.pendiente).punto;
      return '<span title="' + (s.asignatura||'') + '" style="width:7px;height:7px;border-radius:50%;background:' + col + ';display:inline-block;flex-shrink:0"></span>';
    }).join('') + (sesiones.length > 5 ? '<span style="font-size:9px;color:#999">+' + (sesiones.length-5) + '</span>' : '');

    var tooltip = sesiones.length > 0
      ? sesiones.length + ' asesoría' + (sesiones.length>1?'s':'') + ': ' + sesiones.map(function(s){return s.asignatura;}).join(', ')
      : festivo;

    html += '<div onclick="calClickDia(' + dia + ')" title="' + tooltip + '"' +
      ' style="min-height:72px;border-radius:8px;border:' + border + ';background:' + bg + ';' +
      'padding:6px 5px;cursor:' + (sesiones.length||festivo?'pointer':'default') + ';transition:transform 0.12s"' +
      ' onmouseover="this.style.transform=\'scale(1.04)\';this.style.zIndex=\'10\'"' +
      ' onmouseout="this.style.transform=\'\';this.style.zIndex=\'\'">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
      '<span style="font-size:13px;font-weight:' + (esHoy?'700':'500') + ';color:' + numColor + '">' + dia + '</span>' +
      (esHoy ? '<span style="font-size:8px;background:#007b99;color:#fff;border-radius:4px;padding:1px 4px">HOY</span>' : '') +
      '</div>' +
      (festivo ? '<div style="font-size:8px;color:#92400e;margin-top:2px;line-height:1.2;font-weight:500">🎉 ' + festivo + '</div>' : '') +
      (sesiones.length > 0 ? '<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:4px">' + puntos + '</div>' +
        '<div style="font-size:9px;color:#666;margin-top:2px">' + sesiones.length + ' ses.</div>' : '') +
      '</div>';
  }

  celdas.innerHTML = html;
}

function calClickDia(dia) {
  _cal.diaSeleccionado = dia;
  renderCalendario();

  var mes = _cal.mes, anio = _cal.anio;
  var fechaStr = anio + '-' + String(mes+1).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
  var festivo = CAL_FESTIVOS[fechaStr] || '';

  var fMat = (calEl('calFiltroMateria') || {}).value || '';
  var fEst = (calEl('calFiltroEstado') || {}).value || '';
  var sesiones = _cal.tutorias.filter(function(t) {
    if (t.fecha !== fechaStr) return false;
    if (fMat && t.asignatura !== fMat) return false;
    if (fEst && t.estado !== fEst) return false;
    return true;
  });

  var detalle = calEl('calDetalleDia');
  var tituloEl = document.querySelector('#calDetalleTitulo h3');
  var contenido = calEl('calDetalleContenido');
  if (!detalle || !contenido) return;

  var diaFmt = dia + ' de ' + CAL_MESES[mes] + ' ' + anio;
  if (tituloEl) tituloEl.textContent = '📅 Sesiones del ' + diaFmt;

  var rolActual = (typeof sesion !== 'undefined') ? sesion.rol : '';
  var esDocente = rolActual === 'docente';

  var html = '';
  if (festivo) html += '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">🎉 <strong>Festivo:</strong> ' + festivo + '</div>';

  if (sesiones.length === 0) {
    html += '<p class="sin-datos">Sin asesorías programadas para este día.</p>';
  } else {
    sesiones.forEach(function(s) {
      var col = CAL_COLORES_ESTADO[s.estado] || CAL_COLORES_ESTADO.pendiente;
      var persona = esDocente ? (s.nombre_estudiante || 'Estudiante') : (s.nombre_docente || 'Docente');
      var rolLabel = esDocente ? '🎓 Estudiante' : '👩‍🏫 Docente';
      var hora = (s.hora || '').slice(0,5);
      var iconMod = (s.modalidad||'').toLowerCase().includes('virtual') ? '💻' : '🏫';
      html += '<div style="border:0.5px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;border-left:4px solid ' + col.punto + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<span style="font-weight:600;font-size:14px;color:#1f2937">' + (s.asignatura||'—') + '</span>' +
        '<span style="font-size:11px;background:' + col.bg + ';color:' + col.texto + ';padding:3px 10px;border-radius:20px;font-weight:500">' + (s.estado||'pendiente') + '</span>' +
        '</div>' +
        '<div style="font-size:12px;color:#555;display:flex;flex-direction:column;gap:4px">' +
        '<span>' + rolLabel + ': <strong>' + persona + '</strong></span>' +
        '<span>' + iconMod + ' ' + hora + ' · 🖥️ ' + (s.modalidad||'Virtual') + '</span>' +
        (s.observaciones ? '<span>📝 ' + s.observaciones + '</span>' : '') +
        '</div>' +
        (s.estado === 'pendiente' ? '<button class="btn-secundario" onclick="cancelarTutoria(' + s.id + ')" type="button" style="margin-top:10px;font-size:11px;padding:5px 12px;color:#ef4444;border-color:#fca5a5">Cancelar asesoría</button>' : '') +
        '</div>';
    });
  }

  contenido.innerHTML = html;
  detalle.style.display = 'block';
  detalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderProximas() {
  var cont = calEl('calProximas');
  if (!cont) return;
  var hoy = new Date(); hoy.setHours(0,0,0,0);
  var todayStr = hoy.toISOString().split('T')[0];
  var tom = new Date(hoy); tom.setDate(tom.getDate()+1);
  var tomStr = tom.toISOString().split('T')[0];

  var proximas = _cal.tutorias
    .filter(function(t) {
      if (!t.fecha || t.estado === 'cancelada') return false;
      return new Date(t.fecha + 'T00:00') >= hoy;
    })
    .sort(function(a,b){ return (a.fecha+a.hora).localeCompare(b.fecha+b.hora); })
    .slice(0, 15);

  if (proximas.length === 0) {
    cont.innerHTML = '<p class="sin-datos" style="font-size:12px">Sin asesorías próximas</p>'; return;
  }

  var grupos = {};
  proximas.forEach(function(t) {
    if (!grupos[t.fecha]) grupos[t.fecha] = [];
    grupos[t.fecha].push(t);
  });

  var rolActual = (typeof sesion !== 'undefined') ? sesion.rol : '';
  var esDocente = rolActual === 'docente';
  var html = '';

  Object.keys(grupos).sort().forEach(function(fecha) {
    var pts = fecha.split('-').map(Number);
    var festivo = CAL_FESTIVOS[fecha] || '';
    var label;
    if (fecha === todayStr) label = '🔴 Hoy';
    else if (fecha === tomStr) label = '🟡 Mañana';
    else label = '📅 ' + pts[2] + ' de ' + CAL_MESES[pts[1]-1];

    html += '<div style="margin-bottom:14px"><div style="font-size:10px;font-weight:600;color:#007b99;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;padding-bottom:4px;border-bottom:0.5px solid #e5e7eb">' +
      label + (festivo ? ' · 🎉 ' + festivo : '') + '</div>';

    grupos[fecha].forEach(function(t) {
      var col = (CAL_COLORES_ESTADO[t.estado] || CAL_COLORES_ESTADO.pendiente).punto;
      var persona = esDocente ? (t.nombre_estudiante||'Estudiante') : (t.nombre_docente||'Docente');
      var hora = (t.hora||'').slice(0,5);
      var iconMod = (t.modalidad||'').toLowerCase().includes('virtual') ? '💻' : '🏫';
      html += '<div style="padding:8px 10px;border-radius:8px;background:#f9fafb;border-left:3px solid ' + col + ';margin-bottom:5px;font-size:12px;cursor:pointer" onclick="calIrAFecha(\'' + fecha + '\')">' +
        '<div style="font-weight:600;color:#1f2937">' + (t.asignatura||'—') + '</div>' +
        '<div style="color:#666;margin-top:2px">' + iconMod + ' ' + hora + ' · ' + persona + '</div></div>';
    });
    html += '</div>';
  });

  cont.innerHTML = html;
}

function calNavegar(delta) {
  _cal.mes += delta;
  if (_cal.mes > 11) { _cal.mes = 0; _cal.anio++; }
  if (_cal.mes < 0)  { _cal.mes = 11; _cal.anio--; }
  _cal.diaSeleccionado = null;
  var det = calEl('calDetalleDia');
  if (det) det.style.display = 'none';
  renderCalendario();
}

function calBuscarMesInput(q) {
  if (!q || q.trim().length < 2) return;
  var idx = CAL_MESES.findIndex(function(m){ return m.toLowerCase().startsWith(q.trim().toLowerCase()); });
  if (idx !== -1) {
    _cal.mes = idx; _cal.diaSeleccionado = null;
    renderCalendario();
    setTimeout(function(){ var el = calEl('calBuscarMes'); if(el) el.value=''; }, 800);
  }
}

function calIrAFecha(fechaStr) {
  var pts = fechaStr.split('-').map(Number);
  _cal.anio = pts[0]; _cal.mes = pts[1] - 1;
  renderCalendario();
  setTimeout(function(){ calClickDia(pts[2]); }, 80);
}
