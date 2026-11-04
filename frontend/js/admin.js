// Administración: utilidades compartidas, panel de control y buscador de usuarios.

const BUSCADORES_ADMIN = ['notifUsuario', 'claseDocente', 'claseEstudiante'];

const RETRASO_BUSQUEDA = 250;

const busquedasAdmin = { temporizadores: {}, secuencias: {} };

// Cada cierre de sesión sube la generación: las respuestas que llegan después se descartan.
let generacionAdmin = 0;

registrarLimpieza(() => {
  generacionAdmin += 1;
  Object.values(busquedasAdmin.temporizadores).forEach(clearTimeout);
  busquedasAdmin.temporizadores = {};
  busquedasAdmin.secuencias = {};
});

// Devuelve el valor recortado de un campo, o una cadena vacía si no existe.
function valorDe(id) {
  const campo = document.getElementById(id);
  return campo ? String(campo.value).trim() : '';
}

// Devuelve una celda de tabla con la etiqueta que se muestra al apilar las filas en pantallas pequeñas.
function celda(etiqueta, contenido, clase) {
  return '<td' + (clase ? ' class="' + clase + '"' : '') + ' data-etiqueta="' + escaparHtml(etiqueta) + '">' + contenido + '</td>';
}

// Devuelve la fila de una tabla con un bloque de error y el botón para reintentar.
function filaError(columnas, mensaje, reintentar) {
  return '<tr><td colspan="' + columnas + '" class="tabla__vacio">' + estadoError(mensaje, reintentar) + '</td></tr>';
}

// Devuelve el nombre completo de un usuario de la API.
function nombreUsuario(usuario) {
  return ((usuario.nombres || '') + ' ' + (usuario.apellidos || '')).trim();
}

// Devuelve el programa, la facultad o la dependencia de un usuario.
function programaUsuario(usuario) {
  return usuario.programa || usuario.facultad || usuario.dependencia || '—';
}

// Devuelve la fecha de registro de una cuenta en dd/mm/aaaa.
function fechaRegistro(valor) {
  return valor ? formatearFecha(String(valor).slice(0, 10)) : '—';
}

// Formatea AAAA-MM-DD como «03 feb 2026».
function fechaCorta(iso) {
  const partes = String(iso || '').slice(0, 10).split('-');
  const mes = MESES_CORTOS[Number(partes[1]) - 1];
  return partes.length === 3 && mes ? partes[2] + ' ' + mes + ' ' + partes[0] : '—';
}

// Formatea un conteo con separador de miles.
function miles(valor) {
  return Number(valor || 0).toLocaleString('es-CO');
}

// Devuelve un conteo con el sustantivo en singular o plural.
function conteoTexto(cantidad, singular, plural) {
  return Number(cantidad || 0) + ' ' + (Number(cantidad) === 1 ? singular : plural);
}

// Devuelve el estado visible de una cuenta: inactivo, en alerta o activo.
function estadoUsuario(usuario) {
  if (!Number(usuario.activo)) return { texto: 'Inactivo', insignia: 'neutro' };
  const promedio = Number(usuario.promedio);
  if (usuario.rol === 'estudiante' && promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO) return { texto: 'En alerta', insignia: 'error' };
  return { texto: 'Activo', insignia: 'ok' };
}

// Devuelve la insignia con el estado de una cuenta.
function insigniaUsuario(usuario) {
  const estado = estadoUsuario(usuario);
  return '<span class="insignia insignia--' + estado.insignia + '">' + estado.texto + '</span>';
}

// Devuelve el avatar con las iniciales y el nombre de un usuario.
function personaUsuario(usuario, detalle) {
  const nombre = nombreUsuario(usuario);
  return '<span class="persona"><span class="avatar avatar--s" aria-hidden="true">' + escaparHtml(iniciales(nombre)) + '</span>' +
    '<span class="persona__datos"><span class="persona__nombre">' + escaparHtml(nombre) + '</span>' +
    (detalle ? '<span class="persona__detalle" title="' + escaparHtml(detalle) + '">' + escaparHtml(detalle) + '</span>' : '') + '</span></span>';
}

// Pinta el conteo, el número de página y los botones de una lista paginada en el servidor.
function pintarPaginacion(estado, ids, nombres) {
  const paginas = Math.max(1, Math.ceil(estado.total / estado.porPagina));
  const desde = estado.total ? (estado.pagina - 1) * estado.porPagina + 1 : 0;
  const hasta = Math.min(estado.total, estado.pagina * estado.porPagina);
  ponerTexto(ids.conteo, estado.total
    ? 'Mostrando ' + desde + '–' + hasta + ' de ' + miles(estado.total) + ' ' + (estado.total === 1 ? nombres[0] : nombres[1])
    : 'Sin ' + nombres[1]);
  ponerTexto(ids.pagina, 'Página ' + estado.pagina + ' de ' + paginas);
  const anterior = document.getElementById(ids.anterior);
  const siguiente = document.getElementById(ids.siguiente);
  if (anterior) anterior.disabled = estado.pagina <= 1;
  if (siguiente) siguiente.disabled = estado.pagina >= paginas;
}

