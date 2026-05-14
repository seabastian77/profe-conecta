"use strict";

// ═══════════════════════════════════════════════════════════
// js/admin.js — Módulo Admin (100% conectado al backend)
// ═══════════════════════════════════════════════════════════

// ── BUSCAR USUARIO (autocomplete inline) ─────────────────
async function buscarUsuarioAdmin(campo, rol) {
  const input = document.getElementById(campo);
  const resultsEl = document.getElementById(campo + 'Results');
  const hiddenEl = document.getElementById(campo + 'Id');
  if (!input || !resultsEl) return;

  const q = input.value.trim();

  // Si el campo fue limpiado, resetear ID oculto
  if (q.length === 0) {
    resultsEl.innerHTML = '';
    if (hiddenEl) hiddenEl.value = '';
    return;
  }
  if (q.length < 2) { resultsEl.innerHTML = ''; return; }

  try {
    const lista = await llamarAPI('/admin/buscar-usuario?q=' + encodeURIComponent(q) + '&rol=' + rol, 'GET');
    if (!lista || lista.length === 0) {
      resultsEl.innerHTML = '<div class="busqueda-item"><span class="busqueda-item__nombre" style="color:#999">Sin resultados para "' + q + '"</span></div>';
      return;
    }
    resultsEl.innerHTML = lista.map(u => {
      const idSafe = u.id;
      const nomSafe = (u.nombre + ' · CC ' + u.cedula).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      return `<div class="busqueda-item" onclick="seleccionarUsuario('${campo}',${idSafe},'${nomSafe}')">
        <span class="busqueda-item__nombre">${u.nombre}</span>
        <span class="busqueda-item__detalle">Cédula: ${u.cedula} · ${u.info || ''}</span>
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
}

// ── CONFIRMAR PROGRAMAR ASESORÍA ─────────────────────────
async function confirmarProgramarClase() {
  const docente_id  = parseInt(document.getElementById('claseDocenteId')?.value || '0');
  const estudiante_id = parseInt(document.getElementById('claseEstudianteId')?.value || '0');
  const asignaturaEl = document.getElementById('claseAsignatura');
  const asignatura = asignaturaEl ? asignaturaEl.value.trim() : '';
  const fecha      = document.getElementById('claseFecha')?.value || '';
  const hora       = document.getElementById('claseHora')?.value || '';
  const modalidad  = document.getElementById('claseModalidad')?.value || 'Virtual';
  const observaciones = document.getElementById('claseObservaciones')?.value?.trim() || '';

  // Validaciones claras
  if (!docente_id)    { mostrarTostada('⚠️ Selecciona un docente de la lista', 'error'); document.getElementById('claseDocente')?.focus(); return; }
  if (!estudiante_id) { mostrarTostada('⚠️ Selecciona un estudiante de la lista', 'error'); document.getElementById('claseEstudiante')?.focus(); return; }
  if (!asignatura)    { mostrarTostada('⚠️ Selecciona la materia', 'error'); asignaturaEl?.focus(); return; }
  if (!fecha)         { mostrarTostada('⚠️ Selecciona la fecha', 'error'); document.getElementById('claseFecha')?.focus(); return; }
  if (!hora)          { mostrarTostada('⚠️ Selecciona la hora', 'error'); document.getElementById('claseHora')?.focus(); return; }

  // Validar que la fecha no sea pasada
  if (new Date(fecha + 'T' + hora) < new Date()) {
    mostrarTostada('⚠️ La fecha y hora no pueden ser en el pasado', 'error');
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

// ── LIMPIAR FORMULARIO DE ASESORÍA ───────────────────────
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
  const asig = document.getElementById('claseAsignatura');
  if (asig) asig.selectedIndex = 0;
  const fecha = document.getElementById('claseFecha');
  if (fecha) fecha.value = '';
  const hora = document.getElementById('claseHora');
  if (hora) hora.value = '';
  const obs = document.getElementById('claseObservaciones');
  if (obs) obs.value = '';
}

// ── CARGAR SESIONES PROGRAMADAS ───────────────────────────
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
        <td><strong>${c.asignatura || '—'}</strong></td>
        <td>${c.nombre_docente || '—'}</td>
        <td>${c.nombre_estudiante || '—'}</td>
        <td>${f}</td>
        <td>${(c.hora || '—').slice(0,5)}</td>
      </tr>`;
    }).join('');
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Error cargando sesiones</td></tr>';
  }
}

