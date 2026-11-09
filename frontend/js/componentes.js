// Piezas de interfaz compartidas: íconos, mensajes, ventanas, estados de carga, errores de formulario y formatos.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ETIQUETAS_ROL = { estudiante: 'Estudiante', docente: 'Docente', admin: 'Administrador' };

// Texto y tono de cada estado de una tutoría; «realizada» es un alias antiguo de «completada».
const ESTADOS_TUTORIA = {
  pendiente: { texto: 'Pendiente', insignia: 'aviso' },
  confirmada: { texto: 'Confirmada', insignia: 'marca' },
  completada: { texto: 'Completada', insignia: 'ok' },
  cancelada: { texto: 'Cancelada', insignia: 'error' },
};

// Devuelve el marcado de un ícono del sprite; el tamaño es xs, s, l o xl.
function icono(nombre, tam) {
  return '<svg class="icono' + (tam ? ' icono--' + tam : '') + '" aria-hidden="true"><use href="img/iconos.svg#i-' + nombre + '"/></svg>';
}

// Muestra un mensaje emergente; el tipo es exito, error, advertencia o info.
function mostrarTostada(mensaje, tipo) {
  const contenedor = document.getElementById('tostadas');
  if (!contenedor) return;
  const iconos = { exito: 'ok-circulo', error: 'error-circulo', advertencia: 'alerta', info: 'info' };
  const clase = tipo === 'alerta' ? 'advertencia' : iconos[tipo] ? tipo : 'info';

  while (contenedor.children.length >= 3) contenedor.firstElementChild.remove();

  const tostada = document.createElement('div');
  tostada.className = 'tostada ' + clase;
  tostada.setAttribute('role', clase === 'error' ? 'alert' : 'status');
  tostada.innerHTML = icono(iconos[clase]) + '<span class="tostada__texto"></span>' +
    '<button type="button" class="tostada__cerrar" aria-label="Cerrar mensaje">' + icono('cerrar', 'xs') + '</button>';
  tostada.querySelector('.tostada__texto').textContent = mensaje;
  contenedor.appendChild(tostada);

  let temporizador = null;
  const cerrar = () => {
    clearTimeout(temporizador);
    tostada.classList.add('saliendo');
    setTimeout(() => tostada.remove(), 220);
  };
  const programar = () => {
    temporizador = setTimeout(cerrar, clase === 'error' ? 7000 : clase === 'advertencia' ? 5500 : 4000);
  };
  tostada.querySelector('.tostada__cerrar').addEventListener('click', cerrar);
  tostada.addEventListener('mouseenter', () => clearTimeout(temporizador));
  tostada.addEventListener('mouseleave', programar);
  programar();
}

// Abre una ventana modal nativa por su id.
function abrirDialogo(id) {
  const dialogo = document.getElementById(id);
  if (dialogo && !dialogo.open) dialogo.showModal();
  return dialogo;
}

// Cierra una ventana modal nativa por su id.
function cerrarDialogo(id) {
  const dialogo = document.getElementById(id);
  if (dialogo && dialogo.open) dialogo.close();
}

// Pide confirmación en la ventana compartida y resuelve true solo si la persona acepta.
function confirmarAccion(opciones) {
  const dialogo = document.getElementById('dialogoConfirmar');
  if (!dialogo || dialogo.open) return Promise.resolve(false);

  const peligro = opciones.tipo === 'peligro';
  const botonSi = document.getElementById('confirmarAceptar');
  const botonNo = document.getElementById('confirmarCancelar');
  const marca = document.getElementById('confirmarIcono');

  document.getElementById('confirmarTitulo').textContent = opciones.titulo || '¿Confirmas la acción?';
  document.getElementById('confirmarTexto').textContent = opciones.texto || '';
  marca.className = 'modal__icono' + (peligro ? ' modal__icono--peligro' : opciones.tipo === 'info' ? ' modal__icono--info' : '');
  marca.innerHTML = icono(opciones.icono || 'alerta');
  botonSi.textContent = opciones.confirmar || 'Confirmar';
  botonSi.className = 'btn ' + (peligro ? 'btn--peligro' : 'btn--primario');
  botonNo.textContent = opciones.cancelar || 'Cancelar';

  return new Promise((resolve) => {
    let aceptada = false;
    const aceptar = () => { aceptada = true; dialogo.close(); };
    const cancelar = () => dialogo.close();
    botonSi.addEventListener('click', aceptar);
    botonNo.addEventListener('click', cancelar);
    dialogo.addEventListener('close', () => {
      botonSi.removeEventListener('click', aceptar);
      botonNo.removeEventListener('click', cancelar);
      resolve(aceptada);
    }, { once: true });
    dialogo.showModal();
  });
}

