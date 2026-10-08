// Guarda el estado global de la sesión.
const sesion = {
  activa: false,
  id: null,
  nombre: "",
  inicial: "?",
  correo: "",
  rol: "",
};

// Asocia cada página con su título.
const tituloPagina = {
  "inicio-sesion": "Inicio de Sesión",
  "crear-cuenta": "Crear Cuenta",
  "completar-perfil": "Completar Perfil",
  "panel-estudiante": "Mi Panel",
  "panel-docente": "Panel Docente",
  "panel-admin": "Panel Admin",
  "programar-tutoria": "Programar Tutoría",
  "mi-perfil": "Mi Perfil",
  "mi-calendario": "Mi Calendario",
  "recuperar-contrasena": "Recuperar Contraseña",
  "admin-usuarios": "Gestión de Usuarios",
  "admin-reportes": "Reportes",
  "admin-notificaciones": "Notificaciones",
  "admin-asignacion": "Asignación Tutor",
  "admin-auditoria": "Auditoría",
  "admin-configuracion": "Configuración",
};

// Páginas que no requieren sesión iniciada
const paginasPublicas = new Set([
  "inicio-sesion",
  "crear-cuenta",
  "recuperar-contrasena",
]);

// Define qué roles pueden ver cada panel.
const rolesPorPanel = {
  "panel-estudiante": ["estudiante"],
  "panel-docente": ["docente"],
  "panel-admin": ["admin"],
  "admin-usuarios": ["admin"],
  "admin-asignacion": ["admin"],
  "admin-notificaciones": ["admin"],
  "admin-auditoria": ["admin"],
  "admin-configuracion": ["admin"],
  "admin-reportes": ["admin"],
};

const panelDeRol = {
  estudiante: "panel-estudiante",
  docente: "panel-docente",
  admin: "panel-admin",
};

function irAPagina(nombre) {
  if (!paginasPublicas.has(nombre) && !sesion.activa) {
    irAPagina("inicio-sesion");
    return;
  }

  const permitidos = rolesPorPanel[nombre];
  if (permitidos && sesion.activa && !permitidos.includes(sesion.rol)) {
    const propio = panelDeRol[sesion.rol];
    if (propio && propio !== nombre) {
      irAPagina(propio);
      return;
    }
  }

  document
    .querySelectorAll(".pagina")
    .forEach((p) => p.classList.remove("activa"));
  const pagina = document.getElementById(`pagina-${nombre}`);
  if (pagina) pagina.classList.add("activa");

  const titulo = document.getElementById("tituloPaginaActual");
  if (titulo) titulo.textContent = tituloPagina[nombre] || nombre;

  document.querySelectorAll(".lateral-item").forEach((item) => {
    item.classList.toggle("activo", item.dataset.pagina === nombre);
  });

  cerrarMenu();

  // Carga los datos si la página es un panel.
  if (nombre === "panel-estudiante") {
    cargarPanelEstudiante();
    if (typeof iniciarCalendario === "function") iniciarCalendario();
  }
  if (nombre === "panel-docente") {
    cargarPanelDocente();
    if (typeof iniciarCalendario === "function") iniciarCalendario();
  }
  if (nombre === "panel-admin") {
    cargarPanelAdmin();
    if (typeof cargarUsuariosRecientes === "function")
      cargarUsuariosRecientes();
    if (typeof cargarClasesProgramadas === "function")
      cargarClasesProgramadas();
  }
  if (nombre === "admin-usuarios" && typeof cargarTablaUsuarios === "function")
    cargarTablaUsuarios();
  if (
    nombre === "admin-asignacion" &&
    typeof cargarSelectsAsignacion === "function"
  ) {
    cargarSelectsAsignacion();
    if (typeof cargarTablaAsignaciones === "function") cargarTablaAsignaciones();
    if (typeof cargarClasesProgramadas === "function") cargarClasesProgramadas();
    // Carga las materias en el select de asesoría.
    if (typeof cargarAsignaturasEnSelect === "function")
      cargarAsignaturasEnSelect("claseAsignatura");
    // Las asesorías del admin también van desde mañana (RN06).
    const fechaEl = document.getElementById("claseFecha");
    if (fechaEl) {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      fechaEl.min = fechaLocalISO(manana);
    }
  }
  if (
    nombre === "admin-notificaciones" &&
    typeof cargarHistorialNotificaciones === "function"
  )
    cargarHistorialNotificaciones();
  if (nombre === "admin-auditoria" && typeof cargarAuditoria === "function")
    cargarAuditoria();
  if (nombre === "admin-configuracion") {
    if (typeof cargarConfiguracion === "function") cargarConfiguracion();
    if (typeof cargarPeriodos === "function") cargarPeriodos();
  }
  if (nombre === "mi-perfil") cargarMiPerfil();
  if (nombre === "mi-calendario" && typeof iniciarCalendario === "function") iniciarCalendario();
  if (nombre === "completar-perfil") mostrarFormPerfil();
  if (nombre === "programar-tutoria") {
    ponerFechaMinima();
    if (typeof prepararFormTutoria === "function") prepararFormTutoria();
    if (typeof cargarAsignaturasEnSelect === "function")
      cargarAsignaturasEnSelect("tutAsignatura");
  }

  authStorage.setUltimaActividad();

  // Desplaza la vista al inicio con animación suave.
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    window.scrollTo(0, 0);
  }
}

