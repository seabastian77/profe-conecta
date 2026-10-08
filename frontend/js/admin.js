"use strict";

// Módulo de administración conectado al backend.

// Busca usuarios para el autocompletado inline.
async function buscarUsuarioAdmin(campo, rol) {
  const input = document.getElementById(campo);
  const resultsEl = document.getElementById(campo + 'Results');
  const hiddenEl = document.getElementById(campo + 'Id');
  if (!input || !resultsEl) return;

  const q = input.value.trim();

  // Resetea el ID oculto si el campo fue limpiado.
  if (q.length === 0) {
    resultsEl.innerHTML = '';
    if (hiddenEl) hiddenEl.value = '';
    if (campo === 'claseDocente') cargarMateriasDeDocente('claseAsignatura', '', '— Primero elige el docente —');
    return;
  }
  if (q.length < 2) { resultsEl.innerHTML = ''; return; }

  try {
    const lista = await llamarAPI('/admin/buscar-usuario?q=' + encodeURIComponent(q) + '&rol=' + rol, 'GET');
    if (!lista || lista.length === 0) {
      resultsEl.innerHTML = '<div class="busqueda-item"><span class="busqueda-item__nombre" style="color:#999">Sin resultados para "' + escaparHtml(q) + '"</span></div>';
      return;
    }
    resultsEl.innerHTML = lista.map(u => {
      const idSafe = u.id;
      const nomSafe = escaparHtml(u.nombre + ' · CC ' + u.cedula).replace(/'/g, '&apos;');
      return `<div class="busqueda-item" onclick="seleccionarUsuario('${campo}',${idSafe},'${nomSafe}')">
        <span class="busqueda-item__nombre">${escaparHtml(u.nombre)}</span>
        <span class="busqueda-item__detalle">Cédula: ${escaparHtml(u.cedula)} · ${escaparHtml(u.info || '')}</span>
      </div>`;
    }).join('');
  } catch(err) {
    resultsEl.innerHTML = '<div class="busqueda-item"><span style="color:#e55;font-size:12px">Error al buscar — verifica conexión</span></div>';
  }
}

function seleccionarUsuario(campo, id, nombreMostrado) {
  const input = document.getElementById(campo);
  const hidden = document.getElementById(campo + 'Id');
  const results = document.getElementById(campo + 'Results');
  if (input) input.value = nombreMostrado;
  if (hidden) hidden.value = id;
  if (results) results.innerHTML = '';
  // Al elegir el docente, la lista de materias pasa a ser la suya.
  if (campo === 'claseDocente') cargarMateriasDeDocente('claseAsignatura', id, '— Primero elige el docente —');
}

// Valida y envía la programación de una asesoría.
async function confirmarProgramarClase() {
  const docente_id  = parseInt(document.getElementById('claseDocenteId')?.value || '0');
  const estudiante_id = parseInt(document.getElementById('claseEstudianteId')?.value || '0');
  const asignaturaEl = document.getElementById('claseAsignatura');
  const asignatura = asignaturaEl ? asignaturaEl.value.trim() : '';
  const fecha      = document.getElementById('claseFecha')?.value || '';
  const hora       = document.getElementById('claseHora')?.value || '';
  const modalidad  = document.getElementById('claseModalidad')?.value || 'Virtual';
  const observaciones = document.getElementById('claseObservaciones')?.value?.trim() || '';

  // Valida los campos del formulario.
  if (!docente_id)    { mostrarTostada('⚠️ Selecciona un docente de la lista', 'error'); document.getElementById('claseDocente')?.focus(); return; }
  if (!estudiante_id) { mostrarTostada('⚠️ Selecciona un estudiante de la lista', 'error'); document.getElementById('claseEstudiante')?.focus(); return; }
  if (!asignatura)    { mostrarTostada('⚠️ Selecciona la materia', 'error'); asignaturaEl?.focus(); return; }
  if (!fecha)         { mostrarTostada('⚠️ Selecciona la fecha', 'error'); document.getElementById('claseFecha')?.focus(); return; }
  if (!hora)          { mostrarTostada('⚠️ Selecciona la hora', 'error'); document.getElementById('claseHora')?.focus(); return; }

  // Misma regla del servidor (RN06): la asesoría va desde mañana.
  if (fecha <= fechaLocalISO(new Date())) {
    mostrarTostada('⚠️ La fecha debe ser a partir de mañana (RN06)', 'error');
    return;
  }

  const btn = document.querySelector('[onclick="confirmarProgramarClase()"]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    const resp = await llamarAPI('/admin/programar-clase', 'POST', {
      docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones
    });
    mostrarTostada('✅ ' + resp.mensaje, 'exito');
    limpiarFormularioAsesoria();
    cargarClasesProgramadas();
    cargarTablaAsignaciones();
  } catch(err) {
    mostrarTostada('❌ ' + (err.mensaje || 'Error al programar la asesoría'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📅 Crear Asesoría (+)'; }
  }
}

// Limpia el formulario de asesoría.
function limpiarFormularioAsesoria() {
  ['claseDocente','claseEstudiante'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
    const r = document.getElementById(id + 'Results');
    if (r) r.innerHTML = '';
  });
  ['claseDocenteId','claseEstudianteId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  cargarMateriasDeDocente('claseAsignatura', '', '— Primero elige el docente —');
  const fecha = document.getElementById('claseFecha');
  if (fecha) fecha.value = '';
  const hora = document.getElementById('claseHora');
  if (hora) hora.value = '';
  const obs = document.getElementById('claseObservaciones');
  if (obs) obs.value = '';
}

// Carga las sesiones programadas en la tabla.
async function cargarClasesProgramadas() {
  const tbody = document.getElementById('cuerpoClasesProgramadas');
  if (!tbody) return;
  try {
    const clases = await llamarAPI('/admin/clases-programadas', 'GET');
    if (!clases || clases.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Sin sesiones programadas aún</td></tr>';
      return;
    }
    tbody.innerHTML = clases.map(c => {
      const f = c.fecha ? new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-CO', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
      return `<tr>
        <td><strong>${escaparHtml(c.asignatura || '—')}</strong></td>
        <td>${escaparHtml(c.nombre_docente || '—')}</td>
        <td>${escaparHtml(c.nombre_estudiante || '—')}</td>
        <td>${f}</td>
        <td>${escaparHtml((c.hora || '—').slice(0,5))}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Error cargando sesiones</td></tr>';
  }
}

// Alterna el estado activo o inactivo de un usuario.
async function toggleEstadoUsuario(boton) {
  if (!boton) return;
  var fila = boton.closest("tr");
  if (!fila) return;
  var userId = fila.dataset.userId;
  var insignia = fila.querySelector(".insignia");
  if (!insignia) return;
  var estaInactivo = insignia.classList.contains("insignia--inactivo");
  var nombreUsuario = (fila.querySelector("td strong") || {}).textContent || "Usuario";

  if (!estaInactivo && !confirm("¿Desactivar la cuenta de " + nombreUsuario + "?")) return;

  try {
    await llamarAPI("/admin/usuarios/" + userId + "/estado", "PATCH", { activo: estaInactivo });
    fila.dataset.activo = estaInactivo ? "1" : "0";
    if (estaInactivo) {
      insignia.className = "insignia insignia--activo";
      insignia.textContent = "● Activo";
      boton.classList.remove("btn-accion--activar");
      boton.textContent = "🔴";
      mostrarTostada(nombreUsuario + " activado", "exito");
    } else {
      insignia.className = "insignia insignia--inactivo";
      insignia.textContent = "○ Inactivo";
      boton.classList.add("btn-accion--activar");
      boton.textContent = "🟢";
      mostrarTostada(nombreUsuario + " desactivado", "alerta");
    }
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al cambiar estado", "error");
  }
}

// Reinicia y aplica una animación a un botón.
function animarBtn(btn, clase) {
  btn.classList.remove(clase);
  void btn.offsetWidth; // reflow
  btn.classList.add(clase);
  btn.addEventListener('animationend', function() { btn.classList.remove(clase); }, { once: true });
}

function animarYEditar(btn) {
  animarBtn(btn, 'btn-animar-editar');
  setTimeout(function() { abrirEditorUsuario(btn); }, 150);
}

function animarYToggle(btn) {
  animarBtn(btn, 'btn-animar-toggle');
  setTimeout(function() { toggleEstadoUsuario(btn); }, 200);
}

async function animarYEliminar(btn) {
  var id    = btn.getAttribute('data-id');
  var nombre = btn.getAttribute('data-nombre');
  animarBtn(btn, 'btn-animar-eliminar');

  // Pide confirmación antes de eliminar.
  setTimeout(async function() {
    if (!confirm('⚠️ ¿Eliminar permanentemente a ' + nombre + '?\n\nEsta acción NO se puede deshacer.')) return;

    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      var resp = await llamarAPI('/admin/usuarios/' + id, 'DELETE');
      animarBtn(btn, 'btn-animar-ok');
      mostrarTostada('🗑️ ' + (resp.mensaje || 'Usuario eliminado'), 'exito');
      // Elimina la fila con animación.
      var fila = btn.closest('tr');
      if (fila) {
        fila.style.transition = 'opacity 0.4s, transform 0.4s';
        fila.style.opacity = '0';
        fila.style.transform = 'translateX(30px)';
        setTimeout(function() { fila.remove(); }, 400);
      }
    } catch(err) {
      btn.disabled = false;
      btn.textContent = '🗑️';
      mostrarTostada('❌ ' + (err.error || err.mensaje || 'Error al eliminar'), 'error');
    }
  }, 250);
}

function abrirEditorUsuario(btn) {
  var id       = btn.getAttribute('data-id');
  var nombres  = btn.getAttribute('data-nombres');
  var apellidos = btn.getAttribute('data-apellidos');
  var correo   = btn.getAttribute('data-correo');
  var rol      = btn.getAttribute('data-rol');
  var promedio = btn.getAttribute('data-promedio');
  editarUsuario(parseInt(id), nombres, apellidos, correo, rol, promedio);
}
async function editarUsuario(id, nombres, apellidos, correo, rol, promedio) {
  var existente = document.getElementById("modalEditarUsuario");
  if (existente) existente.remove();

  var modal = document.createElement("div");
  modal.id = "modalEditarUsuario";
  modal.className = "modal-overlay";
  modal.innerHTML = '<div class="modal-caja"><div class="modal-cabecera"><h3>✏️ Editar Usuario</h3><button class="modal-cerrar" type="button" onclick="document.getElementById(\'modalEditarUsuario\').remove()">✕</button></div>' +
    '<div class="modal-cuerpo">' +
    '<div class="grilla-dos">' +
    '<div class="campo"><label class="campo__etiqueta">Nombres</label><input type="text" id="euNombres" class="campo__entrada" value="' + escaparHtml(nombres) + '"/></div>' +
    '<div class="campo"><label class="campo__etiqueta">Apellidos</label><input type="text" id="euApellidos" class="campo__entrada" value="' + escaparHtml(apellidos) + '"/></div>' +
    '</div>' +
    '<div class="campo"><label class="campo__etiqueta">Correo</label><input type="email" id="euCorreo" class="campo__entrada" value="' + escaparHtml(correo) + '"/></div>' +
    '<div class="grilla-dos">' +
    '<div class="campo"><label class="campo__etiqueta">Rol</label><div class="campo__selector-contenedor"><select id="euRol" class="campo__entrada campo__selector"><option value="estudiante"' + (rol==="estudiante"?" selected":"") + '>🎓 Estudiante</option><option value="docente"' + (rol==="docente"?" selected":"") + '>👩‍🏫 Docente</option><option value="admin"' + (rol==="admin"?" selected":"") + '>⚙️ Admin</option></select><span class="campo__flecha">▾</span></div></div>' +
    '<div class="campo"><label class="campo__etiqueta">Nueva contraseña <span style="color:#aaa;font-weight:400">(opcional)</span></label><input type="password" id="euContra" class="campo__entrada" autocomplete="new-password" placeholder="Dejar vacío para no cambiar"/></div>' +
    '</div>' +
    (rol === "estudiante"
      ? '<div class="campo"><label class="campo__etiqueta">Promedio acumulado <span style="color:#aaa;font-weight:400">(0–5, vacío si aún no tiene)</span></label><input type="number" id="euPromedio" class="campo__entrada" min="0" max="5" step="0.1" value="' + (parseFloat(promedio) > 0 ? escaparHtml(promedio) : '') + '"/></div>'
      : '') +
    '</div>' +
    '<div class="modal-pie"><button class="btn-secundario" type="button" onclick="document.getElementById(\'modalEditarUsuario\').remove()">Cancelar</button>' +
    '<button class="btn-primario" type="button" onclick="guardarEdicionUsuario(' + id + ')">💾 Guardar cambios</button></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", function(e) { if (e.target === modal) modal.remove(); });
}

async function guardarEdicionUsuario(id) {
  var datos = {
    nombres: document.getElementById("euNombres").value.trim(),
    apellidos: document.getElementById("euApellidos").value.trim(),
    correo: document.getElementById("euCorreo").value.trim(),
    rol: document.getElementById("euRol").value
  };
  var contra = document.getElementById("euContra").value.trim();
  if (contra) datos.contrasena = contra;

  // El promedio solo lo registra el admin; vacío lo deja sin registrar.
  var campoPromedio = document.getElementById("euPromedio");
  if (campoPromedio) {
    var valorPromedio = campoPromedio.value.trim();
    if (valorPromedio !== "" && (isNaN(parseFloat(valorPromedio)) || parseFloat(valorPromedio) < 0 || parseFloat(valorPromedio) > 5)) {
      mostrarTostada("El promedio debe estar entre 0 y 5", "error"); return;
    }
    datos.promedio = valorPromedio === "" ? null : parseFloat(valorPromedio);
  }

  if (!datos.nombres || !datos.apellidos || !datos.correo) {
    mostrarTostada("Todos los campos son obligatorios", "error"); return;
  }

  var btn = document.querySelector('#modalEditarUsuario .btn-primario');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    await llamarAPI("/admin/usuarios/" + id, "PUT", datos);
    document.getElementById("modalEditarUsuario").remove();
    mostrarTostada("✅ Guardado correctamente", "exito");
    // Recarga solo la tabla: recargar la página sacaba al admin de Gestión de Usuarios.
    cargarTablaUsuarios();
  } catch(err) {
    mostrarTostada("Error al guardar: " + (err.mensaje || "intenta de nuevo"), "error");
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar cambios'; }
  }
}

// Abre el modal para crear un nuevo usuario.
function abrirModalNuevoUsuario() {
  var existente = document.getElementById("modalNuevoUsuario");
  if (existente) { existente.classList.remove("oculto"); return; }
  var modal = document.createElement("div");
  modal.id = "modalNuevoUsuario";
  modal.className = "modal-overlay";
  modal.innerHTML = '<div class="modal-caja"><div class="modal-cabecera"><h3>➕ Nuevo Usuario</h3><button class="modal-cerrar" type="button" onclick="cerrarModalNuevoUsuario()">✕</button></div><div class="modal-cuerpo"><div class="grilla-dos"><div class="campo"><label class="campo__etiqueta">Nombres</label><input type="text" id="nuNombres" class="campo__entrada" placeholder="María Camila"/></div><div class="campo"><label class="campo__etiqueta">Apellidos</label><input type="text" id="nuApellidos" class="campo__entrada" placeholder="García López"/></div></div><div class="campo"><label class="campo__etiqueta">Correo institucional</label><input type="email" id="nuCorreo" class="campo__entrada" placeholder="usuario@amigo.edu.co"/></div><div class="grilla-dos"><div class="campo"><label class="campo__etiqueta">Rol</label><div class="campo__selector-contenedor"><select id="nuRol" class="campo__entrada campo__selector"><option value="">— Selecciona —</option><option value="estudiante">🎓 Estudiante</option><option value="docente">👩‍🏫 Docente</option><option value="admin">⚙️ Admin</option></select><span class="campo__flecha">▾</span></div></div><div class="campo"><label class="campo__etiqueta">Contraseña</label><input type="password" id="nuContra" class="campo__entrada" autocomplete="new-password" placeholder="Mínimo 8, con letras y números"/></div></div></div><div class="modal-pie"><button class="btn-secundario" type="button" onclick="cerrarModalNuevoUsuario()">Cancelar</button><button class="btn-primario" type="button" onclick="guardarNuevoUsuario()">Crear Usuario</button></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", function(e) { if (e.target === modal) cerrarModalNuevoUsuario(); });
}
function cerrarModalNuevoUsuario() { var m = document.getElementById("modalNuevoUsuario"); if (m) m.remove(); }

async function guardarNuevoUsuario() {
  var nombres = document.getElementById("nuNombres").value.trim();
  var apellidos = document.getElementById("nuApellidos").value.trim();
  var correo = document.getElementById("nuCorreo").value.trim();
  var rol = document.getElementById("nuRol").value;
  var contrasena = document.getElementById("nuContra").value.trim();

  if (!nombres || !apellidos) { mostrarTostada("Nombres y apellidos obligatorios", "error"); return; }
  if (!correo || correo.indexOf("@") === -1) { mostrarTostada("Correo inválido", "error"); return; }
  if (!rol) { mostrarTostada("Selecciona un rol", "error"); return; }
  // Misma regla del servidor: ya no hay una clave por defecto visible (DEF-07).
  if (contrasena.length < 8 || !/[A-Za-z]/.test(contrasena) || !/[0-9]/.test(contrasena)) {
    mostrarTostada("La contraseña debe tener mínimo 8 caracteres, con letras y números", "error"); return;
  }

  try {
    await llamarAPI("/admin/usuarios", "POST", { nombres: nombres, apellidos: apellidos, correo: correo, rol: rol, contrasena: contrasena });
    cerrarModalNuevoUsuario();
    mostrarTostada("✓ Usuario " + nombres + " creado correctamente", "exito");
    cargarTablaUsuarios();
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al crear usuario", "error");
  }
}

// Muestra el campo de programa o de usuario según el destinatario elegido.
function cambiarDestinatarioNotif() {
  var destino = (document.getElementById("notifDestinatario") || {}).value;
  var campoPrograma = document.getElementById("notifProgramaCampo");
  var campoUsuario = document.getElementById("notifUsuarioCampo");
  if (campoPrograma) campoPrograma.classList.toggle("oculto", destino !== "programa");
  if (campoUsuario) campoUsuario.classList.toggle("oculto", destino !== "usuario");
}

// Llena la lista de programas con los que tienen estudiantes (antes eran dos programas fijos).
async function cargarProgramasNotificacion() {
  var select = document.getElementById("notifPrograma");
  if (!select) return;
  try {
    var programas = await llamarAPI("/admin/programas", "GET");
    select.innerHTML = programas.length
      ? '<option value="">— Selecciona el programa —</option>' + programas.map(function(p) {
          return '<option value="' + escaparHtml(p.programa) + '">' + escaparHtml(p.programa) + ' (' + p.estudiantes + ')</option>';
        }).join("")
      : '<option value="">No hay estudiantes con programa registrado</option>';
  } catch (err) {
    select.innerHTML = '<option value="">No se pudieron cargar los programas</option>';
  }
}

// Envía la notificación solo al grupo, programa o usuario elegido.
async function enviarNotificacion() {
  var destEl = document.getElementById("notifDestinatario");
  var tipoEl = document.getElementById("notifTipo");
  var asuntoEl = document.getElementById("notifAsunto");
  var mensajeEl = document.getElementById("notifMensaje");
  if (!destEl || !tipoEl || !asuntoEl || !mensajeEl) return;

  var datos = { destinatario: destEl.value, tipo: tipoEl.value, asunto: asuntoEl.value.trim(), mensaje: mensajeEl.value.trim() };
  if (datos.destinatario === "programa") {
    datos.programa = (document.getElementById("notifPrograma") || {}).value || "";
    if (!datos.programa) { mostrarTostada("Elige el programa", "error"); return; }
  }
  if (datos.destinatario === "usuario") {
    datos.usuario_id = parseInt((document.getElementById("notifUsuarioId") || {}).value || "0");
    if (!datos.usuario_id) { mostrarTostada("Busca y elige el usuario de la lista", "error"); document.getElementById("notifUsuario")?.focus(); return; }
  }
  if (!datos.asunto) { mostrarTostada("Escribe un asunto", "error"); asuntoEl.focus(); return; }
  if (!datos.mensaje) { mostrarTostada("Escribe el mensaje", "error"); mensajeEl.focus(); return; }

  try {
    var resp = await llamarAPI("/admin/notificaciones", "POST", datos);
    asuntoEl.value = "";
    mensajeEl.value = "";
    mostrarTostada("📤 " + resp.mensaje, "exito");
    cargarHistorialNotificaciones();
    cargarNotificaciones();
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al enviar", "error");
  }
}

// Formatea una fecha guardada como texto a dd/mm/aaaa hh:mm.
function formatearFechaHora(texto) {
  var f = new Date(texto);
  if (!texto || isNaN(f)) return "—";
  return String(f.getDate()).padStart(2, "0") + "/" + String(f.getMonth() + 1).padStart(2, "0") + "/" + f.getFullYear() +
    " " + String(f.getHours()).padStart(2, "0") + ":" + String(f.getMinutes()).padStart(2, "0");
}

// Carga el historial de notificaciones desde el API.
async function cargarHistorialNotificaciones() {
  var tbody = document.getElementById("cuerpoHistorialNotificaciones");
  if (!tbody) return;
  try {
    var historial = await llamarAPI("/admin/notificaciones/historial", "GET");
    if (historial.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Sin notificaciones enviadas</td></tr>'; return; }
    tbody.innerHTML = historial.map(function(n) {
      return '<tr><td>' + formatearFechaHora(n.creada_en) + '</td><td>' + escaparHtml(n.tipo) + '</td><td>' + escaparHtml(n.destinatario) + ' (' + n.cantidad + ')</td><td>' + escaparHtml(n.asunto) + '</td><td><span class="insignia insignia--activo">✓ Enviado</span></td></tr>';
    }).join("");
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">No se pudo cargar el historial</td></tr>';
  }
}

// Crea una asignación entre estudiante y tutor.
async function crearAsignacion() {
  var selEst = document.getElementById("asigEstudiante");
  var selDoc = document.getElementById("asigDocente");
  if (!selEst || !selDoc) return;
  var estId = selEst.value;
  var docId = selDoc.value;
  if (!estId) { mostrarTostada("Selecciona un estudiante", "error"); return; }
  if (!docId) { mostrarTostada("Selecciona un tutor", "error"); return; }

  try {
    await llamarAPI("/admin/asignaciones", "POST", { estudiante_id: parseInt(estId), docente_id: parseInt(docId) });
    selEst.value = "";
    selDoc.value = "";
    mostrarTostada("🔗 Asignación creada", "exito");
    cargarTablaAsignaciones();
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al crear asignación", "error");
  }
}

// Elimina una asignación existente.
async function eliminarAsignacion(boton) {
  if (!boton) return;
  var fila = boton.closest("tr");
  if (!fila) return;
  var asigId = fila.dataset.asigId;
  var nombre = (fila.querySelector("td strong") || {}).textContent || "Estudiante";
  if (!confirm("¿Eliminar la asignación de " + nombre + "?")) return;

  try {
    await llamarAPI("/admin/asignaciones/" + asigId, "DELETE");
    fila.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    fila.style.opacity = "0";
    fila.style.transform = "translateX(20px)";
    setTimeout(function() { fila.remove(); }, 500);
    mostrarTostada("Asignación de " + nombre + " eliminada", "alerta");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al eliminar", "error");
  }
}

// Carga la tabla de usuarios desde el API.
async function cargarTablaUsuarios() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var tbody = document.getElementById("cuerpoTablaUsuarios");
    if (!tbody) return;
    if (usuarios.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="sin-datos">No hay usuarios registrados</td></tr>';
    }
    var rolLabels = { estudiante: "Estudiante", docente: "Docente", admin: "Admin" };
    if (usuarios.length) tbody.innerHTML = usuarios.map(function(u) {
      var programa = escaparHtml(u.programa || u.facultad || u.dependencia || "—");
      var estadoHTML;
      var activo = !!(u.activo && u.activo != 0);
      var enAlerta = u.rol === 'estudiante' && parseFloat(u.promedio) > 0 && parseFloat(u.promedio) < CONFIG.PROMEDIO_MINIMO;
      if (!activo) estadoHTML = '<span class="insignia insignia--inactivo">○ Inactivo</span>';
      else if (enAlerta) estadoHTML = '<span class="insignia insignia--alerta">⚠ Alerta</span>';
      else estadoHTML = '<span class="insignia insignia--activo">● Activo</span>';
      var btnToggle = (u.activo && u.activo != 0)
        ? '<button class="btn-accion btn-accion--toggle" title="Desactivar" data-id="' + u.id + '" data-activo="1" onclick="animarYToggle(this)">🔴</button>'
        : '<button class="btn-accion btn-accion--toggle btn-accion--activar" title="Activar" data-id="' + u.id + '" data-activo="0" onclick="animarYToggle(this)">🟢</button>';
      var btnEliminar = '<button class="btn-accion btn-accion--eliminar" title="Eliminar permanente" data-id="' + u.id + '" data-nombre="' + escaparHtml(u.nombres + ' ' + u.apellidos) + '" onclick="animarYEliminar(this)">🗑️</button>';
      return '<tr data-user-id="' + u.id + '" data-rol="' + escaparHtml(u.rol || '') + '" data-activo="' + (activo ? 1 : 0) + '" data-alerta="' + (enAlerta ? 1 : 0) + '" data-busqueda="' + escaparHtml((u.nombres + ' ' + u.apellidos + ' ' + u.correo).toLowerCase()) + '">' +
        '<td><strong>' + escaparHtml(u.nombres) + ' ' + escaparHtml(u.apellidos) + '</strong></td>' +
        '<td>' + escaparHtml(u.correo) + '</td>' +
        '<td>' + (rolLabels[u.rol] || escaparHtml(u.rol)) + '</td>' +
        '<td>' + programa + '</td>' +
        '<td>' + estadoHTML + '</td>' +
        '<td>' + (u.creado_en ? new Date(u.creado_en).toLocaleDateString("es-CO") : "—") + '</td>' +
        '<td class="acciones-celda">' +
          '<button class="btn-accion btn-accion--editar" title="Editar" ' +
            'data-id="' + u.id + '" ' +
            'data-nombres="' + escaparHtml(u.nombres) + '" ' +
            'data-apellidos="' + escaparHtml(u.apellidos) + '" ' +
            'data-correo="' + escaparHtml(u.correo) + '" ' +
            'data-rol="' + (u.rol||'') + '" ' +
            'data-promedio="' + (u.promedio === null || u.promedio === undefined ? '' : escaparHtml(u.promedio)) + '" ' +
            'onclick="animarYEditar(this)">✏️</button>' +
          btnToggle + btnEliminar +
        '</td></tr>';
    }).join("");
    var conteo = document.getElementById("conteoUsuarios");
    if (conteo) conteo.textContent = "Mostrando " + usuarios.length + " usuario(s)";
    filtrarTablaUsuarios();
  } catch (err) {
    console.warn("Error cargando usuarios:", err);
    mostrarTostada("⚠️ Error al recargar la tabla: " + (err.error || err.message || ""), "error");
  }
}

// Carga los usuarios recientes en el panel admin.
async function cargarUsuariosRecientes() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var tbody = document.getElementById("cuerpoUsuariosRecientes");
    if (!tbody) return;
    if (usuarios.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Aún no hay usuarios</td></tr>';
      return;
    }
    var rolLabels = { estudiante: "Estudiante", docente: "Docente", admin: "Admin" };
    tbody.innerHTML = usuarios.slice(0, 5).map(function(u) {
      var programa = escaparHtml(u.programa || u.facultad || u.dependencia || "—");
      var enAlerta = u.rol === 'estudiante' && parseFloat(u.promedio) > 0 && parseFloat(u.promedio) < CONFIG.PROMEDIO_MINIMO;
      var estadoHTML = !u.activo ? '<span class="insignia insignia--inactivo">○ Inactivo</span>' : enAlerta ? '<span class="insignia insignia--alerta">⚠ Alerta</span>' : '<span class="insignia insignia--activo">● Activo</span>';
      return '<tr><td><strong>' + escaparHtml(u.nombres) + ' ' + escaparHtml(u.apellidos) + '</strong></td><td>' + (rolLabels[u.rol] || escaparHtml(u.rol)) + '</td><td>' + programa + '</td><td>' + estadoHTML + '</td><td>' + (u.creado_en ? new Date(u.creado_en).toLocaleDateString("es-CO") : "—") + '</td></tr>';
    }).join("");
  } catch (err) { console.warn("Error:", err); }
}

// Carga los selects de estudiantes y tutores.
async function cargarSelectsAsignacion() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var selEst = document.getElementById("asigEstudiante");
    var selDoc = document.getElementById("asigDocente");
    if (selEst) {
      var ests = usuarios.filter(function(u) { return u.rol === "estudiante" && u.activo; });
      selEst.innerHTML = '<option value="">— Selecciona estudiante —</option>' + ests.map(function(e) { return '<option value="' + e.id + '">' + escaparHtml(e.nombres) + ' ' + escaparHtml(e.apellidos) + ' — ' + escaparHtml(e.programa || 'Sin programa') + '</option>'; }).join("");
    }
    if (selDoc) {
      var docs = usuarios.filter(function(u) { return u.rol === "docente" && u.activo; });
      selDoc.innerHTML = '<option value="">— Selecciona tutor —</option>' + docs.map(function(d) { return '<option value="' + d.id + '">' + escaparHtml(d.nombres) + ' ' + escaparHtml(d.apellidos) + '</option>'; }).join("");
    }
  } catch (err) { console.warn("Error:", err); }
}

// Carga la tabla de asignaciones.
async function cargarTablaAsignaciones() {
  try {
    var asignaciones = await llamarAPI("/admin/asignaciones", "GET");
    var tbody = document.getElementById("cuerpoTablaAsignaciones");
    if (!tbody) return;
    var conteo = document.getElementById("conteoAsignaciones");
    if (conteo) conteo.textContent = asignaciones.length + " activa(s)";
    if (asignaciones.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="sin-datos">Sin asignaciones activas</td></tr>';
      return;
    }
    tbody.innerHTML = asignaciones.map(function(a) {
      return '<tr data-asig-id="' + a.id + '"><td><strong>' + escaparHtml(a.nombre_estudiante) + '</strong><br><span style="font-size:11px;color:#999">' + escaparHtml(a.programa || '') + '</span></td><td>' + escaparHtml(a.nombre_docente) + '</td><td><span class="insignia insignia--alerta">Activa</span></td><td><button class="btn-accion btn-accion--eliminar" onclick="eliminarAsignacion(this)" title="Remover">🗑️</button></td></tr>';
    }).join("");
  } catch (err) { console.warn("Error cargando asignaciones:", err); }
}

// Nombre, ícono y grupo de filtro de cada evento que registra el servidor.
const EVENTOS_AUDITORIA = {
  LOGIN: { icono: "🔑", texto: "Inicio de sesión", grupo: "inicio" },
  LOGOUT: { icono: "🚪", texto: "Cierre de sesión", grupo: "cierre" },
  LOGIN_FALLIDO: { icono: "❌", texto: "Intento fallido", grupo: "fallido" },
  LOGIN_BLOQUEADO: { icono: "⛔", texto: "Cuenta bloqueada por intentos", grupo: "fallido" },
  REGISTRO: { icono: "🆕", texto: "Registro de cuenta", grupo: "registro" },
  CREAR_USUARIO: { icono: "👤", texto: "Usuario creado", grupo: "usuarios" },
  EDITAR_USUARIO: { icono: "✏️", texto: "Usuario editado", grupo: "usuarios" },
  ELIMINAR_USUARIO: { icono: "🗑️", texto: "Usuario eliminado", grupo: "usuarios" },
  ACTIVAR_USUARIO: { icono: "🟢", texto: "Usuario activado", grupo: "usuarios" },
  DESACTIVAR_USUARIO: { icono: "🔴", texto: "Usuario desactivado", grupo: "usuarios" },
  ASIGNACION_CREADA: { icono: "🔗", texto: "Asignación creada", grupo: "tutorias" },
  ASIGNACION_ELIMINADA: { icono: "🗑️", texto: "Asignación eliminada", grupo: "tutorias" },
  ASESORIA_PROGRAMADA: { icono: "📅", texto: "Asesoría programada", grupo: "tutorias" },
  NOTIFICACION: { icono: "📤", texto: "Notificación enviada", grupo: "notificacion" },
  CONFIG: { icono: "⚙️", texto: "Parámetro cambiado", grupo: "sistema" },
  CONFIG_RESET: { icono: "🔄", texto: "Configuración restaurada", grupo: "sistema" },
  PERIODO_CREADO: { icono: "📅", texto: "Período creado", grupo: "sistema" },
  PERIODO_ACTIVADO: { icono: "▶️", texto: "Período activado", grupo: "sistema" },
  PERIODO_CERRADO: { icono: "🔒", texto: "Período cerrado", grupo: "sistema" },
  AUDITORIA_ARCHIVADA: { icono: "📦", texto: "Auditoría archivada", grupo: "sistema" },
};

// Texto legible de un evento de auditoría.
function textoEvento(evento) {
  var conocido = EVENTOS_AUDITORIA[evento];
  if (conocido) return conocido.texto;
  return String(evento || "").replace(/_/g, " ").toLowerCase().replace(/^./, function(c) { return c.toUpperCase(); });
}

let _eventosAuditoria = [];

// Devuelve los eventos cargados que cumplen el tipo y la fecha elegidos.
function eventosAuditoriaFiltrados() {
  var grupo = (document.getElementById("filtroAuditTipo") || {}).value || "";
  var fecha = (document.getElementById("filtroAuditFecha") || {}).value || "";
  return _eventosAuditoria.filter(function(e) {
    var info = EVENTOS_AUDITORIA[e.evento];
    if (grupo && (!info || info.grupo !== grupo)) return false;
    if (fecha && String(e.creada_en || "").slice(0, 10) !== fecha) return false;
    return true;
  });
}

// Pinta la tabla de auditoría con los filtros; antes las opciones no coincidían con ningún evento.
function filtrarAuditoria() {
  var tbody = document.getElementById("cuerpoAuditoria");
  if (!tbody) return;
  var eventos = eventosAuditoriaFiltrados();
  if (eventos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">' + (_eventosAuditoria.length ? "Ningún evento coincide con el filtro" : "Sin eventos registrados aún") + '</td></tr>';
    return;
  }
  tbody.innerHTML = eventos.map(function(e) {
    var info = EVENTOS_AUDITORIA[e.evento];
    var bloqueado = e.evento === "LOGIN_FALLIDO" || e.evento === "LOGIN_BLOQUEADO";
    var resultado = bloqueado
      ? '<span class="insignia insignia--alerta">✗ Rechazado</span>'
      : Number(e.archivada) === 1 ? '<span class="insignia insignia--inactivo">📦 Archivado</span>' : '<span class="insignia insignia--activo">✓ Registrado</span>';
    return '<tr><td>' + formatearFechaHora(e.creada_en) + '</td><td>' + escaparHtml(e.correo_usuario || "—") + '</td><td>' + (info ? info.icono : "📝") + ' ' + escaparHtml(textoEvento(e.evento)) + '</td><td>' + escaparHtml(e.detalle || "—") + '</td><td>' + escaparHtml(e.ip || "—") + '</td><td>' + resultado + '</td></tr>';
  }).join("");
}

// Carga los eventos de auditoría (con los archivados si se marcó la casilla).
async function cargarAuditoria() {
  var tbody = document.getElementById("cuerpoAuditoria");
  try {
    var verArchivados = (document.getElementById("filtroAuditArchivados") || {}).checked;
    _eventosAuditoria = await llamarAPI("/admin/auditoria" + (verArchivados ? "?archivadas=1" : ""), "GET");
    filtrarAuditoria();
  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">No se pudo cargar la auditoría</td></tr>';
  }
}

// Carga los parámetros con las claves RN_* que usan las reglas.
async function cargarConfiguracion() {
  try {
    var cfg = await llamarAPI("/admin/configuracion", "GET");
    var poner = function(id, valor) {
      var el = document.getElementById(id);
      if (el && valor !== undefined && valor !== null) el.value = valor;
    };
    poner("cfgUmbral", Number(cfg.RN_PROMEDIO_MINIMO).toFixed(1));
    poner("cfgMaxEst", cfg.RN_MAX_ESTUDIANTES);
    poner("cfgCancelacion", cfg.RN_HORAS_CANCELACION);
    poner("cfgSesion", cfg.RN_MINUTOS_SESION);
  } catch (err) { mostrarTostada("No se pudo cargar la configuración", "error"); }
}

// Formatea AAAA-MM-DD como «03 Feb 2026».
function fechaCorta(iso) {
  var partes = String(iso || "").split("-");
  if (partes.length !== 3) return "—";
  var meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return partes[2] + " " + meses[parseInt(partes[1]) - 1] + " " + partes[0];
}

// Lista los períodos de la base, con activar para los próximos; antes se mezclaban con tres períodos fijos.
async function cargarPeriodos() {
  var contenedor = document.getElementById("listaPeriodos");
  if (!contenedor) return;
  try {
    var periodos = await llamarAPI("/admin/periodos", "GET");
    window._periodoActivo = periodos.find(function(p) { return p.estado === "activo"; }) || null;

    var botonCerrar = document.getElementById("btnCerrarPeriodo");
    if (botonCerrar) {
      botonCerrar.disabled = !window._periodoActivo;
      botonCerrar.textContent = window._periodoActivo ? "Cerrar Período " + window._periodoActivo.nombre : "Sin período activo";
    }

    if (periodos.length === 0) {
      contenedor.innerHTML = '<p class="sin-datos">Aún no hay períodos. Crea el primero.</p>';
      return;
    }
    var hayActivo = Boolean(window._periodoActivo);
    contenedor.innerHTML = periodos.map(function(p) {
      var estado = p.estado === "activo" ? "● Activo" : p.estado === "proximo" ? "○ Próximo" : "○ Cerrado";
      var accion = p.estado === "proximo"
        ? '<button type="button" class="btn-secundario config-periodo__accion" ' + (hayActivo ? 'disabled title="Cierra primero el período activo"' : '') + ' onclick="activarPeriodo(' + p.id + ')">Activar</button>'
        : "";
      return '<div class="config-periodo' + (p.estado === "activo" ? " activo-periodo" : "") + '">' +
        '<div class="config-periodo__estado ' + (p.estado === "activo" ? "" : "texto-gris") + '">' + estado + '</div>' +
        '<div class="config-periodo__nombre">Período ' + escaparHtml(p.nombre) + '</div>' +
        '<div class="config-periodo__fechas">' + fechaCorta(p.inicio) + ' — ' + fechaCorta(p.fin) + '</div>' +
        accion +
        '</div>';
    }).join("");
  } catch (err) {
    contenedor.innerHTML = '<p class="sin-datos">No se pudieron cargar los períodos</p>';
  }
}

// Activa un período próximo.
async function activarPeriodo(id) {
  try {
    var resp = await llamarAPI("/admin/periodos/" + id + "/activar", "PATCH");
    mostrarTostada("✓ " + resp.mensaje, "exito");
    cargarPeriodos();
  } catch (err) {
    mostrarTostada(err.mensaje || "No se pudo activar el período", "error");
  }
}

// Texto del período del reporte para la pantalla y las exportaciones.
function textoPeriodoReporte(r) {
  if (!r.periodo) return "Todo el histórico";
  return r.periodo.nombre + " (" + fechaCorta(r.periodo.inicio) + " — " + fechaCorta(r.periodo.fin) + ")";
}

// Carga el reporte del período elegido con datos de la base; antes todas las cifras eran fijas.
async function cargarReportes(periodo) {
  var select = document.getElementById("filtroPeriodo");
  var nota = document.getElementById("reporteNota");
  try {
    var pedido = periodo === undefined ? (select && select.dataset.cargado ? select.value : "") : periodo;
    var r = await llamarAPI("/admin/reportes" + (pedido ? "?periodo=" + encodeURIComponent(pedido) : ""), "GET");
    window._reporte = r;

    if (select) {
      select.innerHTML = r.periodos.map(function(p) {
        return '<option value="' + p.id + '">' + escaparHtml(p.nombre) + (p.estado === "activo" ? " (Actual)" : p.estado === "proximo" ? " (Próximo)" : "") + '</option>';
      }).join("") + '<option value="todos">Todo el histórico</option>';
      select.value = r.periodo ? String(r.periodo.id) : "todos";
      select.dataset.cargado = "1";
    }
    renderReporte(r);
    if (nota) {
      nota.textContent = "Período: " + textoPeriodoReporte(r) +
        ". Las tutorías se cuentan por las fechas del período; alertas y promedios muestran el estado actual.";
    }
  } catch (err) {
    if (nota) nota.textContent = err.mensaje || "No se pudo cargar el reporte";
  }
}

// Pinta las tarjetas y la tabla por programa del reporte.
function renderReporte(r) {
  var i = r.indicadores;
  var poner = function(id, texto) {
    var el = document.getElementById(id);
    if (el) el.textContent = texto;
  };
  poner("repTutorias", i.total_tutorias);
  poner("repTutoriasDetalle", i.tutorias_completadas + " completadas · " + i.tutorias_pendientes + " pendientes · " + i.tutorias_canceladas + " canceladas");
  poner("repAlertas", i.alertas_activas);
  poner("repAlertasDetalle", "Promedio menor a " + numeroCO(r.umbral, 1));
  poner("repRecuperacion", i.tasa_recuperacion === null ? "—" : i.tasa_recuperacion + "%");
  poner("repRecuperacionDetalle", i.estudiantes_recuperados + " de " + i.perfiles_estudiante + " perfiles con promedio ≥ " + numeroCO(r.umbral, 1));
  poner("repEstudiantes", i.estudiantes_activos);
  poner("repEstudiantesDetalle", i.perfiles_estudiante + " con perfil registrado");
  poner("repDocentes", i.docentes_tutores);
  poner("repPromedio", numeroCO(i.promedio_general, 2));
  poner("repPromedioDetalle", i.estudiantes_con_promedio + " estudiante(s) con promedio registrado");

  var tbody = document.getElementById("cuerpoReporteProgramas");
  if (!tbody) return;
  if (r.por_programa.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">Aún no hay estudiantes con perfil</td></tr>';
    return;
  }
  tbody.innerHTML = r.por_programa.map(function(p) {
    var clase = p.alertas > 0 ? "insignia--alerta" : "insignia--activo";
    return '<tr><td>' + escaparHtml(p.programa) + '</td><td>' + p.estudiantes + '</td><td>' + p.alertas + '</td><td><span class="insignia ' + clase + '">' + numeroCO(p.porcentaje_alerta, 1) + '%</span></td><td>' + p.tutorias_realizadas + '</td><td>' + p.recuperacion + '%</td></tr>';
  }).join("");
}