// Cierra las ventanas con sus botones y, si lo permiten, al pulsar sobre el fondo oscuro.
(function activarVentanas() {
  let pulsoEnFondo = false;
  document.addEventListener('mousedown', (e) => {
    pulsoEnFondo = e.target instanceof HTMLDialogElement;
  });
  document.addEventListener('click', (e) => {
    const cierre = e.target.closest('[data-cerrar-dialogo]');
    if (cierre) {
      const dialogo = cierre.closest('dialog');
      if (dialogo) dialogo.close();
      return;
    }
    const objetivo = e.target;
    if (pulsoEnFondo && objetivo instanceof HTMLDialogElement && objetivo.open && objetivo.hasAttribute('data-cierra-fondo')) {
      objetivo.close();
    }
  });
})();

const limpiezasAlSalir = [];

// Registra una función que olvida los datos de la persona cuando cierra sesión.
function registrarLimpieza(funcion) {
  limpiezasAlSalir.push(funcion);
}

// Ejecuta todas las limpiezas registradas; si una falla, las demás se ejecutan igual.
function ejecutarLimpiezas() {
  limpiezasAlSalir.forEach((funcion) => {
    try {
      funcion();
    } catch (err) {
      /* una limpieza fallida no debe impedir el cierre de sesión */
    }
  });
}

// Ejecuta una tarea larga con el botón en estado de carga y evita que se envíe dos veces.
async function conOcupado(boton, tarea) {
  if (boton && boton.getAttribute('aria-busy') === 'true') return undefined;
  if (boton) boton.setAttribute('aria-busy', 'true');
  try {
    return await tarea();
  } finally {
    if (boton) boton.removeAttribute('aria-busy');
  }
}

// Calcula el id del mensaje de error de un campo: loginCorreo pasa a errorLoginCorreo.
function idError(idCampo) {
  return 'error' + idCampo.charAt(0).toUpperCase() + idCampo.slice(1);
}

// Marca un campo como inválido y escribe el mensaje bajo él.
function ponerError(idCampo, mensaje) {
  const aviso = document.getElementById(idError(idCampo));
  if (aviso) aviso.textContent = mensaje;
  const campo = document.getElementById(idCampo);
  if (campo) {
    campo.classList.add('campo--invalido');
    campo.setAttribute('aria-invalid', 'true');
  }
}

// Quita la marca de error de un campo y vacía su mensaje.
function quitarError(idCampo) {
  const aviso = document.getElementById(idError(idCampo));
  if (aviso) aviso.textContent = '';
  const campo = document.getElementById(idCampo);
  if (campo) {
    campo.classList.remove('campo--invalido');
    campo.removeAttribute('aria-invalid');
  }
}

// Quita todos los errores de un formulario o contenedor.
function limpiarErrores(contenedor) {
  if (!contenedor) return;
  contenedor.querySelectorAll('.campo--invalido').forEach((c) => {
    c.classList.remove('campo--invalido');
    c.removeAttribute('aria-invalid');
  });
  contenedor.querySelectorAll('.campo__mensaje-error').forEach((m) => { m.textContent = ''; });
}

// Lleva el foco al primer campo con error para que se corrija sin buscarlo.
function enfocarPrimerError(contenedor) {
  const campo = (contenedor || document).querySelector('.campo--invalido');
  if (campo && typeof campo.focus === 'function') campo.focus();
}

// Devuelve un bloque de estado vacío con ícono, título, texto y una acción opcional.
function estadoVacio(opciones) {
  const accion = opciones.accion
    ? '<button type="button" class="btn btn--s" onclick="' + opciones.accion.onclick + '">' + escaparHtml(opciones.accion.texto) + '</button>'
    : '';
  return '<div class="vacio' + (opciones.compacto ? ' vacio--compacto' : '') + '">' + icono(opciones.icono || 'lista') +
    '<p class="vacio__titulo">' + escaparHtml(opciones.titulo) + '</p>' +
    (opciones.texto ? '<p class="vacio__texto">' + escaparHtml(opciones.texto) + '</p>' : '') + accion + '</div>';
}