// Carga las métricas globales del panel admin desde el API.
async function cargarPanelAdmin() {
  try {
    var stats = await llamarAPI("/admin/estadisticas", "GET");
    var tarjetas = document.querySelectorAll(
      "#pagina-panel-admin .tarjeta-admin__numero",
    );
    if (tarjetas[0]) tarjetas[0].textContent = stats.total_usuarios || 0;
    if (tarjetas[1]) tarjetas[1].textContent = stats.total_tutorias || 0;
    if (tarjetas[2]) tarjetas[2].textContent = stats.alertas_activas || 0;
    if (tarjetas[3]) tarjetas[3].textContent = stats.total_asignaciones || 0;

    // Renderiza la acción destacada.
    renderAccion("accionAdmin", accionAdmin({
      alertas: stats.alertas_activas || 0,
      totalUsuarios: stats.total_usuarios || 0,
      totalAsignaciones: stats.total_asignaciones || 0,
    }));
  } catch (e) {
    console.warn("No se pudieron cargar métricas admin:", e);
  }
}

// Abre o cierra el menú lateral en móvil.
function alternarMenu() {
  document.getElementById("barraLateral").classList.toggle("abierta");
  document.getElementById("overlayMenu").classList.toggle("oculto");
}

function cerrarMenu() {
  document.getElementById("barraLateral").classList.remove("abierta");
  document.getElementById("overlayMenu").classList.add("oculto");
}

// Marca un campo con un mensaje de error.
function ponerError(idCampo, mensaje) {
  const errorEl = document.getElementById(
    "error" + idCampo.charAt(0).toUpperCase() + idCampo.slice(1),
  );
  if (errorEl) errorEl.textContent = mensaje;

  const campo = document.getElementById(idCampo);
  if (campo) campo.classList.add("campo--invalido");
}

function quitarError(idCampo) {
  const errorEl = document.getElementById(
    "error" + idCampo.charAt(0).toUpperCase() + idCampo.slice(1),
  );
  if (errorEl) errorEl.textContent = "";

  const campo = document.getElementById(idCampo);
  if (campo) campo.classList.remove("campo--invalido");
}

// Calcula y muestra la fortaleza de la contraseña.
function medirFortaleza(valor) {
  const wrap = document.getElementById("fortalezaWrap");
  const barra = document.getElementById("fortalezaBarra");
  const texto = document.getElementById("fortalezaTexto");

  if (!wrap) return;

  if (!valor) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "flex";

  let puntaje = 0;
  if (valor.length >= 8) puntaje++;
  if (/[A-Z]/.test(valor)) puntaje++;
  if (/[0-9]/.test(valor)) puntaje++;
  if (/[^A-Za-z0-9]/.test(valor)) puntaje++;

  const niveles = [
    { label: "Muy débil", color: "#ef4444", ancho: "20%" },
    { label: "Débil", color: "#f97316", ancho: "40%" },
    { label: "Regular", color: "#eab308", ancho: "60%" },
    { label: "Buena", color: "#22c55e", ancho: "80%" },
    { label: "Muy fuerte", color: "#16a34a", ancho: "100%" },
  ];

  const nivel = niveles[Math.min(puntaje, 4)];
  barra.style.width = nivel.ancho;
  barra.style.background = nivel.color;
  texto.textContent = nivel.label;
  texto.style.color = nivel.color;
}

