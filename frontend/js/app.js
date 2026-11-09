// Estado de la sesión, enrutador por hash, menús, notificaciones y arranque de la aplicación.

const sesion = { activa: false, id: null, nombre: '', inicial: '?', correo: '', rol: '' };

// Título de cada página, usado en la barra superior y en la pestaña del navegador.
const tituloPagina = {
  'inicio-sesion': 'Inicio de sesión',
  'crear-cuenta': 'Crear cuenta',
  'recuperar-contrasena': 'Recuperar contraseña',
  'completar-perfil': 'Completar perfil',
  'panel-estudiante': 'Mi panel',
  'panel-docente': 'Panel docente',
  'panel-admin': 'Panel de administración',
  'programar-tutoria': 'Programar tutoría',
  'mi-perfil': 'Mi perfil',
  'mi-calendario': 'Calendario',
  'admin-usuarios': 'Usuarios',
  'admin-asignacion': 'Asesorías y asignaciones',
  'admin-notificaciones': 'Notificaciones',
  'admin-reportes': 'Reportes',
  'admin-auditoria': 'Auditoría',
  'admin-configuracion': 'Configuración',
};

const paginasPublicas = new Set(['inicio-sesion', 'crear-cuenta', 'recuperar-contrasena']);

// Roles que pueden ver cada página restringida.
const rolesPorPanel = {
  'panel-estudiante': ['estudiante'],
  'panel-docente': ['docente'],
  'panel-admin': ['admin'],
  'admin-usuarios': ['admin'],
  'admin-asignacion': ['admin'],
  'admin-notificaciones': ['admin'],
  'admin-auditoria': ['admin'],
  'admin-configuracion': ['admin'],
  'admin-reportes': ['admin'],
};

const panelDeRol = { estudiante: 'panel-estudiante', docente: 'panel-docente', admin: 'panel-admin' };

// Función que carga los datos de cada página al abrirla; se resuelven al navegar porque viven en otros archivos.
const cargadoresPagina = {
  'panel-estudiante': () => cargarPanelEstudiante(),
  'panel-docente': () => cargarPanelDocente(),
  'panel-admin': () => cargarPanelAdmin(),
  'admin-usuarios': () => cargarTablaUsuarios(),
  'admin-asignacion': () => iniciarAsignaciones(),
  'admin-notificaciones': () => iniciarNotificacionesAdmin(),
  'admin-reportes': () => cargarReportes(),
  'admin-auditoria': () => cargarAuditoria(),
  'admin-configuracion': () => iniciarConfiguracion(),
  'mi-perfil': () => cargarMiPerfil(),
  'mi-calendario': () => iniciarCalendario(),
  'completar-perfil': () => mostrarFormPerfil(),
  'programar-tutoria': () => prepararFormTutoria(),
};

