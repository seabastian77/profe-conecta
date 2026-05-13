// ═══════════════════════════════════════════════════════
// facultad.js — Select de facultad con búsqueda + programas dinámicos
// ═══════════════════════════════════════════════════════

// Estructura completa de facultades y programas de FUNLAM
// Cada facultad mapea al 'area' en la tabla asignaturas
const FACULTADES_FUNLAM = [
  {
    nombre: 'Facultad de Ingenierías',
    area: 'Ingenierías y Arquitectura',
    icono: '⚙️',
    programas: ['Sistemas', 'Industrial', 'Civil', 'Arquitectura']
  },
  {
    nombre: 'Facultad de Ciencias Sociales, Salud y Bienestar',
    area: 'Ciencias Sociales, Salud y Bienestar',
    icono: '🧠',
    programas: ['Psicología', 'Trabajo Social', 'Deporte']
  },
  {
    nombre: 'Facultad de Derecho y Ciencias Políticas',
    area: 'Derecho y Ciencias Políticas',
    icono: '⚖️',
    programas: ['Derecho', 'Criminalística']
  },
  {
    nombre: 'Facultad de Ciencias Administrativas, Económicas y Contables',
    area: 'Ciencias Administrativas, Económicas y Contables',
    icono: '📊',
    programas: ['Administración y Negocios', 'Contaduría', 'Gastronomía']
  },
  {
    nombre: 'Facultad de Comunicación, Publicidad y Diseño',
    area: 'Comunicación, Publicidad y Diseño',
    icono: '🎨',
    programas: ['Comunicación Social', 'Publicidad', 'Diseño Gráfico']
  },
  {
    nombre: 'Facultad de Educación y Humanidades',
    area: 'Educación y Humanidades',
    icono: '📚',
    programas: ['Licenciaturas', 'Filosofía y Teología']
  },
  {
    nombre: 'Ciencias Básicas (Transversal)',
    area: 'Ciencias Básicas',
    icono: '🔬',
    programas: ['Matemáticas', 'Investigación']
  },
  {
    nombre: 'Área Institucional (Obligatorias)',
    area: 'Institucional',
    icono: '🏛️',
    programas: ['Obligatorias', 'Inglés']
  }
];

let _facultadSeleccionada = null;
let _opcionesFiltradas = [...FACULTADES_FUNLAM];

// ── Inicializar el select de facultad ─────────────────────
function inicializarSelectFacultad() {
  _facultadSeleccionada = null;
  _opcionesFiltradas = [...FACULTADES_FUNLAM];

  const input = document.getElementById('docFacultadInput');
  const hidden = document.getElementById('docFacultad');
  const dropdown = document.getElementById('docFacultadDropdown');
  const programasCont = document.getElementById('docProgramasContenedor');

  if (input) {
    input.value = '';
    input.readOnly = false;
  }
  if (hidden) hidden.value = '';
  if (dropdown) dropdown.style.display = 'none';
  if (programasCont) programasCont.style.display = 'none';

  // Cerrar al hacer clic fuera
  document.addEventListener('click', function cerrarFacultad(e) {
    const wrap = document.getElementById('docFacultadWrap');
    if (wrap && !wrap.contains(e.target)) {
      const dd = document.getElementById('docFacultadDropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  renderizarOpcionesFacultad(FACULTADES_FUNLAM);
}

// ── Mostrar dropdown de facultades ────────────────────────
function mostrarDropdownFacultad() {
  const input = document.getElementById('docFacultadInput');
  if (input) input.readOnly = false;
  filtrarFacultades(input ? input.value : '');
  const dropdown = document.getElementById('docFacultadDropdown');
  if (dropdown) dropdown.style.display = 'block';
}

// ── Filtrar opciones mientras escribe ────────────────────
function filtrarFacultades(q) {
  const dropdown = document.getElementById('docFacultadDropdown');
  if (!dropdown) return;

  const texto = (q || '').toLowerCase().trim();
  _opcionesFiltradas = texto.length === 0
    ? [...FACULTADES_FUNLAM]
    : FACULTADES_FUNLAM.filter(f =>
        f.nombre.toLowerCase().includes(texto) ||
        f.programas.some(p => p.toLowerCase().includes(texto))
      );

  renderizarOpcionesFacultad(_opcionesFiltradas);
  dropdown.style.display = 'block';
}

// ── Renderizar las opciones en el dropdown ────────────────
function renderizarOpcionesFacultad(opciones) {
  const dropdown = document.getElementById('docFacultadDropdown');
  if (!dropdown) return;

  if (opciones.length === 0) {
    dropdown.innerHTML = '<div class="select-buscable__vacio">No se encontró esa facultad</div>';
    return;
  }

  dropdown.innerHTML = opciones.map(f => `
    <div class="select-buscable__opcion ${_facultadSeleccionada === f.area ? 'seleccionada' : ''}"
      onclick="seleccionarFacultad('${f.area.replace(/'/g, "\\'")}','${f.nombre.replace(/'/g, "\\'")}')">
      <span style="font-size:18px">${f.icono}</span>
      <div>
        <div style="font-weight:${_facultadSeleccionada === f.area ? '600' : '400'}">${f.nombre}</div>
        <div style="font-size:11px;color:#aaa">${f.programas.join(' · ')}</div>
      </div>
      ${_facultadSeleccionada === f.area ? '<span style="margin-left:auto;color:#007b99">✓</span>' : ''}
    </div>`).join('');
}

// ── Seleccionar una facultad ──────────────────────────────
function seleccionarFacultad(area, nombre) {
  _facultadSeleccionada = area;

  const input = document.getElementById('docFacultadInput');
  const hidden = document.getElementById('docFacultad');
  const dropdown = document.getElementById('docFacultadDropdown');

  if (input) { input.value = nombre; input.readOnly = true; }
  if (hidden) hidden.value = nombre; // guardamos el nombre de la facultad
  if (dropdown) dropdown.style.display = 'none';

  // Limpiar error si existía
  quitarError('docFacultad');

  // Cargar los programas correspondientes
  cargarProgramasPorFacultad(area);
}

// ── Cargar programas del área seleccionada ────────────────
function cargarProgramasPorFacultad(area) {
  const contenedor = document.getElementById('docProgramasContenedor');
  const chipsDiv = document.getElementById('docProgramas');
  if (!contenedor || !chipsDiv) return;

  // Buscar la facultad en la lista
  const facultad = FACULTADES_FUNLAM.find(f => f.area === area);
  if (!facultad || !facultad.programas.length) {
    contenedor.style.display = 'none';
    return;
  }

  // Renderizar chips de programas
  chipsDiv.innerHTML = facultad.programas.map(p => `
    <label class="chip">
      <input type="checkbox" value="${p}"/> ${p}
    </label>`).join('');

  // Animar aparición
  contenedor.style.display = 'block';
  contenedor.style.opacity = '0';
  contenedor.style.transform = 'translateY(-8px)';
  requestAnimationFrame(() => {
    contenedor.style.transition = 'opacity 0.25s, transform 0.25s';
    contenedor.style.opacity = '1';
    contenedor.style.transform = 'translateY(0)';
  });
}

// ── Leer programas seleccionados (para guardar el perfil) ─
function getProgramasSeleccionados() {
  return [...document.querySelectorAll('#docProgramas input:checked')]
    .map(cb => cb.value);
}