// Alterna la visibilidad de la contraseña.
function alternarContrasena(idInput, boton) {
  const input = document.getElementById(idInput);
  if (!input) return;

  input.type = input.type === "password" ? "text" : "password";
  boton.title =
    input.type === "password" ? "Mostrar contraseña" : "Ocultar contraseña";
}

// Fija la fecha mínima del formulario de tutoría.
// Formatea una fecha local como AAAA-MM-DD; toISOString usa UTC y en la noche de Colombia corría el día.
function fechaLocalISO(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function ponerFechaMinima() {
  const campo = document.getElementById("tutFecha");
  if (!campo) return;

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  campo.min = fechaLocalISO(manana);
}

// Filtra la tabla de usuarios según los criterios seleccionados.
function filtrarTablaUsuarios(texto) {
  const filas = document.querySelectorAll("#cuerpoTablaUsuarios tr");
  const filtroRol =
    document.getElementById("filtroRolUsuarios")?.value.toLowerCase() || "";
  const filtroEstado =
    document.getElementById("filtroEstadoUsuarios")?.value.toLowerCase() || "";
  const busqueda = (
    texto ||
    document.getElementById("buscarUsuario")?.value ||
    ""
  ).toLowerCase();

  // Compara contra los datos de cada fila y no contra su texto: «inactivo» contiene «activo» (DEF-11).
  let visible = 0;
  filas.forEach((fila) => {
    const datos = fila.dataset;
    const contenido = (datos.busqueda || fila.textContent).toLowerCase();
    const estaActivo = datos.activo === "1";
    const enAlerta = datos.alerta === "1";
    const cumpleEstado =
      filtroEstado === "" ||
      (filtroEstado === "activo" && estaActivo) ||
      (filtroEstado === "inactivo" && !estaActivo) ||
      (filtroEstado === "alerta" && estaActivo && enAlerta);
    const mostrar =
      contenido.includes(busqueda) &&
      (filtroRol === "" || datos.rol === filtroRol) &&
      cumpleEstado;

    fila.style.display = mostrar ? "" : "none";
    if (mostrar) visible++;
  });

  const conteo = document.getElementById("conteoUsuarios");
  if (conteo) conteo.textContent = `Mostrando ${visible} usuario(s)`;
}

function confirmarAccionCritica(accion) {
  abrirModalAccionCritica(accion);
}

// Abre el modal de confirmación para acciones críticas.
function abrirModalAccionCritica(accion) {
  const existente = document.getElementById("modalAccionCritica");
  if (existente) existente.remove();

  // Define la descripción específica según la acción.
  let icono = "⚠️";
  let descripcion = "Esta acción no se puede deshacer.";
  let botonTexto = "Confirmar";
  let alCompletar = null;

  if (accion.includes("Cerrar")) {
    icono = "🔒";
    descripcion =
      "Al cerrar el período 2026-1, ningún usuario podrá crear nuevas tutorías ni modificar calificaciones. Los datos quedarán archivados en modo solo-lectura.";
    botonTexto = "Sí, cerrar período";
    alCompletar = function () {
      // Marca el período actual como cerrado visualmente.
      const periodoActivo = document.querySelector(
        "#pagina-admin-configuracion .activo-periodo",
      );
      if (periodoActivo) {
        periodoActivo.classList.remove("activo-periodo");
        const estado = periodoActivo.querySelector(".config-periodo__estado");
        if (estado) {
          estado.textContent = "○ Cerrado";
          estado.classList.add("texto-gris");
        }
      }
    };
  } else if (accion.includes("Archivar")) {
    icono = "📦";
    descripcion =
      "Se archivarán 1,247 registros de auditoría de más de 90 días de antigüedad. Podrás consultarlos posteriormente pero no aparecerán en el listado principal.";
    botonTexto = "Sí, archivar";
  } else if (accion.includes("Resetear")) {
    icono = "🔄";
    descripcion =
      "Todos los parámetros de configuración volverán a sus valores por defecto (umbral 3.0, máx. 15 estudiantes por tutor, 24h de cancelación).";
    botonTexto = "Sí, resetear";
    alCompletar = function () {
      // Restablece los inputs de configuración.
      const cfgUmbral = document.getElementById("cfgUmbral");
      const cfgMaxEst = document.getElementById("cfgMaxEst");
      const cfgCancelacion = document.getElementById("cfgCancelacion");
      const cfgSesion = document.getElementById("cfgSesion");
      if (cfgUmbral) cfgUmbral.value = "3.0";
      if (cfgMaxEst) cfgMaxEst.value = "15";
      if (cfgCancelacion) cfgCancelacion.value = "24";
      if (cfgSesion) cfgSesion.value = "120";
    };
  }

  const modal = document.createElement("div");
  modal.id = "modalAccionCritica";
  modal.className = "modal-info-overlay";
  modal.innerHTML =
    '<div class="modal-info-caja">' +
    '  <div class="modal-info-cabecera" style="background:#fff8f8;border-bottom-color:#fee2e2">' +
    '    <h3 style="color:#c0392b">' + icono + " " + accion + "</h3>" +
    '    <button class="modal-cerrar" type="button" onclick="cerrarModalAccionCritica()">✕</button>' +
    "  </div>" +
    '  <div class="modal-info-cuerpo">' +
    "    <p><strong>¿Estás seguro de que quieres continuar?</strong></p>" +
    "    <p>" + descripcion + "</p>" +
    '    <p style="color:#c0392b;font-size:12px"><strong>Esta acción es irreversible.</strong></p>' +
    "  </div>" +
    '  <div class="modal-info-pie">' +
    '    <button class="btn-secundario" type="button" onclick="cerrarModalAccionCritica()">Cancelar</button>' +
    '    <button class="btn-peligro" type="button" onclick="ejecutarAccionCritica()">' + botonTexto + "</button>" +
    "  </div>" +
    "</div>";

  document.body.appendChild(modal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) cerrarModalAccionCritica();
  });

  // Guarda el callback para ejecutarlo después.
  window._accionCriticaCallback = alCompletar;
  window._accionCriticaNombre = accion;
}