// ── MODAL NUEVO USUARIO ─────────────────────────────────
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

// ── RF057 — EDITAR USUARIO ──────────────────────────────
// ── EDITAR USUARIO ───────────────────────────────────────

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

  // Confirmación visual antes de eliminar
  setTimeout(async function() {
    if (!confirm('⚠️ ¿Eliminar permanentemente a ' + nombre + '?\n\nEsta acción NO se puede deshacer.')) return;

    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      var resp = await llamarAPI('/admin/usuarios/' + id, 'DELETE');
      animarBtn(btn, 'btn-animar-ok');
      mostrarTostada('🗑️ ' + (resp.mensaje || 'Usuario eliminado'), 'exito');
      // Eliminar la fila con animación
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
  editarUsuario(parseInt(id), nombres, apellidos, correo, rol);
}
async function editarUsuario(id, nombres, apellidos, correo, rol) {
  var existente = document.getElementById("modalEditarUsuario");
  if (existente) existente.remove();

  var modal = document.createElement("div");
  modal.id = "modalEditarUsuario";
  modal.className = "modal-overlay";
  modal.innerHTML = '<div class="modal-caja"><div class="modal-cabecera"><h3>✏️ Editar Usuario</h3><button class="modal-cerrar" type="button" onclick="document.getElementById(\'modalEditarUsuario\').remove()">✕</button></div>' +
    '<div class="modal-cuerpo">' +
    '<div class="grilla-dos">' +
    '<div class="campo"><label class="campo__etiqueta">Nombres</label><input type="text" id="euNombres" class="campo__entrada" value="' + nombres + '"/></div>' +
    '<div class="campo"><label class="campo__etiqueta">Apellidos</label><input type="text" id="euApellidos" class="campo__entrada" value="' + apellidos + '"/></div>' +
    '</div>' +
    '<div class="campo"><label class="campo__etiqueta">Correo</label><input type="email" id="euCorreo" class="campo__entrada" value="' + correo + '"/></div>' +
    '<div class="grilla-dos">' +
    '<div class="campo"><label class="campo__etiqueta">Rol</label><div class="campo__selector-contenedor"><select id="euRol" class="campo__entrada campo__selector"><option value="estudiante"' + (rol==="estudiante"?" selected":"") + '>🎓 Estudiante</option><option value="docente"' + (rol==="docente"?" selected":"") + '>👩‍🏫 Docente</option><option value="admin"' + (rol==="admin"?" selected":"") + '>⚙️ Admin</option></select><span class="campo__flecha">▾</span></div></div>' +
    '<div class="campo"><label class="campo__etiqueta">Nueva contraseña <span style="color:#aaa;font-weight:400">(opcional)</span></label><input type="text" id="euContra" class="campo__entrada" placeholder="Dejar vacío para no cambiar"/></div>' +
    '</div></div>' +
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

  if (!datos.nombres || !datos.apellidos || !datos.correo) {
    mostrarTostada("Todos los campos son obligatorios", "error"); return;
  }

  var btn = document.querySelector('#modalEditarUsuario .btn-primario');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Guardando...'; }

  try {
    var resp = await llamarAPI("/admin/usuarios/" + id, "PUT", datos);
    document.getElementById("modalEditarUsuario").remove();
    mostrarTostada("✅ Guardado correctamente", "exito");
    // Recarga completa para garantizar datos frescos
    setTimeout(function() { window.location.reload(); }, 1200);
  } catch(err) {
    var msg = err.error || err.mensaje || err.message || JSON.stringify(err);
    alert("Error al guardar: " + msg);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar cambios'; }
  }
}

// ── MODAL NUEVO USUARIO ─────────────────────────────────
function abrirModalNuevoUsuario() {
  var existente = document.getElementById("modalNuevoUsuario");
  if (existente) { existente.classList.remove("oculto"); return; }
  var modal = document.createElement("div");
  modal.id = "modalNuevoUsuario";
  modal.className = "modal-overlay";
  modal.innerHTML = '<div class="modal-caja"><div class="modal-cabecera"><h3>➕ Nuevo Usuario</h3><button class="modal-cerrar" type="button" onclick="cerrarModalNuevoUsuario()">✕</button></div><div class="modal-cuerpo"><div class="grilla-dos"><div class="campo"><label class="campo__etiqueta">Nombres</label><input type="text" id="nuNombres" class="campo__entrada" placeholder="María Camila"/></div><div class="campo"><label class="campo__etiqueta">Apellidos</label><input type="text" id="nuApellidos" class="campo__entrada" placeholder="García López"/></div></div><div class="campo"><label class="campo__etiqueta">Correo institucional</label><input type="email" id="nuCorreo" class="campo__entrada" placeholder="usuario@amigo.edu.co"/></div><div class="grilla-dos"><div class="campo"><label class="campo__etiqueta">Rol</label><div class="campo__selector-contenedor"><select id="nuRol" class="campo__entrada campo__selector"><option value="">— Selecciona —</option><option value="estudiante">🎓 Estudiante</option><option value="docente">👩‍🏫 Docente</option><option value="admin">⚙️ Admin</option></select><span class="campo__flecha">▾</span></div></div><div class="campo"><label class="campo__etiqueta">Contraseña</label><input type="text" id="nuContra" class="campo__entrada" value="Cambiar123"/></div></div></div><div class="modal-pie"><button class="btn-secundario" type="button" onclick="cerrarModalNuevoUsuario()">Cancelar</button><button class="btn-primario" type="button" onclick="guardarNuevoUsuario()">Crear Usuario</button></div></div>';
  document.body.appendChild(modal);
  modal.addEventListener("click", function(e) { if (e.target === modal) cerrarModalNuevoUsuario(); });
}
function cerrarModalNuevoUsuario() { var m = document.getElementById("modalNuevoUsuario"); if (m) m.remove(); }

async function guardarNuevoUsuario() {
  var nombres = document.getElementById("nuNombres").value.trim();
  var apellidos = document.getElementById("nuApellidos").value.trim();
  var correo = document.getElementById("nuCorreo").value.trim();
  var rol = document.getElementById("nuRol").value;
  var contrasena = document.getElementById("nuContra").value.trim() || "Cambiar123";

  if (!nombres || !apellidos) { mostrarTostada("Nombres y apellidos obligatorios", "error"); return; }
  if (!correo || correo.indexOf("@") === -1) { mostrarTostada("Correo inválido", "error"); return; }
  if (!rol) { mostrarTostada("Selecciona un rol", "error"); return; }

  try {
    await llamarAPI("/admin/usuarios", "POST", { nombres: nombres, apellidos: apellidos, correo: correo, rol: rol, contrasena: contrasena });
    cerrarModalNuevoUsuario();
    mostrarTostada("✓ Usuario " + nombres + " creado correctamente", "exito");
    cargarTablaUsuarios(); // Recargar tabla con datos frescos
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al crear usuario", "error");
  }
}

// ── RF051 + RF052 — ENVIAR NOTIFICACIÓN ─────────────────
async function enviarNotificacion() {
  var destEl = document.getElementById("notifDestinatario");
  var tipoEl = document.getElementById("notifTipo");
  var asuntoEl = document.getElementById("notifAsunto");
  var mensajeEl = document.getElementById("notifMensaje");
  if (!destEl || !tipoEl || !asuntoEl || !mensajeEl) return;

  var asunto = asuntoEl.value.trim();
  var mensaje = mensajeEl.value.trim();
  if (!asunto) { mostrarTostada("Escribe un asunto", "error"); asuntoEl.focus(); return; }
  if (!mensaje) { mostrarTostada("Escribe el mensaje", "error"); mensajeEl.focus(); return; }

  try {
    var resp = await llamarAPI("/admin/notificaciones", "POST", {
      destinatario: destEl.value,
      tipo: tipoEl.value,
      asunto: asunto,
      mensaje: mensaje
    });
    asuntoEl.value = "";
    mensajeEl.value = "";
    mostrarTostada("📤 " + resp.mensaje, "exito");
    cargarHistorialNotificaciones(); // Recargar historial
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al enviar", "error");
  }
}

// ── Cargar historial de notificaciones desde el API ──────
async function cargarHistorialNotificaciones() {
  try {
    var historial = await llamarAPI("/admin/notificaciones/historial", "GET");
    var tbody = document.querySelector("#pagina-admin-notificaciones .tabla-datos tbody");
    if (!tbody) return;
    if (historial.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="sin-datos">Sin notificaciones enviadas</td></tr>'; return; }
    tbody.innerHTML = historial.map(function(n) {
      var f = new Date(n.creada_en);
      var fecha = String(f.getDate()).padStart(2,"0") + "/" + String(f.getMonth()+1).padStart(2,"0") + "/" + f.getFullYear() + " " + String(f.getHours()).padStart(2,"0") + ":" + String(f.getMinutes()).padStart(2,"0");
      return '<tr><td>' + fecha + '</td><td>' + n.tipo + '</td><td>' + n.destinatario + ' (' + n.cantidad + ')</td><td>' + n.asunto + '</td><td><span class="insignia insignia--activo">✓ Enviado</span></td></tr>';
    }).join("");
  } catch (err) { console.warn("Error cargando historial:", err); }
}

// ── RF053 — CREAR ASIGNACIÓN ────────────────────────────
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
    cargarTablaAsignaciones(); // Recargar
  } catch (err) {
    mostrarTostada(err.mensaje || "Error al crear asignación", "error");
  }
}

