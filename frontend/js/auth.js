// Comunicación con la API, inicio de sesión, registro, recuperación, Google y ciclo de vida de la sesión.

const ESPERA_MAXIMA_API = 30000;

// Envía la petición al backend y devuelve la respuesta ya leída junto con los datos.
async function pedirAPI(ruta, metodo, cuerpo) {
  const token = authStorage.getToken();
  const opciones = { method: metodo || 'GET', headers: {} };
  if (token) opciones.headers.Authorization = 'Bearer ' + token;
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), ESPERA_MAXIMA_API);
  opciones.signal = control.signal;

  let resp;
  try {
    resp = await fetch(API_URL + ruta, opciones);
  } catch (e) {
    const enLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    throw {
      mensaje: e.name === 'AbortError'
        ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
        : enLocal
          ? 'No se pudo conectar al servidor. ¿Está corriendo el backend en localhost:3000?'
          : 'No se pudo conectar al servidor. Revisa tu conexión e intenta de nuevo.',
    };
  } finally {
    clearTimeout(limite);
  }

  let datos = null;
  try {
    datos = await resp.json();
  } catch (e) {
    datos = null;
  }

  if (!resp.ok) {
    if (resp.status === 401 && token && !ruta.startsWith('/auth/login')) sesionRechazada();
    throw {
      status: resp.status,
      mensaje: (datos && datos.error)
        || (resp.status >= 500
          ? 'El servidor no está disponible en este momento. Espera unos segundos e intenta de nuevo.'
          : 'Error del servidor'),
    };
  }
  if (datos === null) throw { status: resp.status, mensaje: 'Respuesta inesperada del servidor. Intenta de nuevo.' };
  return { resp, datos };
}

// Llama a la API y devuelve los datos; si falla lanza un objeto con status y mensaje.
async function llamarAPI(ruta, metodo, cuerpo) {
  return (await pedirAPI(ruta, metodo, cuerpo)).datos;
}

// Llama a una lista paginada y devuelve los datos con el total que informa el servidor.
async function llamarAPIConTotal(ruta) {
  const { resp, datos } = await pedirAPI(ruta, 'GET');
  const total = Number(resp.headers.get('X-Total-Count'));
  return { datos, total: Number.isFinite(total) && total > 0 ? total : (Array.isArray(datos) ? datos.length : 0) };
}

// Cierra la sesión local cuando el servidor deja de aceptar el token (cuenta desactivada o token vencido).
function sesionRechazada() {
  if (!sesion.activa) return;
  cerrarSesionLocal();
  mostrarTostada('Tu sesión ya no es válida. Ingresa de nuevo.', 'advertencia');
}

// Valida que el correo tenga arroba y el dominio institucional.
function esCorreoValido(correo) {
  return correo.includes('@') && correo.toLowerCase().endsWith(CONFIG.DOMINIO_CORREO);
}

// Valida las reglas de contraseña que aplica el backend y devuelve el primer problema o una cadena vacía.
function problemaContrasena(contrasena) {
  if (contrasena.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Za-z]/.test(contrasena)) return 'Debe incluir al menos una letra';
  if (!/[0-9]/.test(contrasena)) return 'Debe incluir al menos un número';
  if (new TextEncoder().encode(contrasena).length > 72) return 'Máximo 72 caracteres';
  return '';
}

// Muestra el nivel de seguridad de la contraseña mientras se escribe.
function medirFortaleza(valor) {
  const envoltorio = document.getElementById('fortalezaWrap');
  const barra = document.getElementById('fortalezaBarra');
  const texto = document.getElementById('fortalezaTexto');
  if (!envoltorio) return;
  envoltorio.classList.toggle('oculto', !valor);
  if (!valor) return;

  let puntos = 0;
  if (valor.length >= 8) puntos++;
  if (/[A-Z]/.test(valor)) puntos++;
  if (/[0-9]/.test(valor)) puntos++;
  if (/[^A-Za-z0-9]/.test(valor)) puntos++;

  const niveles = [
    { texto: 'Muy débil', color: 'var(--error-600)', ancho: '20%' },
    { texto: 'Débil', color: 'var(--acento-500)', ancho: '40%' },
    { texto: 'Regular', color: 'var(--aviso-500)', ancho: '60%' },
    { texto: 'Buena', color: 'var(--ok-600)', ancho: '80%' },
    { texto: 'Muy fuerte', color: 'var(--ok-700)', ancho: '100%' },
  ];
  const nivel = niveles[Math.min(puntos, 4)];
  barra.style.width = nivel.ancho;
  barra.style.background = nivel.color;
  texto.textContent = nivel.texto;
  texto.style.color = nivel.color;
}