// Lee la página pedida en la dirección (#/nombre) si existe en el documento.
function paginaDesdeRuta() {
  const coincidencia = window.location.hash.match(/^#\/([\w-]+)/);
  return coincidencia && document.getElementById('pagina-' + coincidencia[1]) ? coincidencia[1] : '';
}

// Página con la que se abre la sesión: la de la dirección si el rol puede verla, o el panel propio.
function paginaInicial(rol) {
  const pedida = paginaDesdeRuta();
  const permitidos = rolesPorPanel[pedida];
  const valida = pedida && !paginasPublicas.has(pedida) && (!permitidos || permitidos.includes(rol));
  return valida ? pedida : panelDeRol[rol] || 'panel-estudiante';
}

// Muestra la página pública pedida en la dirección o el inicio de sesión.
function paginaParaInvitado() {
  const pedida = paginaDesdeRuta();
  irAPagina(paginasPublicas.has(pedida) ? pedida : 'inicio-sesion', { reemplazar: true });
}

// Decide a qué página llevar a quien pide una: protege las privadas y los paneles de otros roles.
function resolverDestino(nombre) {
  if (!document.getElementById('pagina-' + nombre)) return sesion.activa ? panelDeRol[sesion.rol] : 'inicio-sesion';
  if (!sesion.activa) return paginasPublicas.has(nombre) ? nombre : 'inicio-sesion';
  if (paginasPublicas.has(nombre)) return panelDeRol[sesion.rol] || 'panel-estudiante';
  const permitidos = rolesPorPanel[nombre];
  return permitidos && !permitidos.includes(sesion.rol) ? panelDeRol[sesion.rol] : nombre;
}

// Cambia de página: valida el acceso, actualiza dirección, título y menú, y carga los datos.
function irAPagina(nombre, opciones) {
  const opc = opciones || {};
  const destino = resolverDestino(nombre);
  const ruta = '#/' + destino;

  if (!opc.desdeHistorial) {
    if (opc.reemplazar || destino !== nombre) window.history.replaceState(null, '', ruta);
    else if (window.location.hash !== ruta) window.history.pushState(null, '', ruta);
  }

  document.querySelectorAll('.pagina').forEach((p) => p.classList.remove('activa'));
  document.getElementById('pagina-' + destino).classList.add('activa');

  const titulo = destino === 'mi-calendario' ? tituloCalendario().corto : tituloPagina[destino] || destino;
  document.getElementById('tituloPaginaActual').textContent = titulo;
  document.title = titulo + ' · ConectaProfe';

  document.querySelectorAll('.lateral__item').forEach((item) => {
    const activo = item.dataset.pagina === destino;
    item.classList.toggle('activo', activo);
    if (activo) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  cerrarMenu();
  cerrarPopovers();
  if (sesion.activa) authStorage.setUltimaActividad();

  const cargador = cargadoresPagina[destino];
  if (cargador) {
    Promise.resolve().then(cargador).catch((err) => console.error('No se pudo cargar la página ' + destino, err));
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!opc.desdeHistorial && sesion.activa) document.getElementById('contenidoPrincipal').focus({ preventScroll: true });
}

// Lleva a la persona a su panel según el rol.
function irAlPanel() {
  irAPagina(panelDeRol[sesion.rol] || 'inicio-sesion');
}

// Mueve el foco al contenido principal desde el enlace «Saltar al contenido».
function enfocarContenido(evento) {
  evento.preventDefault();
  document.getElementById('contenidoPrincipal').focus();
}

// Abre o cierra el menú lateral en pantallas pequeñas.
function alternarMenu() {
  const lateral = document.getElementById('barraLateral');
  const abierto = lateral.classList.toggle('abierta');
  document.getElementById('overlayMenu').classList.toggle('oculto', !abierto);
  document.body.classList.toggle('menu-abierto', abierto);
  document.getElementById('botonMenu').setAttribute('aria-expanded', abierto ? 'true' : 'false');
  if (abierto) enfocarItemDelMenu();
}

// Lleva el foco a la opción activa del menú (o a la primera visible) para quien navega con teclado.
function enfocarItemDelMenu() {
  const visibles = [...document.querySelectorAll('#barraLateral .lateral__item')].filter((i) => i.getClientRects().length);
  (visibles.find((i) => i.classList.contains('activo')) || visibles[0])?.focus({ preventScroll: true });
}

// Cierra el menú lateral y avisa si estaba abierto.
function cerrarMenu() {
  const lateral = document.getElementById('barraLateral');
  const estabaAbierto = lateral.classList.contains('abierta');
  lateral.classList.remove('abierta');
  document.getElementById('overlayMenu').classList.add('oculto');
  document.body.classList.remove('menu-abierto');
  document.getElementById('botonMenu').setAttribute('aria-expanded', 'false');
  return estabaAbierto;
}

// Cierra el menú si la ventana se agranda hasta el diseño de escritorio con el menú abierto.
function vigilarTamanoDeVentana() {
  globalThis.matchMedia('(min-width: 64.0625rem)').addEventListener('change', (e) => {
    if (e.matches) cerrarMenu();
  });
}

const POPOVERS = [
  { panel: 'notifPanel', boton: 'botonCampana' },
  { panel: 'menuUsuario', boton: 'botonUsuario' },
];

// Cierra los paneles flotantes de la barra superior, salvo el indicado.
function cerrarPopovers(excepto) {
  POPOVERS.forEach(({ panel, boton }) => {
    if (panel === excepto) return;
    document.getElementById(panel).classList.add('oculto');
    document.getElementById(boton).setAttribute('aria-expanded', 'false');
  });
}

// Abre o cierra un panel flotante y cierra el otro.
function alternarPopover(idPanel, idBoton) {
  const panel = document.getElementById(idPanel);
  cerrarPopovers(idPanel);
  const abrir = panel.classList.contains('oculto');
  panel.classList.toggle('oculto', !abrir);
  document.getElementById(idBoton).setAttribute('aria-expanded', abrir ? 'true' : 'false');
  return abrir;
}

// Abre o cierra la campana y trae las notificaciones al abrirla.
function alternarNotificaciones() {
  if (alternarPopover('notifPanel', 'botonCampana')) cargarNotificaciones();
}

// Abre o cierra el menú de la cuenta.
function alternarMenuUsuario() {
  alternarPopover('menuUsuario', 'botonUsuario');
}

const ICONOS_NOTIFICACION = { '⚠️': 'alerta', '⚠': 'alerta', '📅': 'calendario', '📢': 'enviar', '❌': 'cancelar-circulo', '🔑': 'llave', '✅': 'ok-circulo' };

// Carga las notificaciones del usuario, actualiza el contador de la campana y dibuja el panel.
async function cargarNotificaciones() {
  if (!sesion.activa) return;
  const lista = document.getElementById('notifLista');
  try {
    const notificaciones = await llamarAPI('/notificaciones', 'GET');
    if (!sesion.activa) return;
    const noLeidas = notificaciones.filter((n) => !n.leida).length;
    const marca = document.getElementById('campanaBadge');
    marca.textContent = noLeidas > 99 ? '99+' : noLeidas;
    marca.classList.toggle('oculto', noLeidas === 0);
    document.getElementById('botonCampana').setAttribute('aria-label', noLeidas ? 'Notificaciones, ' + noLeidas + ' sin leer' : 'Notificaciones');

    if (!notificaciones.length) {
      lista.innerHTML = estadoVacio({ icono: 'campana', titulo: 'Sin notificaciones', texto: 'Aquí verás los avisos de tus tutorías.', compacto: true });
      return;
    }
    lista.innerHTML = notificaciones.slice(0, 20).map((n) =>
      '<button type="button" class="notif-item' + (n.leida ? '' : ' no-leida') + '" onclick="leerNotif(' + Number(n.id) + ')">' +
        '<span class="notif-item__icono">' + icono(ICONOS_NOTIFICACION[n.icono] || 'campana') + '</span>' +
        '<span class="notif-item__cuerpo">' +
          '<span class="notif-item__titulo">' + escaparHtml(n.titulo) + '</span>' +
          '<span class="notif-item__desc">' + escaparHtml(n.descripcion || '') + '</span>' +
          '<span class="notif-item__tiempo">' + formatearTiempo(n.creada_en) + '</span>' +
        '</span>' +
        (n.leida ? '' : '<span class="notif-item__punto" aria-label="Sin leer"></span>') +
      '</button>').join('');
  } catch (err) {
    if (!lista.children.length) lista.innerHTML = estadoError('No se pudieron traer tus notificaciones.', 'cargarNotificaciones()');
  }
}

// Marca una notificación como leída y refresca la lista.
async function leerNotif(id) {
  try {
    await llamarAPI('/notificaciones/' + id + '/leer', 'PATCH');
    cargarNotificaciones();
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo marcar la notificación', 'error');
  }
}

// Marca todas las notificaciones como leídas.
async function marcarTodasLeidas() {
  try {
    await llamarAPI('/notificaciones/leer-todas', 'PATCH');
    cargarNotificaciones();
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudieron marcar las notificaciones', 'error');
  }
}

const validarCorreoCampo = (v) => (v && !esCorreoValido(v) ? 'Solo correos ' + CONFIG.DOMINIO_CORREO : '');
const validarCedulaCampo = (v) => (v && !/^\d{6,11}$/.test(v) ? 'Solo números, entre 6 y 11 dígitos' : '');
const validarTelefonoCampo = (v) => (v && !/^\d{7,10}$/.test(v) ? 'Entre 7 y 10 números' : '');

// Validaciones que se aplican al salir de cada campo, por id; devuelven el mensaje o una cadena vacía.
const VALIDACIONES_AL_SALIR = {
  loginCorreo: validarCorreoCampo,
  regCorreo: validarCorreoCampo,
  recCorreo: validarCorreoCampo,
  regContrasena: (v) => (v ? problemaContrasena(v) : ''),
  regContrasena2: (v) => (v && v !== document.getElementById('regContrasena').value ? 'Las contraseñas no coinciden' : ''),
  estDocumento: validarCedulaCampo,
  docCedula: validarCedulaCampo,
  admCedula: validarCedulaCampo,
  estTelefono: validarTelefonoCampo,
  docTelefono: validarTelefonoCampo,
  admTelefono: validarTelefonoCampo,
  tutFecha: (v) => (v ? problemaFechaSesion(v) : ''),
};

// Valida los campos al salir de ellos y limpia el error en cuanto se vuelve a escribir.
function activarValidacionEnVivo() {
  document.addEventListener('focusout', (e) => {
    const regla = VALIDACIONES_AL_SALIR[e.target.id];
    if (!regla) return;
    quitarError(e.target.id);
    const mensaje = regla((e.target.value || '').trim());
    if (mensaje) ponerError(e.target.id, mensaje);
  });
  const limpiar = (e) => {
    const campo = e.target;
    if (!campo.classList || !campo.classList.contains('campo--invalido')) return;
    if (campo.id) {
      quitarError(campo.id);
    } else {
      campo.classList.remove('campo--invalido');
      campo.removeAttribute('aria-invalid');
    }
  };
  document.addEventListener('input', limpiar);
  document.addEventListener('change', limpiar);

  document.addEventListener('input', (e) => {
    if (e.target.id === 'loginCorreo') document.getElementById('okLoginCorreo').classList.toggle('oculto', !esCorreoValido(e.target.value.trim()));
  });
}

// Conecta cada formulario con su manejador de envío.
function conectarFormularios() {
  const manejadores = {
    formularioLogin: alEnviarLogin,
    formularioRegistro: alEnviarRegistro,
    formularioRecuperacion: alEnviarRecuperacion,
    formularioPerfilEstudiante: alEnviarPerfilEstudiante,
    formularioPerfilDocente: alEnviarPerfilDocente,
    formularioPerfilAdmin: alEnviarPerfilAdmin,
    formularioTutoria: alEnviarTutoria,
    formularioUsuario: guardarUsuario,
    formularioPeriodo: guardarNuevoPeriodo,
    formularioMateria: confirmarCrearAsignatura,
  };
  document.addEventListener('submit', (e) => {
    const manejador = manejadores[e.target.id];
    if (manejador) manejador(e);
  });
}

// Renueva la marca de actividad y cierra la sesión si ya venció el tiempo de inactividad.
function vigilarInactividad() {
  ['click', 'keydown', 'scroll'].forEach((evento) => {
    document.addEventListener(evento, () => {
      if (!sesion.activa) return;
      if (sesionInactivaVencida()) cerrarSesionPorInactividad();
      else authStorage.setUltimaActividad();
    }, { passive: true, capture: true });
  });
  setInterval(() => {
    if (sesion.activa && sesionInactivaVencida()) cerrarSesionPorInactividad();
  }, 30000);
}

// Trae notificaciones nuevas cada dos minutos y al volver a la pestaña.
function vigilarNotificaciones() {
  setInterval(() => {
    if (sesion.activa && !document.hidden) cargarNotificaciones();
  }, 120000);
  document.addEventListener('visibilitychange', () => {
    if (sesion.activa && !document.hidden) cargarNotificaciones();
  });
}

// Cierra los paneles flotantes al pulsar fuera de ellos o al presionar Escape.
function vigilarPopovers() {
  document.addEventListener('click', (e) => {
    POPOVERS.forEach(({ panel, boton }) => {
      const abierto = !document.getElementById(panel).classList.contains('oculto');
      if (abierto && !document.getElementById(panel).contains(e.target) && !document.getElementById(boton).contains(e.target)) {
        cerrarPopovers();
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const abierto = POPOVERS.find(({ panel }) => !document.getElementById(panel).classList.contains('oculto'));
    if (abierto) {
      cerrarPopovers();
      document.getElementById(abierto.boton).focus();
    }
    if (cerrarMenu()) document.getElementById('botonMenu').focus();
  });
}

const paginasOriginales = new Map();

// Guarda el marcado original de cada página antes de que se llene con datos de alguien.
function guardarPaginasOriginales() {
  document.querySelectorAll('.pagina').forEach((pagina) => paginasOriginales.set(pagina.id, pagina.cloneNode(true)));
}

// Devuelve las páginas a su estado original para que la siguiente persona no vea datos ajenos.
function restablecerPaginas() {
  document.querySelectorAll('.pagina').forEach((pagina) => {
    const original = paginasOriginales.get(pagina.id);
    if (original) pagina.replaceWith(original.cloneNode(true));
  });
  rellenarCorreoRecordado();
}

// Pone en el inicio de sesión el correo que la persona pidió recordar.
function rellenarCorreoRecordado() {
  const recordado = authStorage.getCorreoRecordado();
  if (!recordado) return;
  document.getElementById('loginCorreo').value = recordado;
  document.getElementById('loginRecordar').checked = true;
  document.getElementById('okLoginCorreo').classList.toggle('oculto', !esCorreoValido(recordado));
}

// Retira la pantalla de carga con una transición suave.
function ocultarSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('splash--saliendo');
  setTimeout(() => splash.remove(), 600);
}

// Arranca la aplicación cuando el documento está listo.
document.addEventListener('DOMContentLoaded', async () => {
  const inicio = performance.now();
  guardarPaginasOriginales();
  conectarFormularios();
  activarValidacionEnVivo();
  vigilarInactividad();
  vigilarNotificaciones();
  vigilarPopovers();
  vigilarTamanoDeVentana();
  window.addEventListener('popstate', () => {
    if (window.location.hash && !window.location.hash.startsWith('#/')) return;
    irAPagina(paginaDesdeRuta() || (sesion.activa ? panelDeRol[sesion.rol] : 'inicio-sesion'), { desdeHistorial: true });
  });

  rellenarCorreoRecordado();

  try {
    const vieneDeGoogle = /[?&](codigo|error)=/.test(window.location.search);
    const entro = vieneDeGoogle ? await manejarCallbackGoogle() : false;
    if (!entro) await verificarSesionGuardada();
  } finally {
    setTimeout(ocultarSplash, Math.max(0, 450 - (performance.now() - inicio)));
  }
});
