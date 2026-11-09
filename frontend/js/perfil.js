// Perfil del usuario: consulta con caché breve, página «Mi perfil», formularios por rol y fotos.

const VIGENCIA_PERFIL_MS = 20000;
const LIMITE_FOTO_BYTES = 2 * 1024 * 1024;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const DIAS_HORARIO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MAX_HORARIOS = 30;
const SEMESTRES_REFERENCIA = 10;

const perfilMemoria = { uid: null, datos: null, hasta: 0, pendiente: null };
let asistenteEditando = false;

registrarLimpieza(() => {
  invalidarPerfil();
  perfilMemoria.uid = null;
  asistenteEditando = false;
});

// Descarta el perfil recordado para que la próxima consulta vaya al servidor.
function invalidarPerfil() {
  perfilMemoria.datos = null;
  perfilMemoria.hasta = 0;
  perfilMemoria.pendiente = null;
  perfilStorage.clearPerfil();
}

// Devuelve el perfil con sus fotos; reutiliza la respuesta de los últimos segundos para no repetir la consulta.
function obtenerPerfil(forzar) {
  const mismoUsuario = perfilMemoria.uid === sesion.id;
  if (!forzar && mismoUsuario && perfilMemoria.datos && Date.now() < perfilMemoria.hasta) return Promise.resolve(perfilMemoria.datos);
  if (!forzar && mismoUsuario && perfilMemoria.pendiente) return perfilMemoria.pendiente;

  perfilMemoria.uid = sesion.id;
  const consulta = llamarAPI('/perfil', 'GET');
  perfilMemoria.pendiente = consulta;
  consulta.then((datos) => {
    if (perfilMemoria.pendiente !== consulta) return;
    perfilMemoria.datos = datos;
    perfilMemoria.hasta = Date.now() + VIGENCIA_PERFIL_MS;
  }, () => {}).then(() => {
    if (perfilMemoria.pendiente === consulta) perfilMemoria.pendiente = null;
  });
  return consulta;
}

// Indica si faltan datos obligatorios del perfil según el rol.
function perfilEstaIncompleto(rol, datos) {
  if (!datos) return true;
  if (rol === 'estudiante') return !datos.documento || !datos.programa || !datos.semestre;
  if (rol === 'docente') return !datos.cedula || !datos.facultad || !(datos.asignaturas && datos.asignaturas.length);
  if (rol === 'admin') return !datos.cedula || !datos.cargo;
  return false;
}

// Pone la foto, o las iniciales, en los avatares del encabezado, del menú y de la página de perfil.
function aplicarFotoAvatar(foto) {
  ['chipAvatar', 'barraAvatar', 'perfilFoto'].forEach((id) => pintarAvatar(document.getElementById(id), sesion.inicial, foto));
}

// Pinta la foto guardada en este navegador y la corrige con la del servidor, que es la que vale.
async function cargarFotoAvatar() {
  aplicarFotoAvatar(perfilStorage.getFotoPerfil());
  try {
    const perfil = await obtenerPerfil();
    const foto = (perfil.fotos && perfil.fotos.foto_perfil) || '';
    if (foto) perfilStorage.setFotoPerfil(foto);
    else perfilStorage.clearFotoPerfil();
    aplicarFotoAvatar(foto);
  } catch (err) {
    /* sin conexión se conserva lo que ya estaba en pantalla */
  }
}

// Arma un dato de la ficha; el valor ya llega escapado o es marcado propio.
function datoPerfil(etiqueta, valorHtml, ancho) {
  return '<div class="dato' + (ancho ? ' dato--ancho' : '') + '"><span class="dato__etiqueta">' + etiqueta + '</span><span class="dato__valor">' + valorHtml + '</span></div>';
}

// Escapa un valor y muestra un guion cuando está vacío.
function textoODato(valor) {
  return escaparHtml(valor) || '—';
}

// Muestra una lista de textos como etiquetas, o un texto tenue cuando no hay ninguno.
function etiquetasPerfil(lista, vacio) {
  if (!lista || !lista.length) return '<span class="texto-tenue">' + vacio + '</span>';
  return '<span class="fichas">' + lista.map((texto) => '<span class="insignia insignia--marca insignia--sin-punto insignia--texto">' + escaparHtml(texto) + '</span>').join('') + '</span>';
}