// ── RF054 — ELIMINAR ASIGNACIÓN ─────────────────────────
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

// ── CARGAR TABLA USUARIOS DESDE API ─────────────────────
async function cargarTablaUsuarios() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var tbody = document.getElementById("cuerpoTablaUsuarios");
    if (!tbody) return;
    var rolLabels = { estudiante: "Estudiante", docente: "Docente", admin: "Admin" };
    tbody.innerHTML = usuarios.map(function(u) {
      var programa = u.programa || u.facultad || u.dependencia || "—";
      var estadoHTML;
      if (!u.activo || u.activo == 0) estadoHTML = '<span class="insignia insignia--inactivo">○ Inactivo</span>';
      else if (parseFloat(u.promedio) < 3.0 && u.promedio) estadoHTML = '<span class="insignia insignia--alerta">⚠ Alerta</span>';
      else estadoHTML = '<span class="insignia insignia--activo">● Activo</span>';
      var btnToggle = (u.activo && u.activo != 0)
        ? '<button class="btn-accion btn-accion--toggle" title="Desactivar" data-id="' + u.id + '" data-activo="1" onclick="animarYToggle(this)">🔴</button>'
        : '<button class="btn-accion btn-accion--toggle btn-accion--activar" title="Activar" data-id="' + u.id + '" data-activo="0" onclick="animarYToggle(this)">🟢</button>';
      var btnEliminar = '<button class="btn-accion btn-accion--eliminar" title="Eliminar permanente" data-id="' + u.id + '" data-nombre="' + (u.nombres + ' ' + u.apellidos).replace(/"/g,"&quot;") + '" onclick="animarYEliminar(this)">🗑️</button>';
      return '<tr data-user-id="' + u.id + '">' +
        '<td><strong>' + u.nombres + ' ' + u.apellidos + '</strong></td>' +
        '<td>' + u.correo + '</td>' +
        '<td>' + (rolLabels[u.rol] || u.rol) + '</td>' +
        '<td>' + programa + '</td>' +
        '<td>' + estadoHTML + '</td>' +
        '<td>' + (u.creado_en ? new Date(u.creado_en).toLocaleDateString("es-CO") : "—") + '</td>' +
        '<td class="acciones-celda">' +
          '<button class="btn-accion btn-accion--editar" title="Editar" ' +
            'data-id="' + u.id + '" ' +
            'data-nombres="' + (u.nombres||'').replace(/"/g,'&quot;') + '" ' +
            'data-apellidos="' + (u.apellidos||'').replace(/"/g,'&quot;') + '" ' +
            'data-correo="' + (u.correo||'').replace(/"/g,'&quot;') + '" ' +
            'data-rol="' + (u.rol||'') + '" ' +
            'onclick="animarYEditar(this)">✏️</button>' +
          btnToggle + btnEliminar +
        '</td></tr>';
    }).join("");
    var conteo = document.getElementById("conteoUsuarios");
    if (conteo) conteo.textContent = "Mostrando " + usuarios.length + " usuario(s)";
  } catch (err) {
    console.warn("Error cargando usuarios:", err);
    mostrarTostada("⚠️ Error al recargar la tabla: " + (err.error || err.message || ""), "error");
  }
}

// ── CARGAR USUARIOS RECIENTES (panel admin) ─────────────
async function cargarUsuariosRecientes() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var tbody = document.querySelector("#pagina-panel-admin .tabla-datos tbody");
    if (!tbody || usuarios.length === 0) return;
    var rolLabels = { estudiante: "Estudiante", docente: "Docente", admin: "Admin" };
    tbody.innerHTML = usuarios.slice(0, 5).map(function(u) {
      var programa = u.programa || u.facultad || u.dependencia || "—";
      var estadoHTML = !u.activo ? '<span class="insignia insignia--inactivo">○ Inactivo</span>' : u.en_alerta ? '<span class="insignia insignia--alerta">⚠ Alerta</span>' : '<span class="insignia insignia--activo">● Activo</span>';
      return '<tr><td><strong>' + u.nombres + ' ' + u.apellidos + '</strong></td><td>' + (rolLabels[u.rol] || u.rol) + '</td><td>' + programa + '</td><td>' + estadoHTML + '</td><td>' + (u.creado_en ? new Date(u.creado_en).toLocaleDateString("es-CO") : "—") + '</td></tr>';
    }).join("");
  } catch (err) { console.warn("Error:", err); }
}

