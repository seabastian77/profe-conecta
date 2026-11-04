// Facultades y programas de la universidad: única fuente para el selector de facultad, las casillas de programas y las áreas de las materias.

const FACULTADES_FUNLAM = [
  { nombre: 'Facultad de Ingenierías', area: 'Ingenierías y Arquitectura', programas: ['Sistemas', 'Industrial', 'Civil', 'Arquitectura'] },
  { nombre: 'Facultad de Ciencias Sociales, Salud y Bienestar', area: 'Ciencias Sociales, Salud y Bienestar', programas: ['Psicología', 'Trabajo Social', 'Deporte'] },
  { nombre: 'Facultad de Derecho y Ciencias Políticas', area: 'Derecho y Ciencias Políticas', programas: ['Derecho', 'Criminalística'] },
  { nombre: 'Facultad de Ciencias Administrativas, Económicas y Contables', area: 'Ciencias Administrativas, Económicas y Contables', programas: ['Administración y Negocios', 'Contaduría', 'Gastronomía'] },
  { nombre: 'Facultad de Comunicación, Publicidad y Diseño', area: 'Comunicación, Publicidad y Diseño', programas: ['Comunicación Social', 'Publicidad', 'Diseño Gráfico'] },
  { nombre: 'Facultad de Educación y Humanidades', area: 'Educación y Humanidades', programas: ['Licenciaturas', 'Filosofía y Teología'] },
  { nombre: 'Ciencias Básicas (Transversal)', area: 'Ciencias Básicas', programas: ['Matemáticas', 'Investigación'] },
  { nombre: 'Área Institucional (Obligatorias)', area: 'Institucional', programas: ['Obligatorias', 'Inglés'] },
];

const AREAS_PROGRAMAS = Object.fromEntries(FACULTADES_FUNLAM.map((facultad) => [facultad.area, facultad.programas]));

// Llena el selector de facultad con la lista oficial si todavía no la tiene.
function inicializarSelectFacultad() {
  const selector = document.getElementById('docFacultad');
  if (selector.options.length > 1) return;
  FACULTADES_FUNLAM.forEach((facultad) => selector.add(new Option(facultad.nombre, facultad.nombre)));
}

// Muestra los programas de la facultad como casillas y deja marcados los que ya estaban elegidos.
function cargarProgramasPorFacultad(nombreFacultad, seleccionados) {
  const contenedor = document.getElementById('docProgramasContenedor');
  const lista = document.getElementById('docProgramas');
  const facultad = FACULTADES_FUNLAM.find((f) => f.nombre === nombreFacultad);
  const elegidos = new Set(seleccionados || []);
  const base = facultad ? facultad.programas : [];
  const programas = [...base, ...[...elegidos].filter((programa) => !base.includes(programa))];

  if (!programas.length) {
    lista.replaceChildren();
    contenedor.classList.add('oculto');
    return;
  }
  lista.innerHTML = programas.map((programa) =>
    '<label class="ficha"><input type="checkbox" value="' + escaparHtml(programa) + '"' + (elegidos.has(programa) ? ' checked' : '') + '>' + escaparHtml(programa) + '</label>').join('');
  contenedor.classList.remove('oculto');
}

// Lee los programas marcados para guardar el perfil.
function getProgramasSeleccionados() {
  return [...document.querySelectorAll('#docProgramas input:checked')].map((casilla) => casilla.value);
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'docFacultad') cargarProgramasPorFacultad(e.target.value, []);
});