// Arma una sección del perfil como tarjeta con título e ícono.
function seccionPerfil(titulo, nombreIcono, cuerpo) {
  return '<section class="tarjeta"><div class="tarjeta__cabecera"><h2 class="tarjeta__titulo">' + icono(nombreIcono) + titulo + '</h2></div>' +
    '<div class="tarjeta__cuerpo">' + cuerpo + '</div></section>';
}

// Dibuja las secciones del perfil del estudiante.
function perfilEstudianteHTML(perfil) {
  const d = perfil.perfil || {};
  const promedio = parseFloat(d.promedio) || 0;
  const enAlerta = promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO;
  const semestre = parseInt(d.semestre, 10) || 0;

  const valorPromedio = promedio > 0
    ? numeroCO(promedio, 1) + (enAlerta ? ' <span class="insignia insignia--error">Por debajo del mínimo</span>' : '')
    : '<span class="texto-tenue">Aún sin registrar</span>';

  const avance = semestre
    ? '<p><strong>Semestre ' + semestre + ' de ' + SEMESTRES_REFERENCIA + '</strong></p>' +
      '<div class="progreso" role="meter" aria-label="Semestre actual" aria-valuemin="0" aria-valuemax="' + SEMESTRES_REFERENCIA + '" aria-valuenow="' + semestre +
      '" aria-valuetext="Semestre ' + semestre + ' de ' + SEMESTRES_REFERENCIA + '"><div class="progreso__relleno" data-ancho="' + Math.min(100, (semestre / SEMESTRES_REFERENCIA) * 100) + '"></div></div>' +
      '<p class="campo__ayuda">La barra toma como referencia ' + SEMESTRES_REFERENCIA + ' semestres, el máximo que ofrece el registro.</p>'
    : '<p class="texto-tenue">Registra tu semestre para ver tu avance.</p>';

  return seccionPerfil('Datos académicos', 'birrete',
    '<div class="datos">' +
      datoPerfil('Número de documento', textoODato(d.documento)) +
      datoPerfil('Programa', textoODato(d.programa)) +
      datoPerfil('Semestre', textoODato(d.semestre)) +
      datoPerfil('Promedio acumulado', valorPromedio) +
      datoPerfil('Teléfono', textoODato(d.telefono)) +
    '</div><p class="campo__ayuda">El promedio lo registra la universidad y no se edita desde aquí.</p>') +
    seccionPerfil('Avance en el programa', 'objetivo', avance);
}

// Dibuja las secciones del perfil del docente; las últimas tutorías llegan después.
function perfilDocenteHTML(perfil) {
  const d = perfil.perfil || {};
  const horarios = d.horarios || [];
  const franjas = horarios.length
    ? '<div class="horarios">' + horarios.map((h) =>
      '<div class="horario"><div class="horario__dia">' + escaparHtml(h.dia) + '</div>' +
      '<div class="horario__hora">' + escaparHtml(String(h.hora_inicio).slice(0, 5)) + ' – ' + escaparHtml(String(h.hora_fin).slice(0, 5)) + '</div>' +
      '<div class="horario__lugar">' + escaparHtml(h.lugar || 'Por definir') + '</div></div>').join('') + '</div>'
    : estadoVacio({ icono: 'reloj', titulo: 'Sin horarios registrados', texto: 'Agrega tus franjas para que los estudiantes sepan cuándo atiendes.', compacto: true });

  return seccionPerfil('Datos del docente', 'usuario',
    '<div class="datos">' +
      datoPerfil('Cédula', textoODato(d.cedula)) +
      datoPerfil('Facultad', textoODato(d.facultad)) +
      datoPerfil('Teléfono', textoODato(d.telefono)) +
      datoPerfil('Programas que atiende', etiquetasPerfil(d.programas, 'Sin programas'), true) +
      datoPerfil('Materias que dicta', etiquetasPerfil(d.asignaturas, 'Sin materias'), true) +
    '</div>') +
    seccionPerfil('Horarios disponibles', 'reloj',
      franjas + '<div class="aviso__acciones"><button type="button" class="btn btn--s" onclick="irAPagina(\'completar-perfil\')">' + icono('editar', 's') + 'Editar perfil y horarios</button></div>') +
    seccionPerfil('Últimas tutorías', 'calendario', '<div class="tutorias" id="perfilTutoriasDocente">' + esqueletoLista(2) + '</div>');
}