// Devuelve un bloque de error de carga con un botón para reintentar.
function estadoError(mensaje, reintentar) {
  const boton = reintentar ? '<button type="button" class="btn btn--s" onclick="' + reintentar + '">' + icono('recargar', 's') + 'Reintentar</button>' : '';
  return '<div class="vacio vacio--compacto vacio--error">' + icono('error-circulo') +
    '<p class="vacio__titulo">No se pudo cargar</p><p class="vacio__texto">' + escaparHtml(mensaje || 'Intenta de nuevo en unos segundos.') + '</p>' + boton + '</div>';
}

// Devuelve bloques de carga animados para listas y tarjetas.
function esqueletoLista(cantidad) {
  return '<span class="solo-lectores">Cargando…</span>' + '<div class="esqueleto esqueleto--bloque"></div>'.repeat(cantidad || 3);
}

// Devuelve una fila de tabla con un mensaje centrado.
function filaMensaje(columnas, mensaje) {
  return '<tr><td colspan="' + columnas + '" class="tabla__vacio">' + escaparHtml(mensaje) + '</td></tr>';
}

// Aplica los anchos y posiciones indicados en data-ancho y data-izq, que evitan escribir estilos dentro del HTML.
function aplicarAnchos(contenedor) {
  const raiz = contenedor || document;
  raiz.querySelectorAll('[data-ancho]').forEach((el) => { el.style.width = el.dataset.ancho + '%'; });
  raiz.querySelectorAll('[data-izq]').forEach((el) => { el.style.left = el.dataset.izq + '%'; });
}

// Indica si el valor es una imagen en base64 de un tipo permitido; evita pintar cualquier otra cadena.
function esFotoValida(foto) {
  return typeof foto === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(foto);
}

// Indica si el texto está libre de los símbolos que el servidor rechaza: menor y mayor que, comillas dobles, tilde grave, barra invertida y caracteres de control.
function textoSinSimbolos(valor) {
  return !/[<>"`\\\u0000-\u001f]/.test(String(valor || ''));
}

// Nombres y apellidos: letras de cualquier idioma, espacios, punto, guion y apóstrofo, hasta 80 caracteres.
const NOMBRE_PERSONA_VALIDO = /^[\p{L}\p{M}\s'.-]{1,80}$/u;
const MENSAJE_NOMBRE_PERSONA = 'Solo letras, espacios, punto, guion y apóstrofo';

// Pone las iniciales o la foto dentro de un avatar.
function pintarAvatar(elemento, textoIniciales, foto) {
  if (!elemento) return;
  if (esFotoValida(foto)) {
    elemento.style.backgroundImage = 'url("' + foto + '")';
    elemento.textContent = '';
  } else {
    elemento.style.backgroundImage = '';
    elemento.textContent = textoIniciales || '?';
  }
}

// Devuelve las iniciales de un nombre completo (máximo dos letras).
function iniciales(nombreCompleto) {
  const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primera = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primera + ultima).toUpperCase();
}

// Alterna la visibilidad de una contraseña y actualiza el botón.
function alternarContrasena(idInput, boton) {
  const campo = document.getElementById(idInput);
  if (!campo) return;
  const visible = campo.type === 'password';
  campo.type = visible ? 'text' : 'password';
  boton.setAttribute('aria-pressed', visible ? 'true' : 'false');
  boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
  boton.innerHTML = icono(visible ? 'ocultar' : 'ver', 's');
}

// Retrasa una función hasta que pasa un tiempo sin llamadas, útil para buscadores.
function debounce(funcion, milisegundos) {
  let temporizador = null;
  return function (...argumentos) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcion.apply(this, argumentos), milisegundos);
  };
}

// Pasa un estado antiguo al nombre vigente.
function normalizarEstado(estado) {
  return estado === 'realizada' ? 'completada' : estado;
}