function cerrarModalAccionCritica() {
  const modal = document.getElementById("modalAccionCritica");
  if (modal) modal.remove();
}

async function ejecutarAccionCritica() {
  try {
    var nombre = window._accionCriticaNombre || "Acción";
    if (nombre.includes("Resetear")) {
      await llamarAPI("/admin/configuracion/reset", "POST", {});
      // Restablece los inputs visualmente.
      var cfgUmbral = document.getElementById("cfgUmbral");
      var cfgMaxEst = document.getElementById("cfgMaxEst");
      var cfgCancelacion = document.getElementById("cfgCancelacion");
      var cfgSesion = document.getElementById("cfgSesion");
      if (cfgUmbral) cfgUmbral.value = "3.0";
      if (cfgMaxEst) cfgMaxEst.value = "15";
      if (cfgCancelacion) cfgCancelacion.value = "24";
      if (cfgSesion) cfgSesion.value = "120";
    } else if (nombre.includes("Cerrar")) {
      // Cierra el período activo en el backend.
      if (!window._periodoActivoId) {
        mostrarTostada("No hay un período activo para cerrar", "error");
        cerrarModalAccionCritica();
        return;
      }
      await llamarAPI("/admin/periodos/" + window._periodoActivoId + "/cerrar", "PATCH");
      if (typeof cargarPeriodos === "function") cargarPeriodos();
    }
    if (window._accionCriticaCallback) window._accionCriticaCallback();
    mostrarTostada("✓ " + nombre + " completada", "exito");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al ejecutar acción", "error");
  }
  cerrarModalAccionCritica();
}

async function guardarConfig(idInput, nombre) {
  const valor = document.getElementById(idInput)?.value;
  if (valor === undefined || valor === "") {
    mostrarTostada("Ingresa un valor válido", "error");
    return;
  }

  // Mapea los IDs del input a claves de la base de datos.
  var claveMap = {
    cfgUmbral: "umbral_alerta",
    cfgMaxEst: "max_estudiantes_tutor",
    cfgCancelacion: "horas_cancelacion",
    cfgSesion: "minutos_sesion"
  };
  var clave = claveMap[idInput] || idInput;

  try {
    await llamarAPI("/admin/configuracion", "POST", { clave: clave, valor: valor });
    mostrarTostada("✓ " + nombre + " actualizado a " + valor, "exito");
    var input = document.getElementById(idInput);
    if (input) {
      input.style.borderColor = "#22c55e";
      input.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.2)";
      setTimeout(function () { input.style.borderColor = ""; input.style.boxShadow = ""; }, 1500);
    }
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al guardar", "error");
  }
}

