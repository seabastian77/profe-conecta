// Maneja login, registro, cierre de sesión y Google OAuth

async function llamarAPI(ruta, metodo, cuerpo) {
  var token = authStorage.getToken();

  // En modo demo responde sin conectarse al backend
  if (CONFIG.MODO_DEMO) {
    return await llamarAPIDemo(ruta, metodo || "GET", cuerpo || null, token);
  }

  // En modo real hace fetch al backend
  var opciones = {
    method: metodo || "GET",
    headers: { "Content-Type": "application/json" },
  };

  if (token) opciones.headers["Authorization"] = "Bearer " + token;
  if (cuerpo) opciones.body = JSON.stringify(cuerpo);

  var resp;
  try {
    resp = await fetch(API_URL + ruta, opciones);
  } catch (e) {
    throw {
      mensaje:
        "No se pudo conectar al servidor. ¿Está corriendo el backend en localhost:3000?",
    };
  }

  var data = await resp.json();
  if (!resp.ok)
    throw { status: resp.status, mensaje: data.error || "Error del servidor" };
  return data;
}

// Valida que el correo tenga arroba y el dominio permitido
function esCorreoValido(correo) {
  return correo.includes("@") && correo.endsWith(CONFIG.DOMINIO_CORREO);
}

// Valida y envía el formulario de inicio de sesión
async function alEnviarLogin(e) {
  e.preventDefault();

  var correo = document.getElementById("loginCorreo").value.trim();
  var contrasena = document.getElementById("loginContrasena").value;
  var recordar = document.getElementById("loginRecordar").checked;
  var hayError = false;

  quitarError("loginCorreo");
  quitarError("loginContrasena");

  if (!correo) {
    ponerError("loginCorreo", "El correo es obligatorio");
    hayError = true;
  } else if (!esCorreoValido(correo)) {
    ponerError("loginCorreo", "Solo correos " + CONFIG.DOMINIO_CORREO);
    hayError = true;
  }

  if (!contrasena) {
    ponerError("loginContrasena", "La contraseña es obligatoria");
    hayError = true;
  }

  if (hayError) return;

  var btnTexto = document.getElementById("btnLoginTexto");
  var btnCargando = document.getElementById("btnLoginCargando");
  btnTexto.classList.add("oculto");
  btnCargando.classList.remove("oculto");

  try {
    var data = await llamarAPI("/auth/login", "POST", { correo, contrasena });

    authStorage.setToken(data.token);
    authStorage.setSesion(data.usuario);
    authStorage.setUltimaActividad();

    if (recordar) {
      authStorage.setCorreoRecordado(correo);
    } else {
      authStorage.clearCorreoRecordado();
    }

    aplicarSesion(data.usuario);

    var paneles = {
      estudiante: "panel-estudiante",
      docente: "panel-docente",
      admin: "panel-admin",
    };
    irAPagina(paneles[data.usuario.rol] || "panel-estudiante");
  } catch (err) {
    if (err.status === 429) {
      document.getElementById("avisoBloqueo").classList.remove("oculto");
    } else {
      ponerError(
        "loginCorreo",
        err.mensaje || "Correo o contraseña incorrectos",
      );
    }
  } finally {
    btnTexto.classList.remove("oculto");
    btnCargando.classList.add("oculto");
  }
}

// Valida y envía el formulario de registro
async function alEnviarRegistro(e) {
  e.preventDefault();

  var nombres = document.getElementById("regNombres").value.trim();
  var apellidos = document.getElementById("regApellidos").value.trim();
  var correo = document.getElementById("regCorreo").value.trim();
  var rol = document.getElementById("regRol").value;
  var contrasena = document.getElementById("regContrasena").value;
  var contra2 = document.getElementById("regContrasena2").value;
  var terminos = document.getElementById("regTerminos").checked;
  var hayError = false;

  [
    "regNombres",
    "regApellidos",
    "regCorreo",
    "regRol",
    "regContrasena",
    "regContrasena2",
    "regTerminos",
  ].forEach(function (id) {
    quitarError(id);
  });

  if (!nombres) {
    ponerError("regNombres", "Requerido");
    hayError = true;
  }
  if (!apellidos) {
    ponerError("regApellidos", "Requerido");
    hayError = true;
  }
  if (!correo || !esCorreoValido(correo)) {
    ponerError("regCorreo", "Solo correos " + CONFIG.DOMINIO_CORREO);
    hayError = true;
  }
  if (!rol) {
    ponerError("regRol", "Selecciona un rol");
    hayError = true;
  }
  // Valida la contraseña con las mismas reglas que aplica el backend
  var reglasContrasena = [
    [contrasena.length >= 8, "Mínimo 8 caracteres"],
    [/[A-Za-z]/.test(contrasena), "Debe incluir al menos una letra"],
    [/[0-9]/.test(contrasena), "Debe incluir al menos un número"],
  ];
  var falla = reglasContrasena.find(function (r) { return !r[0]; });
  if (falla) {
    ponerError("regContrasena", falla[1]);
    hayError = true;
  }
  if (contrasena !== contra2) {
    ponerError("regContrasena2", "Las contraseñas no coinciden");
    hayError = true;
  }
  if (!terminos) {
    ponerError("regTerminos", "Acepta los términos");
    hayError = true;
  }

  if (hayError) return;

  try {
    var data = await llamarAPI("/auth/registro", "POST", {
      nombres,
      apellidos,
      correo,
      contrasena,
      rol,
    });

    authStorage.setToken(data.token);
    authStorage.setSesion(data.usuario);
    authStorage.setUltimaActividad();

    aplicarSesion(data.usuario);
    irAPagina("completar-perfil");
  } catch (err) {
    // Muestra el error del servidor en el campo que lo causó
    var m = (err.mensaje || "").toLowerCase();
    if (m.includes("correo")) {
      ponerError("regCorreo", err.mensaje);
    } else if (m.includes("contraseña") || m.includes("contrasena")) {
      ponerError("regContrasena", err.mensaje);
    } else if (m.includes("rol")) {
      ponerError("regRol", err.mensaje);
    } else {
      mostrarTostada(err.mensaje || "Error al crear la cuenta", "error");
    }
  }
}