// ── CARGAR SELECTS DE ASIGNACIÓN ────────────────────────
async function cargarSelectsAsignacion() {
  try {
    var usuarios = await llamarAPI("/admin/usuarios", "GET");
    var selEst = document.getElementById("asigEstudiante");
    var selDoc = document.getElementById("asigDocente");
    if (selEst) {
      var ests = usuarios.filter(function(u) { return u.rol === "estudiante" && u.activo; });
      selEst.innerHTML = '<option value="">— Selecciona estudiante —</option>' + ests.map(function(e) { return '<option value="' + e.id + '">' + e.nombres + ' ' + e.apellidos + ' — ' + (e.programa || 'Sin programa') + '</option>'; }).join("");
    }
    if (selDoc) {
      var docs = usuarios.filter(function(u) { return u.rol === "docente" && u.activo; });
      selDoc.innerHTML = '<option value="">— Selecciona tutor —</option>' + docs.map(function(d) { return '<option value="' + d.id + '">' + d.nombres + ' ' + d.apellidos + '</option>'; }).join("");
    }
  } catch (err) { console.warn("Error:", err); }
}

// ── CARGAR TABLA DE ASIGNACIONES ────────────────────────
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
      return '<tr data-asig-id="' + a.id + '"><td><strong>' + a.nombre_estudiante + '</strong><br><span style="font-size:11px;color:#999">' + (a.programa || '') + '</span></td><td>' + a.nombre_docente + '</td><td><span class="insignia insignia--alerta">Activa</span></td><td><button class="btn-accion btn-accion--eliminar" onclick="eliminarAsignacion(this)" title="Remover">🗑️</button></td></tr>';
    }).join("");
  } catch (err) { console.warn("Error cargando asignaciones:", err); }
}