// Dibuja las secciones del perfil del administrador; la actividad llega después.
function perfilAdminHTML(perfil) {
  const d = perfil.perfil || {};
  return seccionPerfil('Datos del administrador', 'escudo-ok',
    '<div class="datos">' +
      datoPerfil('Cédula', textoODato(d.cedula)) +
      datoPerfil('Cargo', textoODato(d.cargo)) +
      datoPerfil('Dependencia', textoODato(d.dependencia)) +
      datoPerfil('Teléfono', textoODato(d.telefono)) +
    '</div>') +
    seccionPerfil('Actividad reciente', 'archivo', '<div class="actividad" id="perfilActividadAdmin">' + esqueletoLista(2) + '</div>');
}

// Muestra las últimas acciones del administrador que quedaron en la auditoría.
async function cargarActividadAdmin() {
  let eventos;
  try {
    eventos = await llamarAPI('/admin/auditoria?mios=1&limite=6', 'GET');
  } catch (err) {
    const fallo = document.getElementById('perfilActividadAdmin');
    if (fallo) fallo.innerHTML = estadoError(err.mensaje, 'cargarActividadAdmin()');
    return;
  }
  const contenedor = document.getElementById('perfilActividadAdmin');
  if (!contenedor) return;
  if (!eventos.length) {
    contenedor.innerHTML = estadoVacio({ icono: 'archivo', titulo: 'Aún no hay acciones registradas', compacto: true });
    return;
  }
  contenedor.innerHTML = eventos.slice(0, 6).map((e) => {
    const conocido = EVENTOS_AUDITORIA[e.evento] || { texto: e.evento, icono: 'registro' };
    return '<div class="actividad__item"><span class="actividad__icono">' + icono(conocido.icono) + '</span>' +
      '<div class="actividad__texto"><strong>' + escaparHtml(conocido.texto) + '</strong>' + escaparHtml(e.detalle || '') +
      '<span class="actividad__tiempo">' + escaparHtml(formatearTiempo(e.creada_en)) + '</span></div></div>';
  }).join('');
}

// Muestra las cuatro tutorías más recientes del docente.
async function cargarUltimasTutoriasDocente() {
  let tutorias;
  try {
    tutorias = await cargarTutorias();
  } catch (err) {
    const fallo = document.getElementById('perfilTutoriasDocente');
    if (fallo) fallo.innerHTML = estadoError(err.mensaje, 'cargarUltimasTutoriasDocente()');
    return;
  }
  const contenedor = document.getElementById('perfilTutoriasDocente');
  if (!contenedor) return;
  const recientes = tutorias.slice().sort((a, b) => (String(b.fecha) + String(b.hora)).localeCompare(String(a.fecha) + String(a.hora))).slice(0, 4);
  contenedor.innerHTML = recientes.length
    ? recientes.map((t) => tarjetaTutoriaHTML(t, 'docente', 'compacta')).join('')
    : estadoVacio({ icono: 'calendario', titulo: 'Aún no hay sesiones', texto: 'Cuando se programe una tutoría, la verás aquí.', compacto: true });
}

// Carga y dibuja la página de perfil de la persona.
async function cargarMiPerfil() {
  const contenedor = document.getElementById('perfilContenido');
  if (!contenedor.children.length) contenedor.innerHTML = esqueletoLista(2);

  let perfil;
  try {
    perfil = await obtenerPerfil(true);
  } catch (err) {
    contenedor.innerHTML = estadoError(err.mensaje, 'cargarMiPerfil()');
    return;
  }

  document.getElementById('perfilHeroNombre').textContent = (perfil.nombres + ' ' + perfil.apellidos).trim();
  document.getElementById('perfilHeroCorreo').textContent = perfil.correo;
  document.getElementById('perfilHeroRol').textContent = ETIQUETAS_ROL[perfil.rol] || perfil.rol;

  const fotos = perfil.fotos || {};
  const fotoPerfil = esFotoValida(fotos.foto_perfil) ? fotos.foto_perfil : '';
  const fotoPortada = esFotoValida(fotos.foto_portada) ? fotos.foto_portada : '';
  if (fotoPerfil) perfilStorage.setFotoPerfil(fotoPerfil);
  else perfilStorage.clearFotoPerfil();
  aplicarFotoAvatar(fotoPerfil);
  ponerPortada(fotoPortada);

  const aviso = perfilEstaIncompleto(perfil.rol, perfil.perfil)
    ? '<div class="aviso aviso--aviso" role="status">' + icono('alerta') + '<div><p><strong>Tu perfil está incompleto.</strong> Faltan datos requeridos para usar todas las funciones del sistema.</p>' +
      '<div class="aviso__acciones"><button type="button" class="btn btn--s" onclick="irAPagina(\'completar-perfil\')">Completar perfil</button></div></div></div>'
    : '';

  const secciones = { estudiante: perfilEstudianteHTML, docente: perfilDocenteHTML, admin: perfilAdminHTML };
  contenedor.innerHTML = aviso + (secciones[perfil.rol] || perfilAdminHTML)(perfil);
  aplicarAnchos(contenedor);

  if (perfil.rol === 'docente') cargarUltimasTutoriasDocente();
  if (perfil.rol === 'admin') cargarActividadAdmin();
}