// Valida y envía el formulario de recuperación de contraseña
async function alEnviarRecuperacion(e) {
  e.preventDefault();

  var correo = document.getElementById("recCorreo").value.trim();
  quitarError("recCorreo");

  if (!correo || !esCorreoValido(correo)) {
    ponerError("recCorreo", "Solo correos " + CONFIG.DOMINIO_CORREO);
    return;
  }

  var btnTexto = document.getElementById("btnRecuperarTexto");
  var btnCargando = document.getElementById("btnRecuperarCargando");
  btnTexto.classList.add("oculto");
  btnCargando.classList.remove("oculto");

  try {
    await llamarAPI("/auth/recuperar", "POST", { correo });
    document.getElementById("correoRecuperacion").textContent = correo;
    document.getElementById("formularioRecuperacion").classList.add("oculto");
    document
      .getElementById("cajaMensajeRecuperacion")
      .classList.remove("oculto");
  } catch (err) {
    ponerError("recCorreo", err.mensaje || "Error al enviar el enlace");
  } finally {
    btnTexto.classList.remove("oculto");
    btnCargando.classList.add("oculto");
  }
}

// Redirige al backend para iniciar sesión con un proveedor social
function loginSocial(proveedor) {
  // En modo demo muestra un mensaje en lugar de llamar al backend
  if (typeof CONFIG !== "undefined" && CONFIG.MODO_DEMO) {
    mostrarTostada(
      "🔐 El login con " +
        proveedor +
        " requiere el backend. Usa las cuentas demo: valentina.lopez@amigo.edu.co / 12345678",
      "alerta",
    );
    return;
  }
  if (proveedor === "Google") {
    window.location.href = API_URL.replace("/api", "") + "/api/auth/google";
  } else {
    mostrarTostada("Solo Google OAuth está disponible por ahora", "alerta");
  }
}

// Canjea el código de un solo uso que Google devuelve por el token de sesión
async function manejarCallbackGoogle() {
  var params = new URLSearchParams(window.location.search);
  var codigo = params.get("codigo");
  var error = params.get("error");

  if (error) {
    mostrarTostada(
      "No se pudo iniciar sesión con Google. Verifica que uses tu correo " +
        CONFIG.DOMINIO_CORREO,
      "error",
    );
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (!codigo) return;

  // Limpia la URL antes de continuar
  window.history.replaceState({}, document.title, window.location.pathname);

  try {
    var respuesta = await fetch(API_URL + "/auth/google/canjear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: codigo }),
    });

    var data = await respuesta.json();

    if (!respuesta.ok || !data.token) {
      mostrarTostada(
        data.error || "El enlace de acceso venció. Inicia sesión de nuevo.",
        "error",
      );
      return;
    }

    authStorage.setToken(data.token);
    authStorage.setSesion(data.usuario);
    authStorage.setUltimaActividad();
    aplicarSesion(data.usuario);

    var paneles = {
      estudiante: "panel-estudiante",
      docente: "panel-docente",
      admin: "panel-admin",
    };
    irAPagina(paneles[data.usuario.rol] || "panel-estudiante");
  } catch (e) {
    mostrarTostada("No se pudo completar el inicio de sesión con Google.", "error");
  }
}

