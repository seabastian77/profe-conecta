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
  if (titulo) titulo.textContent = nombre === "mi-calendario" ? tituloCalendario().corto : tituloPagina[nombre] || nombre;

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
    // La materia sale de las que registró el docente elegido, no del catálogo completo.
    obtenerDocentesConMaterias(true)
      .catch(() => {})
      .then(() => cargarMateriasDeDocente("claseAsignatura", document.getElementById("claseDocenteId")?.value, "— Primero elige el docente —"));
    actualizarTextosReglas();
    // Las asesorías del admin también van desde mañana (RN06).
    const fechaEl = document.getElementById("claseFecha");
    if (fechaEl) {
      const manana = new Date();
      manana.setDate(manana.getDate() + 1);
      fechaEl.min = fechaLocalISO(manana);
    }
  }
  if (nombre === "admin-notificaciones") {
    cargarHistorialNotificaciones();
    cargarProgramasNotificacion();
    cambiarDestinatarioNotif();
  }
  if (nombre === "admin-reportes") cargarReportes();
  if (nombre === "admin-auditoria" && typeof cargarAuditoria === "function")
    cargarAuditoria();
  if (nombre === "admin-configuracion") {
    if (typeof cargarConfiguracion === "function") cargarConfiguracion();
    if (typeof cargarPeriodos === "function") cargarPeriodos();
  }
  if (nombre === "mi-perfil") cargarMiPerfil();
  if (nombre === "mi-calendario") {
    const textos = tituloCalendario();
    const h2 = document.getElementById("calTituloPagina");
    const sub = document.getElementById("calSubtituloPagina");
    if (h2) h2.innerHTML = textos.titulo;
    if (sub) sub.textContent = textos.subtitulo;
    if (typeof iniciarCalendario === "function") iniciarCalendario();
  }
  if (nombre === "completar-perfil") mostrarFormPerfil();
  if (nombre === "programar-tutoria") {
    ponerFechaMinima();
    actualizarTextosReglas();
    if (typeof prepararFormTutoria === "function") prepararFormTutoria();
  }

  authStorage.setUltimaActividad();

  // Desplaza la vista al inicio con animación suave.
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    window.scrollTo(0, 0);
  }
}

// Textos del calendario según el rol: el menú lo llama «Mis Tutorías» o «Todas las Tutorías».
function tituloCalendario() {
  if (sesion.rol === "admin") {
    return { corto: "Todas las Tutorías", titulo: '📅 Todas las <span class="texto-teal">Tutorías</span>', subtitulo: "Todas las sesiones del sistema; filtra por materia o estado" };
  }
  if (sesion.rol === "docente") {
    return { corto: "Mis Tutorías", titulo: '📅 Mis <span class="texto-teal">Tutorías</span>', subtitulo: "Tus sesiones del mes; marca como realizadas las que ya pasaron" };
  }
  return { corto: "Mi Calendario", titulo: '📅 Mi <span class="texto-teal">Calendario</span>', subtitulo: "Visualiza y filtra todas tus asesorías del mes" };
}