// Guarda el token y los datos del usuario que devuelve el servidor y deja la interfaz lista.
function iniciarSesionLocal(datos) {
  authStorage.setToken(datos.token);
  authStorage.setSesion(datos.usuario);
  authStorage.setUltimaActividad();
  aplicarSesion(datos.usuario);
}

// Valida y envía el formulario de inicio de sesión.
async function alEnviarLogin(e) {
  e.preventDefault();
  const boton = document.getElementById('btnLogin');
  const correo = document.getElementById('loginCorreo').value.trim();
  const contrasena = document.getElementById('loginContrasena').value;
  const recordar = document.getElementById('loginRecordar').checked;

  quitarError('loginCorreo');
  quitarError('loginContrasena');
  document.getElementById('avisoBloqueo').classList.add('oculto');

  let hayError = false;
  if (!correo) {
    ponerError('loginCorreo', 'El correo es obligatorio');
    hayError = true;
  } else if (!esCorreoValido(correo)) {
    ponerError('loginCorreo', 'Solo correos ' + CONFIG.DOMINIO_CORREO);
    hayError = true;
  }
  if (!contrasena) {
    ponerError('loginContrasena', 'La contraseña es obligatoria');
    hayError = true;
  }
  if (hayError) {
    enfocarPrimerError(e.target);
    return;
  }

  await conOcupado(boton, async () => {
    try {
      const datos = await llamarAPI('/auth/login', 'POST', { correo, contrasena });
      if (recordar) authStorage.setCorreoRecordado(correo);
      else authStorage.clearCorreoRecordado();
      document.getElementById('loginContrasena').value = '';
      document.getElementById('avisoSesionExpirada').classList.add('oculto');
      iniciarSesionLocal(datos);
      irAPagina(paginaInicial(datos.usuario.rol));
    } catch (err) {
      if (err.status === 429) {
        document.getElementById('mensajeBloqueo').textContent = err.mensaje;
        document.getElementById('avisoBloqueo').classList.remove('oculto');
      } else if (err.status) {
        ponerError('loginContrasena', err.mensaje || 'Correo o contraseña incorrectos');
      } else {
        mostrarTostada(err.mensaje || 'No se pudo iniciar sesión', 'error');
      }
    }
  });
}

// Valida y envía el formulario de registro.
async function alEnviarRegistro(e) {
  e.preventDefault();
  const boton = document.getElementById('btnRegistro');
  const nombres = document.getElementById('regNombres').value.trim();
  const apellidos = document.getElementById('regApellidos').value.trim();
  const correo = document.getElementById('regCorreo').value.trim();
  const rol = document.getElementById('regRol').value;
  const contrasena = document.getElementById('regContrasena').value;
  const repetida = document.getElementById('regContrasena2').value;
  const terminos = document.getElementById('regTerminos').checked;

  limpiarErrores(e.target);

  let hayError = false;
  if (!nombres) { ponerError('regNombres', 'Escribe tus nombres'); hayError = true; }
  else if (!NOMBRE_PERSONA_VALIDO.test(nombres)) { ponerError('regNombres', MENSAJE_NOMBRE_PERSONA); hayError = true; }
  if (!apellidos) { ponerError('regApellidos', 'Escribe tus apellidos'); hayError = true; }
  else if (!NOMBRE_PERSONA_VALIDO.test(apellidos)) { ponerError('regApellidos', MENSAJE_NOMBRE_PERSONA); hayError = true; }
  if (!correo || !esCorreoValido(correo)) { ponerError('regCorreo', 'Solo correos ' + CONFIG.DOMINIO_CORREO); hayError = true; }
  if (!rol) { ponerError('regRol', 'Selecciona un rol'); hayError = true; }
  const problema = problemaContrasena(contrasena);
  if (problema) { ponerError('regContrasena', problema); hayError = true; }
  if (contrasena !== repetida) { ponerError('regContrasena2', 'Las contraseñas no coinciden'); hayError = true; }
  if (!terminos) { ponerError('regTerminos', 'Debes aceptar los términos para continuar'); hayError = true; }
  if (hayError) {
    enfocarPrimerError(e.target);
    return;
  }

  await conOcupado(boton, async () => {
    try {
      const datos = await llamarAPI('/auth/registro', 'POST', { nombres, apellidos, correo, contrasena, rol });
      e.target.reset();
      medirFortaleza('');
      iniciarSesionLocal(datos);
      irAPagina('completar-perfil');
      mostrarTostada('Cuenta creada. Completa tu perfil para continuar.', 'exito');
    } catch (err) {
      const m = (err.mensaje || '').toLowerCase();
      if (m.includes('apellido')) ponerError('regApellidos', err.mensaje);
      else if (m.includes('nombre')) ponerError('regNombres', err.mensaje);
      else if (m.includes('correo')) ponerError('regCorreo', err.mensaje);
      else if (m.includes('contraseña') || m.includes('contrasena')) ponerError('regContrasena', err.mensaje);
      else if (m.includes('rol')) ponerError('regRol', err.mensaje);
      else mostrarTostada(err.mensaje || 'No se pudo crear la cuenta', 'error');
    }
  });
}