// Muestra la imagen de portada o la oculta si no hay una válida.
function ponerPortada(foto) {
  const imagen = document.getElementById('perfilPortadaImg');
  if (foto) {
    imagen.src = foto;
    imagen.classList.remove('oculto');
  } else {
    imagen.removeAttribute('src');
    imagen.classList.add('oculto');
  }
}

// Rechaza lo que no es una imagen JPG, PNG o WebP, o pesa más de 2 MB; devuelve true si el archivo sirve.
function fotoAceptable(archivo) {
  if (!TIPOS_FOTO.includes(archivo.type)) {
    mostrarTostada('El archivo debe ser una imagen JPG, PNG o WebP', 'error');
    return false;
  }
  if (archivo.size > LIMITE_FOTO_BYTES) {
    mostrarTostada('La imagen pesa ' + numeroCO(archivo.size / 1048576, 1) + ' MB y el máximo permitido es 2 MB', 'error');
    return false;
  }
  return true;
}

// Abre el archivo como imagen respetando la orientación que traiga.
async function abrirImagen(archivo) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch (err) {
      /* si el navegador no la decodifica así, se prueba con una etiqueta de imagen */
    }
  }
  return new Promise((resolver, rechazar) => {
    const direccion = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => { URL.revokeObjectURL(direccion); resolver(imagen); };
    imagen.onerror = () => { URL.revokeObjectURL(direccion); rechazar({ mensaje: 'No se pudo leer la imagen. Prueba con otro archivo.' }); };
    imagen.src = direccion;
  });
}

// Reduce la imagen al ancho máximo y la guarda como JPEG bajando la calidad hasta que quepa en maxKB.
async function comprimirImagen(archivo, maxAncho, maxKB) {
  const origen = await abrirImagen(archivo);
  try {
    let escala = Math.min(1, maxAncho / origen.width);
    for (let intento = 0; intento < 4; intento++) {
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(origen.width * escala));
      lienzo.height = Math.max(1, Math.round(origen.height * escala));
      const contexto = lienzo.getContext('2d');
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, lienzo.width, lienzo.height);
      contexto.drawImage(origen, 0, 0, lienzo.width, lienzo.height);
      for (let calidad = 0.85; calidad >= 0.3; calidad -= 0.1) {
        const resultado = lienzo.toDataURL('image/jpeg', calidad);
        if (resultado.length <= maxKB * 1024) return resultado;
      }
      escala *= 0.8;
    }
  } finally {
    if (origen.close) origen.close();
  }
  throw { mensaje: 'La imagen es demasiado compleja para reducirla. Prueba con otra.' };
}

// Comprime la imagen elegida, la sube y solo entonces la muestra; si el servidor la rechaza, no cambia nada.
async function subirImagenPerfil(entrada, tipo) {
  const archivo = entrada.files && entrada.files[0];
  entrada.value = '';
  if (!archivo || !fotoAceptable(archivo)) return;

  const marco = entrada.parentElement;
  if (marco.getAttribute('aria-busy') === 'true') return;
  marco.setAttribute('aria-busy', 'true');

  const esPortada = tipo === 'portada';
  try {
    const base64 = await comprimirImagen(archivo, esPortada ? 1200 : 400, esPortada ? 400 : 300);
    await llamarAPI('/perfil/foto', 'POST', { foto_base64: base64, tipo });
    if (esPortada) {
      ponerPortada(base64);
      perfilStorage.setFotoPortada(base64);
    } else {
      aplicarFotoAvatar(base64);
      perfilStorage.setFotoPerfil(base64);
    }
    invalidarPerfil();
    mostrarTostada(esPortada ? 'Portada actualizada' : 'Foto de perfil actualizada', 'exito');
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo guardar la imagen', 'error');
  } finally {
    marco.removeAttribute('aria-busy');
  }
}