// Genera y descarga el reporte académico como archivo de texto.
function exportarReportePDF() {
  const contenido = `
REPORTE ACADÉMICO — ConectaProfe
Universidad Católica Luis Amigó
Período: ${document.getElementById("filtroPeriodo")?.value || "2026-1"}
Generado: ${new Date().toLocaleString("es-CO")}
═══════════════════════════════════════

INDICADORES GENERALES
─────────────────────
Total tutorías:      284
Alertas activas:      47
Tasa recuperación:   83%
Estudiantes activos: 312
Docentes tutores:     24
Promedio general:    3.6

ALERTAS POR PROGRAMA
────────────────────
Ing. de Software         12 alertas (13.5%)
Administración           9 alertas  (12.2%)
Psicología               7 alertas  (11.1%)
Trabajo Social           4 alertas  (8.3%)
Derecho                  5 alertas  (13.2%)

═══════════════════════════════════════
Documento generado por ConectaProfe
  `.trim();

  descargarArchivo(
    "reporte-conectaprofe-" + new Date().toISOString().slice(0, 10) + ".txt",
    contenido,
  );
  mostrarTostada("📥 Reporte descargado", "exito");
}

// Genera y descarga el reporte como archivo CSV.
function exportarReporteExcel() {
  const csv =
    "Programa,Estudiantes,Alertas,Porcentaje,Tutorias,Recuperacion\n" +
    "Ing. de Software,89,12,13.5%,56,78%\n" +
    "Administración de Empresas,74,9,12.2%,41,82%\n" +
    "Psicología,63,7,11.1%,38,90%\n" +
    "Trabajo Social,48,4,8.3%,22,95%\n" +
    "Derecho,38,5,13.2%,29,80%\n";

  descargarArchivo(
    "reporte-conectaprofe-" + new Date().toISOString().slice(0, 10) + ".csv",
    csv,
  );
  mostrarTostada("📊 Reporte Excel descargado", "exito");
}

// Genera y descarga el log de auditoría.
function exportarLogAuditoria() {
  const ahora = new Date().toLocaleString("es-CO");
  const log =
    "LOG DE AUDITORÍA — ConectaProfe\n" +
    "Exportado: " + ahora + "\n" +
    "═══════════════════════════════════════\n\n" +
    "[10/03/2026 14:32] LOGIN_EXITOSO — lina.montoya@amigo.edu.co — 192.168.1.42\n" +
    "[10/03/2026 13:50] LOGIN_EXITOSO — carlos.martinez@amigo.edu.co — 192.168.1.87\n" +
    "[10/03/2026 12:15] LOGIN_FALLIDO — unknown@gmail.com — 201.234.56.78 (correo no institucional)\n" +
    "[10/03/2026 11:08] CAMBIO_DATOS — admin@amigo.edu.co — Usuario Valentina Osorio desactivada\n" +
    "[10/03/2026 09:15] NOTIFICACION — admin@amigo.edu.co — Alerta masiva a 47 estudiantes\n" +
    "[09/03/2026 16:40] TUTORIA_CREADA — sandra.rios@amigo.edu.co — Valentina Osorio\n" +
    "[09/03/2026 08:00] BLOQUEO_CUENTA — unknown — 5 intentos fallidos desde 45.123.67.90\n" +
    "[08/03/2026 17:30] LOGOUT — andres.rios@amigo.edu.co — Sesión cerrada manualmente\n";

  descargarArchivo(
    "log-auditoria-" + new Date().toISOString().slice(0, 10) + ".txt",
    log,
  );
  mostrarTostada("📥 Log exportado", "exito");
}