// Devuelve la insignia con el color y el texto del estado de una tutoría.
function insigniaEstado(estado) {
  const datos = ESTADOS_TUTORIA[normalizarEstado(estado)] || { texto: estado || '—', insignia: 'neutro' };
  return '<span class="insignia insignia--' + datos.insignia + '">' + escaparHtml(datos.texto) + '</span>';
}

// Devuelve el nombre del ícono según la modalidad de la sesión.
function iconoModalidad(modalidad) {
  const m = String(modalidad || '').toLowerCase();
  if (m.includes('virtual')) return 'virtual';
  if (m.includes('presencial')) return 'presencial';
  return 'hibrida';
}

// Formatea una fecha local como AAAA-MM-DD; toISOString usa UTC y en la noche de Colombia corre el día.
function fechaLocalISO(fecha) {
  return fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0') + '-' + String(fecha.getDate()).padStart(2, '0');
}

// Devuelve la fecha de hoy en Colombia como AAAA-MM-DD, sin depender de la zona horaria del navegador.
function hoyColombiaISO() {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
}

// Suma días a una fecha AAAA-MM-DD y devuelve el resultado en el mismo formato.
function sumarDiasISO(iso, dias) {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// Devuelve la fecha de mañana, el mínimo permitido para programar sesiones.
function fechaMananaISO() {
  return sumarDiasISO(hoyColombiaISO(), 1);
}

// Devuelve el problema de una fecha de sesión (antes de mañana o a más de dos años) o una cadena vacía.
function problemaFechaSesion(fecha) {
  if (fecha < fechaMananaISO()) return 'La fecha debe ser a partir de mañana';
  if (fecha > sumarDiasISO(hoyColombiaISO(), 730)) return 'La fecha no puede superar los dos años desde hoy';
  return '';
}

// Convierte AAAA-MM-DD en un objeto Date a medianoche local.
function fechaDesdeISO(iso) {
  return new Date(String(iso).slice(0, 10) + 'T00:00');
}

// Formatea una fecha ISO como dd/mm/aaaa.
function formatearFecha(iso) {
  if (!iso) return '—';
  const [anio, mes, dia] = String(iso).split('T')[0].split('-');
  return dia + '/' + mes + '/' + anio;
}

// Formatea una fecha ISO como «jueves 4 de septiembre».
function fechaLegible(iso) {
  if (!iso) return '';
  const fecha = fechaDesdeISO(iso);
  if (isNaN(fecha)) return iso;
  return fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Formatea una marca de tiempo como fecha y hora de Colombia.
function formatearFechaHora(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (isNaN(fecha)) return '—';
  return fecha.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Describe cuánto hace que ocurrió algo: «Hace 5 min».
function formatearTiempo(iso) {
  if (!iso) return '';
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return 'Ahora mismo';
  if (minutos < 60) return 'Hace ' + minutos + ' min';
  if (minutos < 1440) return 'Hace ' + Math.floor(minutos / 60) + ' h';
  const dias = Math.floor(minutos / 1440);
  return 'Hace ' + dias + (dias === 1 ? ' día' : ' días');
}

// Formatea un número con coma decimal, como se escribe en Colombia.
function numeroCO(valor, decimales) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return Number(valor).toFixed(decimales).replace('.', ',');
}

// Devuelve el instante de una tutoría; la hora guardada es de Colombia (UTC-5, sin horario de verano).
function instanteTutoria(tutoria) {
  if (!tutoria || !tutoria.fecha) return null;
  const instante = new Date(String(tutoria.fecha).slice(0, 10) + 'T' + String(tutoria.hora || '00:00').slice(0, 5) + ':00-05:00');
  return isNaN(instante) ? null : instante;
}

// Indica si la sesión ya ocurrió, según su fecha y hora.
function tutoriaYaPaso(tutoria) {
  const instante = instanteTutoria(tutoria);
  return instante !== null && instante < new Date();
}

// Indica si todavía se puede cancelar: falta más que la antelación mínima o quien cancela es administrador.
function tutoriaCancelable(tutoria, rol) {
  const instante = instanteTutoria(tutoria);
  if (instante === null || instante < new Date()) return false;
  return rol === 'admin' || (instante - new Date()) / 3600000 >= CONFIG.HORAS_CANCELACION;
}