// Valida y envía la solicitud de recuperación de contraseña.
async function alEnviarRecuperacion(e) {
  e.preventDefault();
  const boton = document.getElementById('btnRecuperar');
  const correo = document.getElementById('recCorreo').value.trim();
  quitarError('recCorreo');

  if (!correo || !esCorreoValido(correo)) {
    ponerError('recCorreo', 'Solo correos ' + CONFIG.DOMINIO_CORREO);
    enfocarPrimerError(e.target);
    return;
  }

  await conOcupado(boton, async () => {
    try {
      const respuesta = await llamarAPI('/auth/recuperar', 'POST', { correo });
      document.getElementById('correoRecuperacion').textContent = correo;
      document.getElementById('textoRecuperacion').textContent = respuesta.mensaje || '';
      e.target.classList.add('oculto');
      document.getElementById('cajaMensajeRecuperacion').classList.remove('oculto');
    } catch (err) {
      ponerError('recCorreo', err.mensaje || 'No se pudo registrar la solicitud');
    }
  });
}

// Redirige al backend para iniciar sesión con el proveedor elegido.
function loginSocial(proveedor) {
  if (proveedor === 'Google') {
    window.location.href = API_URL.replace(/\/api$/, '') + '/api/auth/google';
  } else {
    mostrarTostada('Solo el acceso con Google está disponible por ahora.', 'advertencia');
  }
}

// Canjea el código de un solo uso que Google devuelve por el token de sesión.
async function manejarCallbackGoogle() {
  const parametros = new URLSearchParams(window.location.search);
  const codigo = parametros.get('codigo');
  const hayError = parametros.get('error');
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);

  if (hayError) {
    mostrarTostada('No se pudo iniciar sesión con Google. Verifica que uses tu correo ' + CONFIG.DOMINIO_CORREO, 'error');
    return false;
  }
  if (!codigo) return false;

  try {
    const respuesta = await fetch(API_URL + '/auth/google/canjear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.token) {
      mostrarTostada(datos.error || 'El enlace de acceso venció. Inicia sesión de nuevo.', 'error');
      return false;
    }
    iniciarSesionLocal(datos);
    irAPagina(paginaInicial(datos.usuario.rol));
    return true;
  } catch (e) {
    mostrarTostada('No se pudo completar el inicio de sesión con Google.', 'error');
    return false;
  }
}

// Restablece la interfaz al estado sin sesión.
function aplicarEstadoInvitado() {
  document.body.classList.add('sin-sesion');
  Object.assign(sesion, { activa: false, id: null, nombre: '', inicial: '?', correo: '', rol: '' });

  pintarAvatar(document.getElementById('barraAvatar'), '?', '');
  pintarAvatar(document.getElementById('chipAvatar'), '?', '');
  document.getElementById('barraNombre').textContent = 'Invitado';
  document.getElementById('barraRol').textContent = 'Sin sesión';
  document.getElementById('chipNombre').textContent = 'Invitado';
  document.getElementById('botonUsuario').removeAttribute('aria-label');
  document.getElementById('lateralCerrar').classList.add('oculto');
  document.getElementById('bsChip').classList.add('oculto');
  document.getElementById('notifPanel').classList.add('oculto');
  document.getElementById('campanaBadge').classList.add('oculto');
  document.getElementById('notifLista').innerHTML = '';
  ['menuEstudiante', 'menuDocente', 'menuAdmin'].forEach((id) => document.getElementById(id).classList.add('oculto'));
  const pastilla = document.getElementById('pastillaTutoriasAdmin');
  if (pastilla) pastilla.classList.add('oculto');
}