// Restablece la interfaz al estado sin sesión activa
function aplicarEstadoInvitado() {
  document.body.classList.add("sin-sesion");

  sesion.activa = false;
  sesion.id = null;
  sesion.nombre = "";
  sesion.inicial = "";
  sesion.correo = "";
  sesion.rol = "";

  var barraAvatar = document.getElementById("barraAvatar");
  var barraNombre = document.getElementById("barraNombre");
  var barraRol = document.getElementById("barraRol");
  var barraEtiqueta = document.getElementById("barraEtiqueta");
  if (barraAvatar) barraAvatar.textContent = "?";
  if (barraNombre) barraNombre.textContent = "Invitado";
  if (barraRol) barraRol.textContent = "Sin sesión";
  if (barraEtiqueta) barraEtiqueta.textContent = "—";

  var lateralUsuario = document.getElementById("lateralUsuario");
  if (lateralUsuario) lateralUsuario.classList.add("oculto");

  var chipAvatar = document.getElementById("chipAvatar");
  var chipNombre = document.getElementById("chipNombre");
  if (chipAvatar) chipAvatar.textContent = "?";
  if (chipNombre) chipNombre.textContent = "Invitado";
  var bsChip = document.getElementById("bsChip");
  if (bsChip) bsChip.classList.add("oculto");

  var lateralCerrar = document.getElementById("lateralCerrar");
  if (lateralCerrar) lateralCerrar.classList.add("oculto");

  var menuAcceso = document.getElementById("menuAcceso");
  if (menuAcceso) menuAcceso.classList.remove("oculto");
  ["menuEstudiante", "menuDocente", "menuAdmin"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("oculto");
  });
}

// Cierra la sesión y limpia el almacenamiento local
function cerrarSesion() {
  authStorage.limpiarTodo();
  perfilStorage.limpiarTodo();
  academicoStorage.limpiarTodo();

  aplicarEstadoInvitado();

  irAPagina("inicio-sesion");
  mostrarTostada("Sesión cerrada", "exito");
}

// Aplica los datos de la sesión activa a la interfaz
function aplicarSesion(usuario) {
  document.body.classList.remove("sin-sesion");

  sesion.activa = true;
  sesion.id = usuario.id;
  sesion.nombre = (usuario.nombres + " " + usuario.apellidos).trim();
  sesion.inicial = (
    (usuario.nombres[0] || "") + (usuario.apellidos[0] || "")
  ).toUpperCase();
  sesion.correo = usuario.correo;
  sesion.rol = usuario.rol;

  document.getElementById("barraAvatar").textContent = sesion.inicial;
  document.getElementById("barraNombre").textContent = sesion.nombre;
  document.getElementById("chipAvatar").textContent = sesion.inicial;
  document.getElementById("chipNombre").textContent =
    sesion.nombre.split(" ")[0];

  var etiquetas = {
    estudiante: "Estudiante",
    docente: "Docente",
    admin: "Admin",
  };
  document.getElementById("barraRol").textContent =
    etiquetas[usuario.rol] || "";
  document.getElementById("barraEtiqueta").textContent =
    etiquetas[usuario.rol] || "";

  document.getElementById("menuAcceso").classList.add("oculto");
  ["menuEstudiante", "menuDocente", "menuAdmin"].forEach(function (id) {
    document.getElementById(id).classList.add("oculto");
  });

  document.getElementById("lateralUsuario").classList.remove("oculto");
  document.getElementById("lateralCerrar").classList.remove("oculto");
  var bsChip = document.getElementById("bsChip");
  if (bsChip) bsChip.classList.remove("oculto");

  var menus = {
    estudiante: "menuEstudiante",
    docente: "menuDocente",
    admin: "menuAdmin",
  };
  if (menus[usuario.rol]) {
    document.getElementById(menus[usuario.rol]).classList.remove("oculto");
  }

  cargarNotificaciones();
}

// Verifica si hay una sesión válida guardada al cargar la app
async function verificarSesionGuardada() {
  var token = authStorage.getToken();
  var sesionGuardada = authStorage.getSesion();

  if (!token || !sesionGuardada) {
    aplicarEstadoInvitado();
    return;
  }

  var ultima = authStorage.getUltimaActividad();
  var minutos = (Date.now() - ultima) / 60000;

  if (minutos > CONFIG.MINUTOS_INACTIVIDAD) {
    authStorage.limpiarTodo();
    aplicarEstadoInvitado();
    var aviso = document.getElementById("avisoSesionExpirada");
    if (aviso) aviso.style.display = "block";
    return;
  }

  try {
    var data = await llamarAPI("/auth/yo", "GET");
    aplicarSesion(data);
    authStorage.setUltimaActividad();

    var paneles = {
      estudiante: "panel-estudiante",
      docente: "panel-docente",
      admin: "panel-admin",
    };
    irAPagina(paneles[data.rol] || "panel-estudiante");
  } catch (err) {
    authStorage.limpiarTodo();
    aplicarEstadoInvitado();
  }
}

function seleccionarRolLogin(btn) {
  document
    .querySelectorAll("#selectorRolLogin .tarjeta-rol")
    .forEach(function (b) {
      b.classList.remove("seleccionada");
    });
  btn.classList.add("seleccionada");
}