// ── FILTRAR AUDITORÍA ───────────────────────────────────
function filtrarAuditoria() {
  var tipoFiltro = (document.getElementById("filtroAuditTipo") || {}).value || "";
  var fechaFiltro = (document.getElementById("filtroAuditFecha") || {}).value || "";
  var filas = document.querySelectorAll("#pagina-admin-auditoria .tabla-datos tbody tr");
  var visibles = 0;
  filas.forEach(function(fila) {
    var contenido = fila.textContent.toLowerCase();
    var mostrar = true;
    if (tipoFiltro && !contenido.includes(tipoFiltro.toLowerCase())) mostrar = false;
    if (fechaFiltro) {
      var partes = fechaFiltro.split("-");
      if (!contenido.includes(partes[2] + "/" + partes[1] + "/" + partes[0])) mostrar = false;
    }
    fila.style.display = mostrar ? "" : "none";
    if (mostrar) visibles++;
  });
}

// ── CARGAR AUDITORÍA DESDE EL API ───────────────────────
async function cargarAuditoria() {
  try {
    var eventos = await llamarAPI("/admin/auditoria", "GET");
    var tbody = document.querySelector("#pagina-admin-auditoria .tabla-datos tbody");
    if (!tbody) return;
    if (eventos.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="sin-datos">Sin eventos registrados aún</td></tr>';
      return;
    }
    // Mapear eventos a iconos
    var iconos = { LOGIN_EXITOSO: "🔑", LOGIN_FALLIDO: "❌", LOGOUT: "🚪", CREAR_USUARIO: "👤", ACTIVAR_USUARIO: "🟢", DESACTIVAR_USUARIO: "🔴", NOTIFICACION: "📤", ASIGNACION_CREADA: "🔗", ASIGNACION_ELIMINADA: "🗑️", CONFIG: "⚙️", CONFIG_RESET: "🔄", PERIODO_CREADO: "📅", PERIODO_CERRADO: "🔒" };
    tbody.innerHTML = eventos.map(function(e) {
      var f = new Date(e.creado_en);
      var fecha = String(f.getDate()).padStart(2,"0") + "/" + String(f.getMonth()+1).padStart(2,"0") + "/" + f.getFullYear() + " " + String(f.getHours()).padStart(2,"0") + ":" + String(f.getMinutes()).padStart(2,"0");
      var icono = iconos[e.evento] || "📝";
      var eventoLimpio = e.evento.replace(/_/g, " ").toLowerCase().replace(/^./, function(s) { return s.toUpperCase(); });
      return '<tr><td>' + fecha + '</td><td>' + (e.correo_usuario || "—") + '</td><td>' + icono + ' ' + eventoLimpio + '</td><td>' + (e.detalle || "—") + '</td><td>' + (e.ip || "local") + '</td><td><span class="insignia insignia--activo">✓ Registrado</span></td></tr>';
    }).join("");
  } catch (err) { console.warn("Error cargando auditoría:", err); }
}