// Aplica los datos de la sesión activa a la interfaz.
function aplicarSesion(usuario) {
  document.body.classList.remove('sin-sesion');
  const nombreCompleto = ((usuario.nombres || '') + ' ' + (usuario.apellidos || '')).trim();
  Object.assign(sesion, {
    activa: true,
    id: usuario.id,
    nombre: nombreCompleto,
    inicial: iniciales(nombreCompleto),
    correo: usuario.correo,
    rol: usuario.rol,
  });

  pintarAvatar(document.getElementById('barraAvatar'), sesion.inicial, '');
  pintarAvatar(document.getElementById('chipAvatar'), sesion.inicial, '');
  document.getElementById('barraNombre').textContent = nombreCompleto;
  document.getElementById('barraRol').textContent = ETIQUETAS_ROL[usuario.rol] || '';
  document.getElementById('chipNombre').textContent = (usuario.nombres || nombreCompleto).split(' ')[0];
  document.getElementById('botonUsuario').setAttribute('aria-label', 'Menú de usuario: ' + nombreCompleto);
  document.getElementById('menuUsuarioNombre').textContent = nombreCompleto;
  document.getElementById('menuUsuarioCorreo').textContent = usuario.correo;
  document.getElementById('lateralCerrar').classList.remove('oculto');
  document.getElementById('bsChip').classList.remove('oculto');

  const menus = { estudiante: 'menuEstudiante', docente: 'menuDocente', admin: 'menuAdmin' };
  Object.entries(menus).forEach(([rol, id]) => document.getElementById(id).classList.toggle('oculto', rol !== usuario.rol));

  cargarNotificaciones();
  cargarReglas();
  cargarFotoAvatar();
}

// Avisa al servidor del cierre para que quede en la auditoría; no espera la respuesta.
function registrarSalida(motivo) {
  if (!authStorage.getToken()) return;
  llamarAPI('/auth/salir', 'POST', { motivo: motivo || 'manual' }).catch(() => {});
}

// Borra todo lo guardado del usuario y vuelve a la pantalla de ingreso.
function cerrarSesionLocal() {
  perfilStorage.limpiarTodo();
  academicoStorage.limpiarTodo();
  authStorage.limpiarTodo();
  ejecutarLimpiezas();
  aplicarEstadoInvitado();
  restablecerPaginas();
  irAPagina('inicio-sesion');
}

// Cierra la sesión a petición de la persona.
function cerrarSesion() {
  registrarSalida('manual');
  cerrarSesionLocal();
  mostrarTostada('Sesión cerrada', 'exito');
}

// Cierra la sesión por inactividad y deja el aviso visible en el inicio de sesión.
function cerrarSesionPorInactividad() {
  registrarSalida('inactividad');
  cerrarSesionLocal();
  document.getElementById('avisoSesionExpirada').classList.remove('oculto');
}

// Indica si pasó el tiempo máximo sin actividad que fija la configuración.
function sesionInactivaVencida() {
  const ultima = authStorage.getUltimaActividad();
  return ultima > 0 && (Date.now() - ultima) / 60000 > CONFIG.MINUTOS_INACTIVIDAD;
}

// Trae las reglas vigentes y actualiza los textos que las muestran.
async function cargarReglas() {
  try {
    const reglas = await llamarAPI('/reglas', 'GET');
    aplicarReglas(reglas);
    guardarClave('cp.reglas', reglas);
  } catch (e) {
    /* se conservan las últimas reglas conocidas */
  }
  actualizarTextosReglas();
}

// Escribe en pantalla los valores de las reglas que cambian desde Configuración.
function actualizarTextosReglas() {
  const horas = document.getElementById('avisoHorasCancelacion');
  if (horas) horas.textContent = CONFIG.HORAS_CANCELACION;
  const cupo = document.getElementById('cupoMaxTutor');
  if (cupo) cupo.textContent = CONFIG.MAX_ESTUDIANTES;
}

// Revisa al cargar la página si hay una sesión guardada que el servidor siga aceptando.
async function verificarSesionGuardada() {
  if (!authStorage.getToken() || !authStorage.getSesion()) {
    aplicarEstadoInvitado();
    paginaParaInvitado();
    return;
  }

  if (sesionInactivaVencida() || authStorage.getUltimaActividad() === 0) {
    authStorage.limpiarTodo();
    aplicarEstadoInvitado();
    paginaParaInvitado();
    document.getElementById('avisoSesionExpirada').classList.remove('oculto');
    return;
  }

  try {
    const usuario = await llamarAPI('/auth/yo', 'GET');
    authStorage.setSesion(usuario);
    authStorage.setUltimaActividad();
    aplicarSesion(usuario);
    irAPagina(paginaInicial(usuario.rol), { reemplazar: true });
  } catch (err) {
    authStorage.limpiarTodo();
    aplicarEstadoInvitado();
    paginaParaInvitado();
  }
}
