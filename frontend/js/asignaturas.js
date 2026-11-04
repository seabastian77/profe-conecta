// Materias: buscador con sugerencias y creación para el docente, y materias por tutor para programar tutorías.

// Mismo patrón que valida el servidor para los nombres de materias: sin < > " ` ni barra invertida.
const NOMBRE_MATERIA_VALIDO = /^[^<>"`\\\u0000-\u001f]{2,80}$/;
const MAX_MATERIAS_DOCENTE = 30;
const MIN_LETRAS_BUSQUEDA = 2;

let materiasSeleccionadas = [];
let secuenciaBusquedaMaterias = 0;
let docentesConMaterias = null;

registrarLimpieza(() => {
  materiasSeleccionadas = [];
  docentesConMaterias = null;
});

// Devuelve los nombres de las materias elegidas para guardarlos en el perfil.
function getAsignaturasSeleccionadas() {
  return materiasSeleccionadas.map((materia) => materia.nombre);
}

// Indica si la materia ya está entre las elegidas, sin distinguir mayúsculas.
function materiaYaElegida(nombre) {
  const buscado = String(nombre || '').toLowerCase();
  return materiasSeleccionadas.some((materia) => materia.nombre.toLowerCase() === buscado);
}

// Dibuja las materias elegidas como etiquetas que se pueden quitar.
function renderizarMateriasElegidas() {
  const contenedor = document.getElementById('docAsignaturasSeleccionadas');
  if (!contenedor) return;
  if (!materiasSeleccionadas.length) {
    contenedor.innerHTML = '<span class="texto-tenue">Aún no agregaste materias</span>';
    return;
  }
  contenedor.innerHTML = materiasSeleccionadas.map((materia) => {
    const detalle = [materia.area, materia.programa].filter(Boolean).join(' › ');
    return '<span class="ficha ficha--quitable"' + (detalle ? ' title="' + escaparHtml(detalle) + '"' : '') + '>' + escaparHtml(materia.nombre) +
      '<button type="button" data-quitar-materia="' + escaparHtml(materia.nombre) + '" aria-label="Quitar ' + escaparHtml(materia.nombre) + '">' + icono('cerrar', 'xs') + '</button></span>';
  }).join('');
}

// Reemplaza las materias elegidas por las que el docente ya tenía guardadas.
function precargarAsignaturas(nombres) {
  materiasSeleccionadas = (nombres || []).map((nombre) => ({ nombre, area: '', programa: '' }));
  renderizarMateriasElegidas();
}

// Cierra la lista de sugerencias.
function cerrarSugerenciasMaterias() {
  const lista = document.getElementById('docAsignaturaDropdown');
  const entrada = document.getElementById('docAsignaturaInput');
  if (lista) lista.replaceChildren();
  if (entrada) entrada.setAttribute('aria-expanded', 'false');
}

// Deja el buscador de materias vacío y cerrado.
function inicializarAutocompleteAsignaturas() {
  document.getElementById('docAsignaturaInput').value = '';
  cerrarSugerenciasMaterias();
  renderizarMateriasElegidas();
}

// Agrega una materia a las elegidas y deja el buscador listo para otra.
function seleccionarMateria(materia) {
  if (materiaYaElegida(materia.nombre)) {
    mostrarTostada('Esa materia ya está en tu lista', 'info');
  } else if (materiasSeleccionadas.length >= MAX_MATERIAS_DOCENTE) {
    mostrarTostada('Puedes registrar hasta ' + MAX_MATERIAS_DOCENTE + ' materias', 'advertencia');
    return;
  } else {
    materiasSeleccionadas.push({ nombre: materia.nombre, area: materia.area || '', programa: materia.programa || '' });
    renderizarMateriasElegidas();
    quitarError('docAsignaturaInput');
  }
  const entrada = document.getElementById('docAsignaturaInput');
  entrada.value = '';
  cerrarSugerenciasMaterias();
  entrada.focus();
}

// Quita una materia de las elegidas.
function quitarAsignatura(nombre) {
  materiasSeleccionadas = materiasSeleccionadas.filter((materia) => materia.nombre !== nombre);
  renderizarMateriasElegidas();
  const entrada = document.getElementById('docAsignaturaInput');
  if (entrada) entrada.focus();
}

// Dibuja los resultados de la búsqueda y, si no hay una materia igual, la opción de crear una nueva.
function pintarSugerenciasMaterias(resultados, texto) {
  const lista = document.getElementById('docAsignaturaDropdown');
  const entrada = document.getElementById('docAsignaturaInput');
  const disponibles = resultados.filter((materia) => !materiaYaElegida(materia.nombre));
  const hayIgual = resultados.some((materia) => materia.nombre.toLowerCase() === texto.toLowerCase());

  let html = disponibles.map((materia) =>
    '<button type="button" class="sugerencia" role="option" data-nombre="' + escaparHtml(materia.nombre) + '" data-area="' + escaparHtml(materia.area || '') + '" data-programa="' + escaparHtml(materia.programa || '') + '">' +
      '<span class="sugerencia__titulo">' + escaparHtml(materia.nombre) + '</span>' +
      '<span class="sugerencia__detalle">' + escaparHtml([materia.area, materia.programa].filter(Boolean).join(' › ') || 'General') + '</span></button>').join('');

  if (!hayIgual && NOMBRE_MATERIA_VALIDO.test(texto)) {
    html += '<button type="button" class="sugerencia" role="option" data-crear="' + escaparHtml(texto) + '">' +
      '<span class="sugerencia__titulo">Crear nueva materia «' + escaparHtml(texto) + '»</span>' +
      '<span class="sugerencia__detalle">Podrás indicar su área y su programa</span></button>';
  }
  if (!html) html = '<div class="sugerencia sugerencia--vacia">' + (resultados.length ? 'Ya agregaste las coincidencias' : 'Sin resultados') + '</div>';
  lista.innerHTML = html;
  entrada.setAttribute('aria-expanded', 'true');
}

// Busca materias por nombre y muestra las sugerencias; descarta respuestas de búsquedas que ya quedaron atrás.
async function buscarAsignatura(texto) {
  const consulta = String(texto || '').trim();
  const secuencia = ++secuenciaBusquedaMaterias;
  const lista = document.getElementById('docAsignaturaDropdown');
  if (!lista) return;
  if (!consulta) {
    cerrarSugerenciasMaterias();
    return;
  }
  if (consulta.length < MIN_LETRAS_BUSQUEDA) {
    lista.innerHTML = '<div class="sugerencia sugerencia--vacia">Escribe al menos ' + MIN_LETRAS_BUSQUEDA + ' letras</div>';
    document.getElementById('docAsignaturaInput').setAttribute('aria-expanded', 'true');
    return;
  }
  try {
    const resultados = await llamarAPI('/asignaturas?q=' + encodeURIComponent(consulta), 'GET');
    if (secuencia === secuenciaBusquedaMaterias) pintarSugerenciasMaterias(resultados, consulta);
  } catch (err) {
    if (secuencia !== secuenciaBusquedaMaterias) return;
    lista.innerHTML = '<div class="sugerencia sugerencia--vacia">No se pudo buscar. Revisa tu conexión e intenta de nuevo.</div>';
  }
}

const buscarAsignaturaConDemora = debounce(buscarAsignatura, 250);

// Abre la ventana para crear una materia con su área y su programa.
function abrirModalCrearAsignatura(nombreSugerido) {
  cerrarSugerenciasMaterias();
  const formulario = document.getElementById('formularioMateria');
  formulario.reset();
  limpiarErrores(formulario);
  const area = document.getElementById('matArea');
  if (area.options.length <= 1) Object.keys(AREAS_PROGRAMAS).forEach((nombre) => area.add(new Option(nombre, nombre)));
  actualizarProgramasMateria();
  document.getElementById('matNombre').value = nombreSugerido || '';
  abrirDialogo('dialogoMateria');
}

// Llena los programas del área elegida en la ventana de nueva materia.
function actualizarProgramasMateria() {
  const programas = AREAS_PROGRAMAS[document.getElementById('matArea').value] || [];
  const selector = document.getElementById('matPrograma');
  selector.replaceChildren(new Option('General', ''));
  programas.forEach((programa) => selector.add(new Option(programa, programa)));
}

// Crea la materia en el servidor y la agrega a la lista; si el servidor la rechaza, deja el motivo a la vista.
async function confirmarCrearAsignatura(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const nombre = valorCampo('matNombre');
  if (!NOMBRE_MATERIA_VALIDO.test(nombre)) {
    ponerError('matNombre', nombre ? 'Entre 2 y 80 caracteres y sin símbolos como < > o comillas' : 'Escribe el nombre de la materia');
    enfocarPrimerError(formulario);
    return;
  }
  await conOcupado(evento.submitter, async () => {
    let materia;
    try {
      materia = await llamarAPI('/asignaturas', 'POST', { nombre, area: valorCampo('matArea'), programa: valorCampo('matPrograma') });
    } catch (err) {
      ponerError('matNombre', err.mensaje || 'No se pudo crear la materia');
      return;
    }
    cerrarDialogo('dialogoMateria');
    seleccionarMateria(materia);
    mostrarTostada(materia.nueva
      ? 'Materia «' + materia.nombre + '» creada y disponible para todos'
      : 'La materia «' + materia.nombre + '» ya existía y se agregó a tu lista', 'exito');
  });
}

// Mueve el foco entre las sugerencias con las flechas.
function moverFocoSugerencias(actual, paso) {
  const opciones = [...document.querySelectorAll('#docAsignaturaDropdown .sugerencia[data-nombre], #docAsignaturaDropdown .sugerencia[data-crear]')];
  if (!opciones.length) return;
  const indice = opciones.indexOf(actual);
  const siguiente = opciones[Math.max(0, Math.min(opciones.length - 1, indice + paso))];
  siguiente.focus();
}

// Elige la sugerencia pulsada: una materia existente o la creación de una nueva.
function elegirSugerenciaMateria(opcion) {
  if (opcion.dataset.crear !== undefined) {
    abrirModalCrearAsignatura(opcion.dataset.crear);
    return;
  }
  seleccionarMateria({ nombre: opcion.dataset.nombre, area: opcion.dataset.area, programa: opcion.dataset.programa });
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'docAsignaturaInput') buscarAsignaturaConDemora(e.target.value);
});