// Cambia la foto de perfil.
function subirFotoPerfil(entrada) {
  return subirImagenPerfil(entrada, 'perfil');
}

// Cambia la foto de portada.
function subirPortada(entrada) {
  return subirImagenPerfil(entrada, 'portada');
}

// Lee un campo del formulario sin espacios sobrantes.
function valorCampo(id) {
  return document.getElementById(id).value.trim();
}

// Marca el error de un campo obligatorio vacío o que incumple la regla; devuelve true si hubo error.
function exigirCampo(id, mensajeVacio, regla) {
  const valor = valorCampo(id);
  const mensaje = !valor ? mensajeVacio : (regla ? regla(valor) : '');
  if (mensaje) ponerError(id, mensaje);
  return Boolean(mensaje);
}

// Marca el error de un campo opcional que incumple la regla; devuelve true si hubo error.
function revisarOpcional(id, regla) {
  const mensaje = regla(valorCampo(id));
  if (mensaje) ponerError(id, mensaje);
  return Boolean(mensaje);
}

// Selecciona la opción con ese valor y la agrega si el selector no la traía, para no perder un dato antiguo.
function seleccionarOpcion(idSelector, valor) {
  const selector = document.getElementById(idSelector);
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (texto && ![...selector.options].some((o) => o.value === texto)) selector.add(new Option(texto, texto));
  selector.value = texto;
}

// Agrega una franja horaria al formulario del docente, vacía o con los datos recibidos.
function agregarFilaHorario(datos) {
  const contenedor = document.getElementById('docHorariosContainer');
  if (contenedor.children.length >= MAX_HORARIOS) {
    mostrarTostada('Puedes registrar hasta ' + MAX_HORARIOS + ' franjas horarias', 'advertencia');
    return;
  }
  const fila = document.createElement('div');
  fila.className = 'horario-fila';
  fila.innerHTML =
    '<select class="campo__entrada" data-campo="dia" aria-label="Día de la semana"><option value="">Día</option>' + DIAS_HORARIO.map((d) => '<option>' + d + '</option>').join('') + '</select>' +
    '<input type="time" class="campo__entrada" data-campo="inicio" aria-label="Hora de inicio">' +
    '<input type="time" class="campo__entrada" data-campo="fin" aria-label="Hora de fin">' +
    '<input type="text" class="campo__entrada" data-campo="lugar" maxlength="80" placeholder="Lugar (aula, enlace…)" aria-label="Lugar">' +
    '<button type="button" class="btn btn--fantasma btn--icono" aria-label="Quitar esta franja" onclick="quitarFilaHorario(this)">' + icono('cerrar', 's') + '</button>';
  contenedor.appendChild(fila);

  if (datos && datos.dia) {
    fila.querySelector('[data-campo="dia"]').value = datos.dia;
    fila.querySelector('[data-campo="inicio"]').value = String(datos.hora_inicio || '').slice(0, 5);
    fila.querySelector('[data-campo="fin"]').value = String(datos.hora_fin || '').slice(0, 5);
    fila.querySelector('[data-campo="lugar"]').value = datos.lugar && datos.lugar !== 'Por definir' ? datos.lugar : '';
  } else {
    fila.querySelector('[data-campo="dia"]').focus();
  }
}

// Quita la franja horaria a la que pertenece el botón.
function quitarFilaHorario(boton) {
  boton.closest('.horario-fila').remove();
  quitarError('docHorarios');
}