// Abre el modal para crear un nuevo período académico.
function crearNuevoPeriodo() {
  const existente = document.getElementById("modalNuevoPeriodo");
  if (existente) existente.remove();

  const modal = document.createElement("div");
  modal.id = "modalNuevoPeriodo";
  modal.className = "modal-info-overlay";
  modal.innerHTML =
    '<div class="modal-info-caja">' +
    '  <div class="modal-info-cabecera">' +
    "    <h3>📅 Nuevo Período Académico</h3>" +
    '    <button class="modal-cerrar" type="button" onclick="cerrarModalNuevoPeriodo()">✕</button>' +
    "  </div>" +
    '  <div class="modal-info-cuerpo">' +
    '    <div class="campo"><label class="campo__etiqueta">Nombre del período</label>' +
    '      <input type="text" id="npNombre" class="campo__entrada" value="2026-2" placeholder="Ej: 2026-2"/></div>' +
    '    <div class="grilla-dos">' +
    '      <div class="campo"><label class="campo__etiqueta">Fecha de inicio</label>' +
    '        <input type="date" id="npInicio" class="campo__entrada"/></div>' +
    '      <div class="campo"><label class="campo__etiqueta">Fecha de cierre</label>' +
    '        <input type="date" id="npFin" class="campo__entrada"/></div>' +
    "    </div>" +
    "  </div>" +
    '  <div class="modal-info-pie">' +
    '    <button class="btn-secundario" type="button" onclick="cerrarModalNuevoPeriodo()">Cancelar</button>' +
    '    <button class="btn-primario" type="button" onclick="guardarNuevoPeriodo()">Crear Período</button>' +
    "  </div>" +
    "</div>";

  document.body.appendChild(modal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) cerrarModalNuevoPeriodo();
  });
}

function cerrarModalNuevoPeriodo() {
  const modal = document.getElementById("modalNuevoPeriodo");
  if (modal) modal.remove();
}

async function guardarNuevoPeriodo() {
  const nombre = document.getElementById("npNombre").value.trim();
  const inicio = document.getElementById("npInicio").value;
  const fin = document.getElementById("npFin").value;

  if (!nombre) { mostrarTostada("Escribe el nombre del período", "error"); return; }
  if (!inicio || !fin) { mostrarTostada("Selecciona fechas de inicio y cierre", "error"); return; }
  if (inicio >= fin) { mostrarTostada("La fecha de cierre debe ser posterior al inicio", "error"); return; }

  try {
    await llamarAPI("/admin/periodos", "POST", { nombre: nombre, inicio: inicio, fin: fin });
    cerrarModalNuevoPeriodo();
    mostrarTostada("✓ Período " + nombre + " creado correctamente", "exito");
    // Recarga la página de configuración.
    irAPagina("admin-configuracion");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al crear período", "error");
  }
}

// Descarga un archivo de texto en el navegador.
function descargarArchivo(nombre, contenido) {
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 100);
}

// Muestra la pantalla de carga inicial.
function mostrarSplash(alTerminar) {
  const splash = document.getElementById("splash");
  const barra = document.getElementById("splashProgreso");

  barra.style.width = "0%";

  let progreso = 0;
  const intervalo = setInterval(() => {
    progreso += Math.random() * 45;
    barra.style.width = Math.min(progreso, 95) + "%";
    if (progreso >= 95) {
      clearInterval(intervalo);
      barra.style.width = "100%";
      setTimeout(() => {
        splash.classList.add("oculto");
        alTerminar?.();
      }, 120);
    }
  }, 30);
}

// Inicializa la aplicación cuando el DOM está listo.
document.addEventListener("DOMContentLoaded", () => {
  mostrarSplash(async () => {
    // Detecta si la carga viene de un callback de Google OAuth.
    if (
      window.location.search.includes("codigo=") ||
      window.location.search.includes("error=oauth")
    ) {
      await manejarCallbackGoogle();
      return;
    }

    // Carga el correo recordado en el login.
    const recordado = authStorage.getCorreoRecordado();
    if (recordado) {
      const campoCorreo = document.getElementById("loginCorreo");
      if (campoCorreo) {
        campoCorreo.value = recordado;
        document.getElementById("loginRecordar").checked = true;
      }
    }

    // Verifica si hay una sesión guardada válida.
    await verificarSesionGuardada();
  });

  // Conecta los formularios con sus manejadores.
  document
    .getElementById("formularioLogin")
    ?.addEventListener("submit", alEnviarLogin);

  document
    .getElementById("formularioRegistro")
    ?.addEventListener("submit", alEnviarRegistro);

  document
    .getElementById("formularioPerfilEstudiante")
    ?.addEventListener("submit", alEnviarPerfilEstudiante);

  document
    .getElementById("formularioPerfilDocente")
    ?.addEventListener("submit", alEnviarPerfilDocente);

  document
    .getElementById("formularioPerfilAdmin")
    ?.addEventListener("submit", alEnviarPerfilAdmin);

  document
    .getElementById("formularioTutoria")
    ?.addEventListener("submit", alEnviarTutoria);

  document
    .getElementById("formularioRecuperacion")
    ?.addEventListener("submit", alEnviarRecuperacion);

  // Revisa el vencimiento antes de renovar la marca: un clic después de 15 minutos ya no revive la sesión (DEF-01).
  ["click", "keydown", "scroll"].forEach((evento) => {
    document.addEventListener(
      evento,
      () => {
        if (!sesion.activa) return;
        if (sesionInactivaVencida()) cerrarSesionPorInactividad();
        else authStorage.setUltimaActividad();
      },
      { passive: true, capture: true },
    );
  });

  // Cierra la sesión aunque nadie toque la página, sin esperar a que recarguen.
  setInterval(() => {
    if (sesion.activa && sesionInactivaVencida()) cerrarSesionPorInactividad();
  }, 30000);

  activarValidacionBlur();
});