document.addEventListener('click', (e) => {
  const quitar = e.target.closest('[data-quitar-materia]');
  if (quitar) {
    quitarAsignatura(quitar.dataset.quitarMateria);
    return;
  }
  const opcion = e.target.closest('#docAsignaturaDropdown .sugerencia[data-nombre], #docAsignaturaDropdown .sugerencia[data-crear]');
  if (opcion) {
    elegirSugerenciaMateria(opcion);
    return;
  }
  if (!e.target.closest('.con-sugerencias')) cerrarSugerenciasMaterias();
});

document.addEventListener('keydown', (e) => {
  const entrada = e.target.id === 'docAsignaturaInput';
  const opcion = e.target.closest && e.target.closest('#docAsignaturaDropdown .sugerencia');
  if (!entrada && !opcion) return;

  if (e.key === 'Escape') {
    cerrarSugerenciasMaterias();
    document.getElementById('docAsignaturaInput').focus();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    moverFocoSugerencias(opcion, 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (opcion) moverFocoSugerencias(opcion, -1);
  } else if (e.key === 'Enter' && entrada) {
    e.preventDefault();
    const primera = document.querySelector('#docAsignaturaDropdown .sugerencia[data-nombre], #docAsignaturaDropdown .sugerencia[data-crear]');
    if (primera) elegirSugerenciaMateria(primera);
  }
});

// Trae los tutores con la lista de materias que registró cada uno.
async function obtenerDocentesConMaterias(forzar) {
  if (!docentesConMaterias || forzar) docentesConMaterias = await llamarAPI('/tutorias/docentes-disponibles', 'GET');
  return docentesConMaterias;
}

// Llena el selector solo con las materias del tutor elegido.
async function cargarMateriasDeDocente(idSelector, docenteId, textoSinTutor) {
  const selector = document.getElementById(idSelector);
  if (!selector) return;
  const ponerOpciones = (primera, materias) => {
    selector.replaceChildren(new Option(primera, ''));
    (materias || []).forEach((materia) => selector.add(new Option(materia, materia)));
  };
  if (!docenteId) {
    ponerOpciones(textoSinTutor || 'Primero elige el tutor', []);
    return;
  }
  try {
    const docentes = await obtenerDocentesConMaterias();
    const docente = docentes.find((d) => String(d.id) === String(docenteId));
    const materias = (docente && docente.materias) || [];
    ponerOpciones(materias.length ? 'Selecciona la materia' : 'Este tutor aún no registró materias', materias);
  } catch (err) {
    ponerOpciones('No se pudieron cargar las materias', []);
  }
}
