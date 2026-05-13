// ═══════════════════════════════════════════════════════
// asignaturas.js — Autocomplete con área/programa + creación dinámica
// ═══════════════════════════════════════════════════════

let _asignaturasSeleccionadas = [];
let _busquedaTimeout = null;

const AREAS_PROGRAMAS = {
  'Ingenierías y Arquitectura': ['Sistemas','Industrial','Civil','Arquitectura'],
  'Ciencias Sociales, Salud y Bienestar': ['Psicología','Trabajo Social','Deporte'],
  'Derecho y Ciencias Políticas': ['Derecho','Criminalística'],
  'Ciencias Administrativas, Económicas y Contables': ['Administración y Negocios','Contaduría','Gastronomía'],
  'Comunicación, Publicidad y Diseño': ['Comunicación Social','Publicidad','Diseño Gráfico'],
  'Educación y Humanidades': ['Licenciaturas','Filosofía y Teología'],
  'Ciencias Básicas': ['Matemáticas','Investigación'],
  'Institucional': ['Obligatorias','Inglés'],
  'General': ['General']
};

function inicializarAutocompleteAsignaturas() {
  _asignaturasSeleccionadas = [];
  renderizarTags();
  const input = document.getElementById('docAsignaturaInput');
  if (input) input.value = '';
  actualizarHiddenJSON();
  document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('docAsignaturaDropdown');
    const input = document.getElementById('docAsignaturaInput');
    if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

async function buscarAsignatura(q) {
  clearTimeout(_busquedaTimeout);
  const dropdown = document.getElementById('docAsignaturaDropdown');
  if (!dropdown) return;
  if (!q || q.trim().length === 0) { dropdown.style.display = 'none'; return; }

  _busquedaTimeout = setTimeout(async () => {
    try {
      const resultados = await llamarAPI('/asignaturas?q=' + encodeURIComponent(q.trim()), 'GET');
      const disponibles = resultados.filter(r => !_asignaturasSeleccionadas.some(s => s.id === r.id));

      // Agrupar por área y programa
      const grupos = {};
      for (const r of disponibles) {
        const key = (r.area || 'General') + ' › ' + (r.programa || 'General');
        if (!grupos[key]) grupos[key] = { label: key, items: [] };
        grupos[key].items.push(r);
      }

      let html = '';
      for (const key of Object.keys(grupos)) {
        html += `<div style="padding:4px 12px;font-size:10px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em;background:#f9f9f9;border-bottom:0.5px solid #eee">${grupos[key].label}</div>`;
        html += grupos[key].items.map(r => `
          <div onclick="seleccionarAsignatura(${r.id},'${r.nombre.replace(/'/g,"\\'")}','${(r.area||'').replace(/'/g,"\\'")}','${(r.programa||'').replace(/'/g,"\\'")}' )"
            style="padding:8px 16px;cursor:pointer;font-size:13px;border-bottom:0.5px solid #f5f5f5;display:flex;align-items:center;gap:8px"
            onmouseover="this.style.background='#f0f9fb'" onmouseout="this.style.background=''">
            <span style="color:#007b99">📚</span> ${r.nombre}
          </div>`).join('');
      }

      const textoExacto = q.trim().toLowerCase();
      const existeExacto = resultados.some(r => r.nombre.toLowerCase() === textoExacto);
      const yaSeleccionado = _asignaturasSeleccionadas.some(s => s.nombre.toLowerCase() === textoExacto);
      if (!existeExacto && !yaSeleccionado && q.trim().length >= 2) {
        html += `
          <div onclick="abrirModalCrearAsignatura('${q.trim().replace(/'/g,"\\'")}')"
            style="padding:10px 16px;cursor:pointer;font-size:13px;background:#f0fdf4;border-top:1px solid #d1fae5;display:flex;align-items:center;gap:8px"
            onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
            <span style="color:#16a34a;font-size:16px">✨</span>
            <div><strong>Crear nueva materia:</strong> "${q.trim()}"<br><span style="font-size:11px;color:#888">Podrás asignarle un área y programa</span></div>
          </div>`;
      }
      if (!html) html = `<div style="padding:10px 14px;font-size:13px;color:#999">Sin resultados para "${q}"</div>`;
      dropdown.innerHTML = html;
      dropdown.style.display = 'block';
    } catch(err) {
      const q2 = (document.getElementById('docAsignaturaInput') || {}).value || '';
      if (q2.trim().length >= 2) {
        dropdown.innerHTML = `
          <div onclick="abrirModalCrearAsignatura('${q2.trim().replace(/'/g,"\\'")}')"
            style="padding:10px 16px;cursor:pointer;font-size:13px;background:#f0fdf4;display:flex;align-items:center;gap:8px">
            <span style="color:#16a34a">✨</span>
            <strong>Crear "${q2.trim()}"</strong>
          </div>`;
        dropdown.style.display = 'block';
      }
    }
  }, 250);
}

function seleccionarAsignatura(id, nombre, area, programa) {
  if (_asignaturasSeleccionadas.some(s => s.id === id)) return;
  _asignaturasSeleccionadas.push({ id, nombre, area: area || '', programa: programa || '' });
  renderizarTags();
  actualizarHiddenJSON();
  const input = document.getElementById('docAsignaturaInput');
  const dropdown = document.getElementById('docAsignaturaDropdown');
  if (input) input.value = '';
  if (dropdown) dropdown.style.display = 'none';
}

// Modal para crear materia nueva con área y programa
function abrirModalCrearAsignatura(nombreSugerido) {
  const dropdown = document.getElementById('docAsignaturaDropdown');
  if (dropdown) dropdown.style.display = 'none';

  const existente = document.getElementById('modalCrearAsignatura');
  if (existente) existente.remove();

  const areasOpts = Object.keys(AREAS_PROGRAMAS).map(a =>
    `<option value="${a}">${a}</option>`
  ).join('');

  const modal = document.createElement('div');
  modal.id = 'modalCrearAsignatura';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-caja" style="max-width:420px">
      <div class="modal-cabecera">
        <h3>✨ Nueva Materia</h3>
        <button class="modal-cerrar" type="button" onclick="document.getElementById('modalCrearAsignatura').remove()">✕</button>
      </div>
      <div class="modal-cuerpo" style="display:flex;flex-direction:column;gap:14px">
        <div class="campo">
          <label class="campo__etiqueta">Nombre de la materia</label>
          <input type="text" id="nuevaAsigNombre" class="campo__entrada" value="${nombreSugerido || ''}" placeholder="Ej: Álgebra Abstracta"/>
        </div>
        <div class="campo">
          <label class="campo__etiqueta">Área académica</label>
          <div class="campo__selector-contenedor">
            <select id="nuevaAsigArea" class="campo__entrada campo__selector" onchange="actualizarProgramasModal()">
              <option value="">— Selecciona un área —</option>
              ${areasOpts}
            </select>
            <span class="campo__flecha">▾</span>
          </div>
        </div>
        <div class="campo">
          <label class="campo__etiqueta">Programa</label>
          <div class="campo__selector-contenedor">
            <select id="nuevaAsigPrograma" class="campo__entrada campo__selector">
              <option value="">— Primero elige el área —</option>
            </select>
            <span class="campo__flecha">▾</span>
          </div>
        </div>
        <div style="background:#f0f9fb;border-radius:8px;padding:10px 12px;font-size:12px;color:#007b99">
          💡 La materia quedará disponible para todos los docentes y estudiantes del sistema.
        </div>
      </div>
      <div class="modal-pie">
        <button class="btn-secundario" type="button" onclick="document.getElementById('modalCrearAsignatura').remove()">Cancelar</button>
        <button class="btn-primario" type="button" onclick="confirmarCrearAsignatura()">✨ Crear y Agregar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function actualizarProgramasModal() {
  const area = document.getElementById('nuevaAsigArea').value;
  const sel = document.getElementById('nuevaAsigPrograma');
  if (!area || !AREAS_PROGRAMAS[area]) {
    sel.innerHTML = '<option value="">— Primero elige el área —</option>';
    return;
  }
  sel.innerHTML = '<option value="">— Selecciona programa —</option>' +
    AREAS_PROGRAMAS[area].map(p => `<option value="${p}">${p}</option>`).join('');
}

async function confirmarCrearAsignatura() {
  const nombre = (document.getElementById('nuevaAsigNombre') || {}).value.trim();
  const area = (document.getElementById('nuevaAsigArea') || {}).value;
  const programa = (document.getElementById('nuevaAsigPrograma') || {}).value;

  if (!nombre) { mostrarTostada('Escribe el nombre de la materia', 'error'); return; }

  try {
    const resultado = await llamarAPI('/asignaturas', 'POST', { nombre, area, programa });
    document.getElementById('modalCrearAsignatura').remove();
    seleccionarAsignatura(resultado.id, resultado.nombre, resultado.area, resultado.programa);
    if (resultado.nueva) {
      mostrarTostada(`✨ Materia "${resultado.nombre}" creada y disponible globalmente`, 'exito');
    } else {
      mostrarTostada(`Materia "${resultado.nombre}" ya existía — agregada`, 'exito');
    }
  } catch(err) {
    const tempId = -Date.now();
    document.getElementById('modalCrearAsignatura').remove();
    seleccionarAsignatura(tempId, nombre, area, programa);
    mostrarTostada(`Materia "${nombre}" agregada`, 'exito');
  }
}

function quitarAsignatura(id) {
  _asignaturasSeleccionadas = _asignaturasSeleccionadas.filter(s => s.id !== id);
  renderizarTags();
  actualizarHiddenJSON();
}

function renderizarTags() {
  const contenedor = document.getElementById('docAsignaturasSeleccionadas');
  if (!contenedor) return;
  if (_asignaturasSeleccionadas.length === 0) {
    contenedor.innerHTML = '<span style="font-size:12px;color:#aaa;padding:4px 0">Sin materias seleccionadas</span>';
    return;
  }
  contenedor.innerHTML = _asignaturasSeleccionadas.map(a => `
    <span title="${a.area || ''} › ${a.programa || ''}"
      style="display:inline-flex;align-items:center;gap:5px;background:#e0f4f8;color:#007b99;
             border-radius:20px;padding:4px 12px;font-size:13px;font-weight:500;cursor:default">
      📚 ${a.nombre}
      <button type="button" onclick="quitarAsignatura(${a.id})"
        style="background:none;border:none;cursor:pointer;color:#007b99;font-size:15px;padding:0;opacity:0.7;line-height:1">×</button>
    </span>`).join('');
}

function actualizarHiddenJSON() {
  const hidden = document.getElementById('docAsignaturasJSON');
  if (hidden) hidden.value = JSON.stringify(_asignaturasSeleccionadas.map(a => a.nombre));
}

function manejarTeclaAsignatura(e) {
  const dropdown = document.getElementById('docAsignaturaDropdown');
  if (e.key === 'Escape') { if (dropdown) dropdown.style.display = 'none'; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = (document.getElementById('docAsignaturaInput') || {}).value.trim();
    if (q.length >= 2) abrirModalCrearAsignatura(q);
  }
}

async function cargarAsignaturasEnSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  try {
    const asignaturas = await llamarAPI('/asignaturas/todas', 'GET');
    // Agrupar por área
    const grupos = {};
    for (const a of asignaturas) {
      const area = a.area || 'General';
      if (!grupos[area]) grupos[area] = [];
      grupos[area].push(a);
    }
    let html = '<option value="">— Selecciona materia —</option>';
    for (const area of Object.keys(grupos).sort()) {
      html += `<optgroup label="${area}">`;
      for (const a of grupos[area]) {
        html += `<option value="${a.nombre}">${a.nombre}</option>`;
      }
      html += '</optgroup>';
    }
    select.innerHTML = html;
  } catch(err) {
    const base = ['Programación I','Bases de Datos','Cálculo Diferencial','Inglés I','Álgebra Lineal','Estadística Descriptiva'];
    select.innerHTML = '<option value="">— Selecciona materia —</option>' + base.map(n => `<option value="${n}">${n}</option>`).join('');
  }
}