// Arma un CSV con punto y coma y BOM para que Excel en español abra tildes y columnas; neutraliza los textos que Excel leería como fórmulas.
function armarCSV(filas) {
  const celdaCSV = (valor) => {
    let texto = valor === null || valor === undefined ? '' : String(valor);
    if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = "'" + texto;
    return /[";\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  return '﻿' + filas.map((fila) => fila.map(celdaCSV).join(';')).join('\r\n');
}

// Descarga un archivo de texto en el navegador.
function descargarArchivo(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Carga los indicadores del panel y los usuarios recientes.
async function cargarPanelAdmin() {
  const generacion = generacionAdmin;
  cargarUsuariosRecientes();
  try {
    const stats = await llamarAPI('/admin/estadisticas', 'GET');
    if (generacion !== generacionAdmin) return;
    const alertas = stats.alertas_activas || 0;
    ponerTexto('admNumUsuarios', miles(stats.total_usuarios));
    ponerTexto('admNumTutorias', miles(stats.total_tutorias));
    ponerTexto('admNumAlertas', miles(alertas));
    ponerTexto('admNumAsignaciones', miles(stats.total_asignaciones));
    ponerTexto('admNumEventos', miles(stats.eventos_auditoria));
    ponerTexto('admNumPeriodo', stats.periodo_activo || '—');
    ponerTexto('admLeyendaPeriodo', stats.periodo_activo ? 'Período activo' : 'Sin período activo');

    const tarjeta = document.getElementById('admAlertasTarjeta');
    if (tarjeta) tarjeta.className = 'kpi kpi--clic' + (alertas ? ' kpi--alerta' : '');
    const pastilla = document.getElementById('pastillaTutoriasAdmin');
    if (pastilla) {
      pastilla.textContent = stats.tutorias_proximas || '';
      pastilla.classList.toggle('oculto', !stats.tutorias_proximas);
    }
    renderAccion('accionAdmin', accionAdmin({
      alertas,
      totalUsuarios: stats.total_usuarios || 0,
      totalAsignaciones: stats.total_asignaciones || 0,
    }));
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudieron cargar los indicadores del panel', 'error');
  }
}

// Llena la tabla de los cinco usuarios más recientes del panel.
async function cargarUsuariosRecientes() {
  const generacion = generacionAdmin;
  const cuerpo = document.getElementById('cuerpoUsuariosRecientes');
  if (!cuerpo) return;
  try {
    const usuarios = await llamarAPI('/admin/usuarios?limite=5', 'GET');
    if (generacion !== generacionAdmin) return;
    cuerpo.innerHTML = usuarios.length
      ? usuarios.map((u) => '<tr>' +
          celda('Nombre', personaUsuario(u), 'celda-principal') +
          celda('Rol', escaparHtml(ETIQUETAS_ROL[u.rol] || u.rol)) +
          celda('Programa', escaparHtml(programaUsuario(u))) +
          celda('Estado', insigniaUsuario(u)) +
          celda('Registro', fechaRegistro(u.creado_en)) + '</tr>').join('')
      : filaMensaje(5, 'Aún no hay usuarios registrados');
  } catch (err) {
    if (generacion === generacionAdmin) cuerpo.innerHTML = filaError(5, err.mensaje, 'cargarUsuariosRecientes()');
  }
}

// Cierra la lista de sugerencias de un campo de búsqueda.
function cerrarSugerencias(campo) {
  const lista = document.getElementById(campo + 'Results');
  const entrada = document.getElementById(campo);
  if (lista) lista.innerHTML = '';
  if (entrada) entrada.setAttribute('aria-expanded', 'false');
}

// Escribe las sugerencias de un campo y las deja visibles.
function mostrarSugerencias(campo, html) {
  const lista = document.getElementById(campo + 'Results');
  const entrada = document.getElementById(campo);
  if (!lista || !entrada) return;
  lista.innerHTML = html;
  entrada.setAttribute('aria-expanded', html ? 'true' : 'false');
}

// Invalida las búsquedas pendientes de un campo.
function cancelarBusquedaAdmin(campo) {
  clearTimeout(busquedasAdmin.temporizadores[campo]);
  busquedasAdmin.secuencias[campo] = (busquedasAdmin.secuencias[campo] || 0) + 1;
}

// Reacciona a lo que se escribe en un buscador de usuarios: invalida la selección y consulta tras una pausa.
function buscarUsuarioAdmin(campo, rol) {
  const entrada = document.getElementById(campo);
  const oculto = document.getElementById(campo + 'Id');
  if (!entrada) return;
  if (oculto) oculto.value = '';
  if (campo === 'claseDocente') cargarMateriasDeDocente('claseAsignatura', '', 'Primero elige el docente');

  cancelarBusquedaAdmin(campo);
  const texto = entrada.value.trim();
  if (texto.length < 2) {
    cerrarSugerencias(campo);
    return;
  }
  busquedasAdmin.temporizadores[campo] = setTimeout(() => ejecutarBusquedaAdmin(campo, rol, texto), RETRASO_BUSQUEDA);
}

// Consulta los usuarios activos que coinciden y pinta las sugerencias.
async function ejecutarBusquedaAdmin(campo, rol, texto) {
  const generacion = generacionAdmin;
  const turno = (busquedasAdmin.secuencias[campo] = (busquedasAdmin.secuencias[campo] || 0) + 1);
  const aviso = (contenido) => '<div class="sugerencia sugerencia--vacia" role="option" aria-disabled="true">' + escaparHtml(contenido) + '</div>';
  try {
    const resultados = await llamarAPI('/admin/buscar-usuario?q=' + encodeURIComponent(texto) + (rol ? '&rol=' + encodeURIComponent(rol) : ''), 'GET');
    if (turno !== busquedasAdmin.secuencias[campo] || generacion !== generacionAdmin) return;
    mostrarSugerencias(campo, resultados.length
      ? resultados.map((u) => {
        const documento = u.cedula && u.cedula !== '—' ? u.cedula : '';
        const detalle = [rol ? '' : ETIQUETAS_ROL[u.rol] || u.rol, documento ? 'Documento ' + documento : '', u.info].filter(Boolean).join(' · ');
        return '<button type="button" class="sugerencia" role="option" data-admin="elegir-usuario" data-campo="' + campo + '" data-id="' + Number(u.id) +
          '" data-texto="' + escaparHtml(u.nombre + (documento ? ' · CC ' + documento : '')) + '">' +
          '<span class="sugerencia__titulo">' + escaparHtml(u.nombre) + '</span>' +
          '<span class="sugerencia__detalle">' + escaparHtml(detalle) + '</span></button>';
      }).join('')
      : aviso('Sin resultados para «' + texto + '»'));
  } catch (err) {
    if (turno === busquedasAdmin.secuencias[campo] && generacion === generacionAdmin) {
      mostrarSugerencias(campo, aviso(err.mensaje || 'No se pudo buscar. Intenta de nuevo.'));
    }
  }
}

// Fija el usuario elegido en un buscador y, si es el docente de una asesoría, carga sus materias.
function elegirUsuarioAdmin(campo, id, texto) {
  const entrada = document.getElementById(campo);
  const oculto = document.getElementById(campo + 'Id');
  cancelarBusquedaAdmin(campo);
  if (entrada) entrada.value = texto;
  if (oculto) oculto.value = id;
  quitarError(campo);
  cerrarSugerencias(campo);
  if (campo === 'claseDocente') cargarMateriasDeDocente('claseAsignatura', id, 'Primero elige el docente');
  if (entrada) entrada.focus();
}

// Mueve el foco entre el cuadro de búsqueda y sus sugerencias con las flechas y cierra con Escape.
function teclasSugerencias(e) {
  const contenedor = e.target.closest('.con-sugerencias');
  const entrada = contenedor && contenedor.querySelector('[role="combobox"]');
  if (!entrada || !BUSCADORES_ADMIN.includes(entrada.id)) return;

  const campo = entrada.id;
  const opcion = e.target.closest('button.sugerencia');
  const opciones = Array.from(document.querySelectorAll('#' + campo + 'Results button.sugerencia'));
  if (e.key === 'Escape') {
    cerrarSugerencias(campo);
    document.getElementById(campo).focus();
  } else if (e.key === 'ArrowDown' && opciones.length) {
    e.preventDefault();
    const siguiente = opcion ? opciones[opciones.indexOf(opcion) + 1] : opciones[0];
    if (siguiente) siguiente.focus();
  } else if (e.key === 'ArrowUp' && opcion) {
    e.preventDefault();
    const anterior = opciones[opciones.indexOf(opcion) - 1];
    (anterior || document.getElementById(campo)).focus();
  }
}

// Cierra las listas de sugerencias cuando se pulsa fuera de ellas.
function cerrarSugerenciasAjenas(objetivo) {
  BUSCADORES_ADMIN.forEach((campo) => {
    const entrada = document.getElementById(campo);
    const contenedor = entrada && entrada.closest('.con-sugerencias');
    if (contenedor && !contenedor.contains(objetivo)) cerrarSugerencias(campo);
  });
}

// Atiende la elección de una sugerencia y cierra las listas al pulsar fuera de ellas.
document.addEventListener('click', (e) => {
  const opcion = e.target.closest('[data-admin="elegir-usuario"]');
  if (opcion) elegirUsuarioAdmin(opcion.dataset.campo, opcion.dataset.id, opcion.dataset.texto);
  else cerrarSugerenciasAjenas(e.target);
});

document.addEventListener('keydown', teclasSugerencias);