// Carga las métricas globales del panel admin; cada número va con su leyenda (antes había «∞», «RN» y cifras fijas).
async function cargarPanelAdmin() {
  try {
    var stats = await llamarAPI("/admin/estadisticas", "GET");
    var poner = function (id, valor) {
      var el = document.getElementById(id);
      if (el) el.textContent = valor;
    };
    poner("admNumUsuarios", stats.total_usuarios || 0);
    poner("admNumTutorias", stats.total_tutorias || 0);
    poner("admNumAlertas", stats.alertas_activas || 0);
    poner("admNumAsignaciones", stats.total_asignaciones || 0);
    poner("admNumEventos", stats.eventos_auditoria || 0);
    poner("admNumPeriodo", stats.periodo_activo || "—");
    poner("admLeyendaPeriodo", stats.periodo_activo ? "período activo" : "sin período activo");

    var pastilla = document.getElementById("pastillaTutoriasAdmin");
    if (pastilla) {
      pastilla.textContent = stats.tutorias_proximas || "";
      pastilla.classList.toggle("oculto", !stats.tutorias_proximas);
    }

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

// Abre el modal de confirmación con el efecto real de cada acción crítica.
function abrirModalAccionCritica(accion) {
  const existente = document.getElementById("modalAccionCritica");
  if (existente) existente.remove();

  let icono = "⚠️";
  let titulo = accion;
  let descripcion = "Esta acción no se puede deshacer.";
  let botonTexto = "Confirmar";
  let irreversible = true;

  if (accion.includes("Cerrar")) {
    const periodo = window._periodoActivo;
    if (!periodo) {
      mostrarTostada("No hay un período activo para cerrar", "error");
      return;
    }
    icono = "🔒";
    titulo = "Cerrar el período " + periodo.nombre;
    descripcion =
      "El período " + periodo.nombre + " quedará como cerrado y dejará de ser el período activo de los reportes. " +
      "Las tutorías registradas se conservan. Después puedes activar un período próximo.";
    botonTexto = "Sí, cerrar período";
  } else if (accion.includes("Archivar")) {
    icono = "📦";
    descripcion =
      "Los registros de auditoría con más de 90 días saldrán del listado principal. " +
      "No se borran: se consultan marcando «Ver archivados» en Auditoría.";
    botonTexto = "Sí, archivar";
    irreversible = false;
  } else if (accion.includes("Resetear")) {
    icono = "🔄";
    descripcion =
      "Los parámetros vuelven a sus valores por defecto: umbral 3.0, máximo 15 estudiantes por tutor, " +
      "24 horas para cancelar y 15 minutos de inactividad.";
    botonTexto = "Sí, resetear";
  }

  const modal = document.createElement("div");
  modal.id = "modalAccionCritica";
  modal.className = "modal-info-overlay";
  modal.innerHTML =
    '<div class="modal-info-caja">' +
    '  <div class="modal-info-cabecera" style="background:#fff8f8;border-bottom-color:#fee2e2">' +
    '    <h3 style="color:#c0392b">' + icono + " " + escaparHtml(titulo) + "</h3>" +
    '    <button class="modal-cerrar" type="button" onclick="cerrarModalAccionCritica()">✕</button>' +
    "  </div>" +
    '  <div class="modal-info-cuerpo">' +
    "    <p><strong>¿Estás seguro de que quieres continuar?</strong></p>" +
    "    <p>" + escaparHtml(descripcion) + "</p>" +
    (irreversible ? '    <p style="color:#c0392b;font-size:12px"><strong>Esta acción es irreversible.</strong></p>' : "") +
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

  window._accionCriticaNombre = accion;
}

function cerrarModalAccionCritica() {
  const modal = document.getElementById("modalAccionCritica");
  if (modal) modal.remove();
}

// Ejecuta la acción crítica en el servidor y muestra lo que realmente pasó.
async function ejecutarAccionCritica() {
  const nombre = window._accionCriticaNombre || "";
  const boton = document.querySelector("#modalAccionCritica .btn-peligro");
  if (boton) boton.disabled = true;
  try {
    if (nombre.includes("Resetear")) {
      await llamarAPI("/admin/configuracion/reset", "POST", {});
      await cargarConfiguracion();
      cargarReglas();
      mostrarTostada("✓ Configuración restaurada a los valores por defecto", "exito");
    } else if (nombre.includes("Cerrar")) {
      const periodo = window._periodoActivo;
      if (!periodo) throw { mensaje: "No hay un período activo para cerrar" };
      const resp = await llamarAPI("/admin/periodos/" + periodo.id + "/cerrar", "PATCH");
      await cargarPeriodos();
      mostrarTostada("✓ " + resp.mensaje, "exito");
    } else if (nombre.includes("Archivar")) {
      const resp = await llamarAPI("/admin/auditoria/archivar", "POST", {});
      mostrarTostada((resp.archivados ? "✓ " : "") + resp.mensaje, resp.archivados ? "exito" : "advertencia");
    }
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al ejecutar la acción", "error");
  }
  cerrarModalAccionCritica();
}

// Guarda un parámetro con la clave que leen las reglas (antes iba a claves que nadie usaba).
async function guardarConfig(idInput, nombre) {
  const valor = document.getElementById(idInput)?.value;
  if (valor === undefined || valor === "") {
    mostrarTostada("Ingresa un valor válido", "error");
    return;
  }

  const claveMap = {
    cfgUmbral: "RN_PROMEDIO_MINIMO",
    cfgMaxEst: "RN_MAX_ESTUDIANTES",
    cfgCancelacion: "RN_HORAS_CANCELACION",
    cfgSesion: "RN_MINUTOS_SESION",
  };

  try {
    const resp = await llamarAPI("/admin/configuracion", "POST", { clave: claveMap[idInput], valor: valor });
    mostrarTostada("✓ " + nombre + " actualizado a " + resp.valor, "exito");
    cargarReglas();
    const input = document.getElementById(idInput);
    if (input) {
      input.value = resp.valor;
      input.style.borderColor = "#22c55e";
      input.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.2)";
      setTimeout(function () { input.style.borderColor = ""; input.style.boxShadow = ""; }, 1500);
    }
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al guardar", "error");
  }
}

// Formatea un número con coma decimal, como se escribe en Colombia.
function numeroCO(valor, decimales) {
  if (valor === null || valor === undefined || isNaN(valor)) return "—";
  return Number(valor).toFixed(decimales).replace(".", ",");
}

// Abre la impresión del reporte real para guardarlo como PDF (antes descargaba un .txt con cifras inventadas).
function exportarReportePDF() {
  const r = window._reporte;
  if (!r) {
    mostrarTostada("Espera a que cargue el reporte", "error");
    return;
  }
  const i = r.indicadores;
  const filas = r.por_programa.map((p) =>
    "<tr><td>" + escaparHtml(p.programa) + "</td><td>" + p.estudiantes + "</td><td>" + p.alertas + "</td><td>" +
    numeroCO(p.porcentaje_alerta, 1) + "%</td><td>" + p.tutorias_realizadas + "</td><td>" + p.recuperacion + "%</td></tr>"
  ).join("");

  const zona = document.createElement("div");
  zona.className = "zona-impresion";
  zona.innerHTML =
    "<h1>Reporte académico — ConectaProfe</h1>" +
    "<p>Universidad Católica Luis Amigó</p>" +
    "<p><strong>Período:</strong> " + escaparHtml(textoPeriodoReporte(r)) + "</p>" +
    "<p><strong>Generado:</strong> " + new Date().toLocaleString("es-CO") + "</p>" +
    "<h2>Indicadores</h2>" +
    "<table><tbody>" +
    "<tr><th>Tutorías programadas</th><td>" + i.total_tutorias + " (completadas " + i.tutorias_completadas + ", pendientes " + i.tutorias_pendientes + ", canceladas " + i.tutorias_canceladas + ")</td></tr>" +
    "<tr><th>Alertas activas (promedio menor a " + numeroCO(r.umbral, 1) + ")</th><td>" + i.alertas_activas + "</td></tr>" +
    "<tr><th>Tasa de recuperación (RF024)</th><td>" + (i.tasa_recuperacion === null ? "—" : i.tasa_recuperacion + "%") + " — " + i.estudiantes_recuperados + " de " + i.perfiles_estudiante + " perfiles</td></tr>" +
    "<tr><th>Estudiantes activos</th><td>" + i.estudiantes_activos + "</td></tr>" +
    "<tr><th>Docentes tutores</th><td>" + i.docentes_tutores + "</td></tr>" +
    "<tr><th>Promedio general</th><td>" + numeroCO(i.promedio_general, 2) + " (" + i.estudiantes_con_promedio + " con promedio registrado)</td></tr>" +
    "</tbody></table>" +
    "<h2>Alertas por programa académico</h2>" +
    "<table><thead><tr><th>Programa</th><th>Estudiantes</th><th>Alertas</th><th>% Alerta</th><th>Tutorías realizadas</th><th>Recuperación</th></tr></thead>" +
    "<tbody>" + (filas || '<tr><td colspan="6">Sin estudiantes con perfil</td></tr>') + "</tbody></table>" +
    "<p style=\"margin-top:12px;color:#555\">Las tutorías se cuentan por las fechas del período. Alertas y promedios muestran el estado actual.</p>";

  document.body.appendChild(zona);
  document.body.classList.add("imprimiendo-reporte");
  const limpiar = function () {
    document.body.classList.remove("imprimiendo-reporte");
    zona.remove();
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  mostrarTostada("Se abrió la impresión: elige «Guardar como PDF»", "exito");
  setTimeout(function () {
    window.print();
    // Algunos navegadores no avisan el final de la impresión: limpia de todos modos.
    setTimeout(limpiar, 1000);
  }, 50);
}

// Arma un CSV con punto y coma y BOM para que Excel en español lo abra con tildes y columnas.
function armarCSV(filas) {
  const celda = (v) => {
    const texto = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
  };
  return "\uFEFF" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
}

// Descarga el reporte real como CSV para Excel (antes eran filas fijas).
function exportarReporteExcel() {
  const r = window._reporte;
  if (!r) {
    mostrarTostada("Espera a que cargue el reporte", "error");
    return;
  }
  const i = r.indicadores;
  const filas = [
    ["Reporte académico ConectaProfe"],
    ["Período", textoPeriodoReporte(r)],
    ["Generado", new Date().toLocaleString("es-CO")],
    [],
    ["Indicador", "Valor"],
    ["Tutorías programadas", i.total_tutorias],
    ["Tutorías completadas", i.tutorias_completadas],
    ["Tutorías pendientes", i.tutorias_pendientes],
    ["Tutorías canceladas", i.tutorias_canceladas],
    ["Alertas activas", i.alertas_activas],
    ["Tasa de recuperación (%)", i.tasa_recuperacion === null ? "" : i.tasa_recuperacion],
    ["Estudiantes activos", i.estudiantes_activos],
    ["Docentes tutores", i.docentes_tutores],
    ["Promedio general", numeroCO(i.promedio_general, 2)],
    [],
    ["Programa", "Estudiantes", "Alertas", "% Alerta", "Tutorías realizadas", "Recuperación (%)"],
  ].concat(r.por_programa.map((p) => [p.programa, p.estudiantes, p.alertas, numeroCO(p.porcentaje_alerta, 1), p.tutorias_realizadas, p.recuperacion]));

  descargarArchivo("reporte-conectaprofe-" + fechaLocalISO(new Date()) + ".csv", armarCSV(filas), "text/csv;charset=utf-8");
  mostrarTostada("📊 Reporte descargado (abre en Excel)", "exito");
}

// Descarga los eventos de auditoría que se están viendo, con los filtros aplicados.
function exportarLogAuditoria() {
  const eventos = typeof eventosAuditoriaFiltrados === "function" ? eventosAuditoriaFiltrados() : [];
  if (!eventos.length) {
    mostrarTostada("No hay eventos para exportar con esos filtros", "error");
    return;
  }
  const filas = [["Fecha y hora", "Usuario", "Evento", "Detalle", "IP"]].concat(
    eventos.map((e) => [formatearFechaHora(e.creada_en), e.correo_usuario || "—", textoEvento(e.evento), e.detalle || "", e.ip || ""])
  );
  descargarArchivo("log-auditoria-" + fechaLocalISO(new Date()) + ".csv", armarCSV(filas), "text/csv;charset=utf-8");
  mostrarTostada("📥 Log exportado (" + eventos.length + " eventos)", "exito");
}

// Sugiere el nombre del siguiente período según la fecha de hoy.
function siguientePeriodoSugerido() {
  const hoy = new Date();
  return hoy.getMonth() < 6 ? hoy.getFullYear() + "-2" : hoy.getFullYear() + 1 + "-1";
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
    '    <div class="campo"><label class="campo__etiqueta" for="npNombre">Nombre del período</label>' +
    '      <input type="text" id="npNombre" class="campo__entrada" maxlength="40" value="' + siguientePeriodoSugerido() + '" placeholder="Ej: 2027-1"/></div>' +
    '    <div class="grilla-dos">' +
    '      <div class="campo"><label class="campo__etiqueta" for="npInicio">Fecha de inicio</label>' +
    '        <input type="date" id="npInicio" class="campo__entrada"/></div>' +
    '      <div class="campo"><label class="campo__etiqueta" for="npFin">Fecha de cierre</label>' +
    '        <input type="date" id="npFin" class="campo__entrada"/></div>' +
    "    </div>" +
    '    <p style="font-size:12px;color:#777;margin-top:8px">Se crea como «Próximo». Lo activas cuando cierres el período actual.</p>' +
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
    cargarPeriodos();
  } catch (err) {
    // El modal sigue abierto para corregir; antes quedaba encima y bloqueaba la página.
    mostrarTostada(err.mensaje || "Error al crear período", "error");
  }
}

// Descarga un archivo de texto en el navegador.
function descargarArchivo(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo || "text/plain;charset=utf-8" });
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

  // Trae notificaciones nuevas cada 2 minutos y al volver a la pestaña; antes solo llegaban al iniciar sesión.
  setInterval(() => {
    if (sesion.activa && !document.hidden) cargarNotificaciones();
  }, 120000);
  document.addEventListener("visibilitychange", () => {
    if (sesion.activa && !document.hidden) cargarNotificaciones();
  });

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