// ── CARGAR CONFIGURACIÓN DESDE EL API ───────────────────
async function cargarConfiguracion() {
  try {
    var cfg = await llamarAPI("/admin/configuracion", "GET");
    if (cfg.umbral_alerta && document.getElementById("cfgUmbral"))
      document.getElementById("cfgUmbral").value = cfg.umbral_alerta;
    if (cfg.max_estudiantes_tutor && document.getElementById("cfgMaxEst"))
      document.getElementById("cfgMaxEst").value = cfg.max_estudiantes_tutor;
    if (cfg.horas_cancelacion && document.getElementById("cfgCancelacion"))
      document.getElementById("cfgCancelacion").value = cfg.horas_cancelacion;
    if (cfg.minutos_sesion && document.getElementById("cfgSesion"))
      document.getElementById("cfgSesion").value = cfg.minutos_sesion;
  } catch (err) { console.warn("Error cargando config:", err); }
}

// ── CARGAR PERÍODOS DESDE EL API ────────────────────────
async function cargarPeriodos() {
  try {
    var periodos = await llamarAPI("/admin/periodos", "GET");
    var contenedor = document.querySelector(
      "#pagina-admin-configuracion .grilla-dos > div:nth-child(2) > div"
    );
    if (!contenedor || periodos.length === 0) return;

    // Guardar el botón "Crear Nuevo Período" para no borrarlo
    var botonCrear = contenedor.querySelector("button");
    contenedor.innerHTML = "";

    periodos.forEach(function(p) {
      var div = document.createElement("div");
      div.className = "config-periodo" + (p.estado === "activo" ? " activo-periodo" : "");
      var estadoTxt = p.estado === "activo" ? "● Activo" : p.estado === "proximo" ? "○ Próximo" : "○ Cerrado";
      var estadoColor = p.estado === "activo" ? "" : "texto-gris";
      var fmtFecha = function(iso) {
        var partes = iso.split("-");
        var meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
        return partes[2] + " " + meses[parseInt(partes[1])-1] + " " + partes[0];
      };
      div.innerHTML =
        '<div class="config-periodo__estado ' + estadoColor + '">' + estadoTxt + '</div>' +
        '<div class="config-periodo__nombre">Período ' + p.nombre + '</div>' +
        '<div class="config-periodo__fechas">' + fmtFecha(p.inicio) + ' — ' + fmtFecha(p.fin) + '</div>';
      contenedor.appendChild(div);
    });

    if (botonCrear) contenedor.appendChild(botonCrear);
  } catch (err) { console.warn("Error cargando períodos:", err); }
}