// Activa la validación en tiempo real al perder el foco.
function activarValidacionBlur() {
  document.querySelectorAll("input, select, textarea").forEach((campo) => {
    campo.addEventListener("blur", () => {
      const id = campo.id;
      if (!id) return;
      const valor = (campo.value || "").trim();

      quitarError(id);

      // Aplica reglas básicas según el tipo de campo.
      if (campo.required && !valor) {
        ponerError(id, "Este campo es obligatorio");
        return;
      }
      if (campo.type === "email" && valor) {
        if (
          !valor.includes("@") ||
          (typeof CONFIG !== "undefined" &&
            CONFIG.DOMINIO_CORREO &&
            !valor.endsWith(CONFIG.DOMINIO_CORREO))
        ) {
          ponerError(id, "Solo correos " + (CONFIG?.DOMINIO_CORREO || ""));
          return;
        }
      }
      if (id === "regContrasena" && valor && valor.length < 8) {
        ponerError(id, "Mínimo 8 caracteres");
        return;
      }
      if (id === "regContrasena2" && valor) {
        const orig = document.getElementById("regContrasena")?.value || "";
        if (valor !== orig) {
          ponerError(id, "Las contraseñas no coinciden");
          return;
        }
      }
      if (id === "estDocumento" && valor && !/^\d{6,11}$/.test(valor)) {
        ponerError(id, "Solo números, entre 6 y 11 dígitos");
        return;
      }
      if (id === "estTelefono" && valor && !/^\d{7,10}$/.test(valor)) {
        ponerError(id, "Entre 7 y 10 números");
        return;
      }
      if (id === "tutFecha" && valor) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const f = new Date(valor + "T00:00");
        if (f <= hoy) {
          ponerError(id, "La fecha debe ser a partir de mañana (RN06)");
          return;
        }
      }
    });
  });

  // Actualiza el indicador de avance del perfil al escribir.
  ["formularioPerfilEstudiante", "formularioPerfilDocente", "formularioPerfilAdmin"].forEach(
    (formId) => {
      const form = document.getElementById(formId);
      if (!form) return;
      form.addEventListener("input", actualizarPasoPerfil);
    },
  );
}

// Actualiza visualmente el indicador de pasos del perfil.
function actualizarPasoPerfil() {
  const paso2 = document.getElementById("perfilPaso2");
  const paso3 = document.getElementById("perfilPaso3");
  if (!paso2 || !paso3) return;

  // Detecta el formulario activo.
  const formActivo =
    document.querySelector("#perfilFormEstudiante:not(.oculto) form") ||
    document.querySelector("#perfilFormDocente:not(.oculto) form") ||
    document.querySelector("#perfilFormAdmin:not(.oculto) form");
  if (!formActivo) return;

  // Calcula el porcentaje de campos completados.
  const inputs = formActivo.querySelectorAll("input, select");
  const total = inputs.length;
  let llenos = 0;
  inputs.forEach((i) => {
    if (i.type === "checkbox") {
      if (i.checked) llenos++;
    } else if ((i.value || "").trim()) {
      llenos++;
    }
  });

  const porcentaje = total > 0 ? llenos / total : 0;

  if (porcentaje >= 0.99) {
    paso2.classList.add("perfil-paso--completado");
    paso3.classList.add("perfil-paso--activo");
  } else if (porcentaje > 0) {
    paso2.classList.add("perfil-paso--activo");
    paso2.classList.remove("perfil-paso--completado");
    paso3.classList.remove("perfil-paso--activo");
  }
}