// Lee y revisa las franjas del formulario; ignora las filas vacías y marca las incompletas.
function leerHorarios() {
  const horarios = [];
  let hayError = false;
  document.querySelectorAll('#docHorariosContainer .horario-fila').forEach((fila) => {
    const campos = {};
    fila.querySelectorAll('[data-campo]').forEach((campo) => {
      campos[campo.dataset.campo] = campo;
      campo.classList.remove('campo--invalido');
      campo.removeAttribute('aria-invalid');
    });
    const dia = campos.dia.value;
    const inicio = campos.inicio.value;
    const fin = campos.fin.value;
    const lugar = campos.lugar.value.trim();
    if (!dia && !inicio && !fin && !lugar) return;

    const marcar = (campo) => {
      campo.classList.add('campo--invalido');
      campo.setAttribute('aria-invalid', 'true');
      hayError = true;
    };
    if (!dia) marcar(campos.dia);
    if (!inicio) marcar(campos.inicio);
    if (!fin) marcar(campos.fin);
    if (inicio && fin && fin <= inicio) marcar(campos.fin);
    if (lugar && (lugar.length > 80 || !textoSinSimbolos(lugar))) marcar(campos.lugar);
    horarios.push({ dia, hora_inicio: inicio, hora_fin: fin, lugar: lugar || 'Por definir' });
  });
  return { horarios, hayError };
}

// Ajusta el título, los pasos y los botones según sea el primer registro o una edición.
function prepararEncabezadoAsistente() {
  ponerTexto('tituloCompletarPerfil', asistenteEditando ? 'Edita tu perfil' : 'Completa tu perfil');
  document.getElementById('perfilPasos').classList.toggle('oculto', asistenteEditando);
  document.querySelectorAll('#pagina-completar-perfil [type="submit"]').forEach((boton) => {
    if (!boton.dataset.original) boton.dataset.original = boton.textContent;
    boton.textContent = asistenteEditando ? 'Guardar cambios' : boton.dataset.original;
  });
}

// Llena el formulario del estudiante con lo guardado.
function rellenarFormEstudiante(datos) {
  document.getElementById('estDocumento').value = datos.documento || '';
  seleccionarOpcion('estPrograma', datos.programa);
  seleccionarOpcion('estSemestre', datos.semestre);
  document.getElementById('estTelefono').value = datos.telefono || '';
}

// Llena el formulario del docente con lo guardado: datos, facultad, programas, materias y horarios.
function rellenarFormDocente(datos) {
  document.getElementById('docCedula').value = datos.cedula || '';
  document.getElementById('docTelefono').value = datos.telefono || '';
  if (datos.facultad) seleccionarOpcion('docFacultad', datos.facultad);
  cargarProgramasPorFacultad(datos.facultad || '', datos.programas || []);
  precargarAsignaturas(datos.asignaturas || []);
  (datos.horarios || []).forEach((h) => agregarFilaHorario(h));
}

// Llena el formulario del administrador con lo guardado.
function rellenarFormAdmin(datos) {
  document.getElementById('admCedula').value = datos.cedula || '';
  seleccionarOpcion('admCargo', datos.cargo);
  document.getElementById('admDependencia').value = datos.dependencia || '';
  document.getElementById('admTelefono').value = datos.telefono || '';
}

// Muestra el formulario de perfil del rol y lo llena con lo que ya está guardado.
async function mostrarFormPerfil() {
  const rol = sesion.rol;
  const nombres = { estudiante: 'Estudiante', docente: 'Docente', admin: 'Admin' };
  Object.keys(nombres).forEach((r) => document.getElementById('perfilForm' + nombres[r]).classList.toggle('oculto', r !== rol));
  ponerTexto('perfilRolEtiqueta', ETIQUETAS_ROL[rol] || '');

  const formulario = document.getElementById('formularioPerfil' + nombres[rol]);
  formulario.reset();
  limpiarErrores(formulario);
  if (rol === 'docente') {
    inicializarSelectFacultad();
    inicializarAutocompleteAsignaturas();
    precargarAsignaturas([]);
    cargarProgramasPorFacultad('', []);
    document.getElementById('docHorariosContainer').replaceChildren();
  }

  let datos = {};
  try {
    datos = (await obtenerPerfil(true)).perfil || {};
  } catch (err) {
    mostrarTostada('No se pudieron cargar tus datos guardados. ' + (err.mensaje || ''), 'advertencia');
  }

  asistenteEditando = !perfilEstaIncompleto(rol, datos);
  prepararEncabezadoAsistente();
  if (rol === 'estudiante') rellenarFormEstudiante(datos);
  if (rol === 'docente') rellenarFormDocente(datos);
  if (rol === 'admin') rellenarFormAdmin(datos);
}

// Envía el perfil; si el servidor rechaza un dato, deja el mensaje en el campo que corresponde.
async function guardarPerfil(boton, ruta, datos, reglasDeError) {
  await conOcupado(boton, async () => {
    try {
      await llamarAPI(ruta, 'POST', datos);
    } catch (err) {
      const mensaje = err.mensaje || 'No se pudo guardar el perfil';
      const regla = (reglasDeError || []).find(([patron]) => patron.test(mensaje));
      if (regla) {
        ponerError(regla[1], mensaje);
        const campo = document.getElementById(regla[1]);
        if (campo && campo.focus) campo.focus();
      } else {
        mostrarTostada(mensaje, 'error');
      }
      return;
    }
    invalidarPerfil();
    mostrarTostada(asistenteEditando ? 'Cambios guardados' : 'Perfil guardado', 'exito');
    irAPagina(asistenteEditando ? 'mi-perfil' : panelDeRol[sesion.rol]);
  });
}

// Valida y guarda el perfil del estudiante; el promedio no va porque lo registra la institución.
async function alEnviarPerfilEstudiante(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const errores = [
    exigirCampo('estDocumento', 'El número de documento es requerido', validarCedulaCampo),
    exigirCampo('estPrograma', 'Selecciona tu programa'),
    exigirCampo('estSemestre', 'Selecciona tu semestre'),
    revisarOpcional('estTelefono', validarTelefonoCampo),
  ];
  if (errores.some(Boolean)) {
    enfocarPrimerError(formulario);
    return;
  }
  await guardarPerfil(evento.submitter, '/perfil/estudiante', {
    documento: valorCampo('estDocumento'),
    programa: valorCampo('estPrograma'),
    semestre: valorCampo('estSemestre'),
    telefono: valorCampo('estTelefono'),
  }, [[/documento/i, 'estDocumento'], [/tel[eé]fono/i, 'estTelefono'], [/programa/i, 'estPrograma'], [/semestre/i, 'estSemestre']]);
}

// Valida y guarda el perfil del docente con sus materias, programas y horarios.
async function alEnviarPerfilDocente(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const asignaturas = getAsignaturasSeleccionadas();
  const { horarios, hayError: horariosInvalidos } = leerHorarios();

  const errores = [
    exigirCampo('docCedula', 'El número de cédula es requerido', validarCedulaCampo),
    revisarOpcional('docTelefono', validarTelefonoCampo),
    exigirCampo('docFacultad', 'Selecciona tu facultad'),
  ];
  if (!asignaturas.length) {
    ponerError('docAsignaturaInput', 'Agrega al menos una materia');
    errores.push(true);
  }
  if (horariosInvalidos) {
    ponerError('docHorarios', 'Revisa las franjas marcadas: necesitan día, hora de inicio y una hora de fin posterior, y el lugar no admite símbolos como < > o comillas.');
    errores.push(true);
  }
  if (errores.some(Boolean)) {
    enfocarPrimerError(formulario);
    return;
  }
  await guardarPerfil(evento.submitter, '/perfil/docente', {
    cedula: valorCampo('docCedula'),
    telefono: valorCampo('docTelefono'),
    facultad: valorCampo('docFacultad'),
    programas: getProgramasSeleccionados(),
    asignaturas,
    horarios,
  }, [[/c[eé]dula/i, 'docCedula'], [/tel[eé]fono/i, 'docTelefono'], [/facultad/i, 'docFacultad'], [/materia|asignatura/i, 'docAsignaturaInput'], [/horario|lugar/i, 'docHorarios']]);
}

// Valida y guarda el perfil del administrador.
async function alEnviarPerfilAdmin(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const dependencia = valorCampo('admDependencia');
  const errores = [
    exigirCampo('admCedula', 'La cédula es requerida', validarCedulaCampo),
    exigirCampo('admCargo', 'Selecciona tu cargo'),
    revisarOpcional('admTelefono', validarTelefonoCampo),
  ];
  if (dependencia.length > 120 || !textoSinSimbolos(dependencia)) {
    ponerError('admDependencia', 'Máximo 120 caracteres y sin símbolos como < > o comillas');
    errores.push(true);
  }
  if (errores.some(Boolean)) {
    enfocarPrimerError(formulario);
    return;
  }
  await guardarPerfil(evento.submitter, '/perfil/admin', {
    cedula: valorCampo('admCedula'),
    cargo: valorCampo('admCargo'),
    dependencia,
    telefono: valorCampo('admTelefono'),
  }, [[/c[eé]dula/i, 'admCedula'], [/tel[eé]fono/i, 'admTelefono'], [/cargo|dependencia/i, 'admDependencia']]);
}
