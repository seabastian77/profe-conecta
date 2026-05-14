// ── HORARIOS DOCENTE — filas dinámicas ─────────────────
function agregarFilaHorario() {
  const container = document.getElementById("docHorariosContainer");
  if (!container) return;
  const fila = document.createElement("div");
  fila.className = "docHorarioFila";
  fila.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap";
  fila.innerHTML = `
    <select class="horDia campo__entrada" style="flex:1;min-width:110px">
      <option value="">Día</option>
      <option>Lunes</option><option>Martes</option><option>Miércoles</option>
      <option>Jueves</option><option>Viernes</option><option>Sábado</option>
    </select>
    <input type="time" class="horInicio campo__entrada" style="flex:1;min-width:90px" placeholder="Inicio"/>
    <input type="time" class="horFin campo__entrada" style="flex:1;min-width:90px" placeholder="Fin"/>
    <input type="text" class="horLugar campo__entrada" style="flex:2;min-width:120px" placeholder="Lugar (Aula 301, Meet...)"/>
    <button type="button" onclick="this.parentElement.remove()" style="background:#fee2e2;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;color:#dc2626;font-weight:700">✕</button>
  `;
  container.appendChild(fila);
}

// ── COMPLETAR PERFIL ────────────────────────────────────
// Muestra el formulario correcto según el rol activo
function mostrarFormPerfil() {
  const rol = sesion.rol;
  document.getElementById("perfilFormEstudiante").classList.add("oculto");
  document.getElementById("perfilFormDocente").classList.add("oculto");
  document.getElementById("perfilFormAdmin").classList.add("oculto");

  if (rol === "estudiante")
    document.getElementById("perfilFormEstudiante").classList.remove("oculto");
  if (rol === "docente") {
    document.getElementById("perfilFormDocente").classList.remove("oculto");
    // Inicializar el autocomplete de asignaturas
    if (typeof inicializarAutocompleteAsignaturas === "function")
      inicializarAutocompleteAsignaturas();
    // Inicializar el select de facultad con búsqueda
    if (typeof inicializarSelectFacultad === "function")
      inicializarSelectFacultad();
  }
  if (rol === "admin")
    document.getElementById("perfilFormAdmin").classList.remove("oculto");

  const etiquetas = {
    estudiante: "Estudiante",
    docente: "Docente / Tutor",
    admin: "Administrador",
  };
  document.getElementById("perfilRolEtiqueta").textContent =
    etiquetas[rol] || "";
}

// ── GUARDAR PERFIL ESTUDIANTE ───────────────────────────
async function alEnviarPerfilEstudiante(e) {
  e.preventDefault();

  const datos = {
    documento: document.getElementById("estDocumento").value.trim(),
    programa: document.getElementById("estPrograma").value,
    semestre: document.getElementById("estSemestre").value,
    telefono: document.getElementById("estTelefono").value.trim(),
    promedio: parseFloat(document.getElementById("estPromedio").value) || 0,
  };

  let hayError = false;
  if (!datos.documento) {
    ponerError("estDocumento", "El número de documento es requerido");
    hayError = true;
  }
  if (!datos.programa) {
    ponerError("estPrograma", "Selecciona el programa");
    hayError = true;
  }
  if (!datos.semestre) {
    ponerError("estSemestre", "Selecciona el semestre");
    hayError = true;
  }
  if (hayError) return;

  try {
    const resp = await llamarAPI("/perfil/estudiante", "POST", datos);
    perfilStorage.clearPerfil(); // invalidar caché

    mostrarTostada("Perfil guardado correctamente", "exito");

    irAPagina("panel-estudiante");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error guardando perfil", "error");
  }
}

// ── GUARDAR PERFIL DOCENTE ──────────────────────────────
async function alEnviarPerfilDocente(e) {
  e.preventDefault();

  // Leer asignaturas del autocomplete (campo JSON oculto)
  let asignaturas = [];
  try {
    const jsonField = document.getElementById("docAsignaturasJSON");
    asignaturas = jsonField ? JSON.parse(jsonField.value || "[]") : [];
  } catch(err) { asignaturas = []; }

  // Programas seleccionados (usando la función del módulo facultad.js)
  const programas = typeof getProgramasSeleccionados === 'function'
    ? getProgramasSeleccionados()
    : [...document.querySelectorAll("#docProgramas input:checked")].map(cb => cb.value || cb.closest("label").textContent.trim());

  // Horarios capturados desde filas dinámicas
  const horarios = [];
  document.querySelectorAll(".docHorarioFila").forEach(fila => {
    const dia = fila.querySelector(".horDia").value;
    const hi = fila.querySelector(".horInicio").value;
    const hf = fila.querySelector(".horFin").value;
    const lugar = fila.querySelector(".horLugar").value.trim();
    if (dia && hi && hf) horarios.push({ dia, hora_inicio: hi, hora_fin: hf, lugar: lugar || "Por definir" });
  });

  const datos = {
    cedula: document.getElementById("docCedula").value.trim(),
    facultad: document.getElementById("docFacultad").value,
    telefono: document.getElementById("docTelefono").value.trim(),
    asignaturas,
    programas,
    horarios,
  };

  let hayError = false;
  if (!datos.cedula) {
    ponerError("docCedula", "El número de cédula es requerido");
    hayError = true;
  }
  if (!datos.facultad) {
    ponerError("docFacultad", "Selecciona facultad");
    hayError = true;
  }
  if (asignaturas.length === 0) {
    ponerError("docAsignaturas", "Agrega al menos una materia");
    hayError = true;
  }
  if (hayError) return;

  try {
    await llamarAPI("/perfil/docente", "POST", datos);
    perfilStorage.clearPerfil();
    mostrarTostada("Perfil guardado correctamente", "exito");
    irAPagina("panel-docente");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error guardando perfil", "error");
  }
}

// ── GUARDAR PERFIL ADMIN ────────────────────────────────
async function alEnviarPerfilAdmin(e) {
  e.preventDefault();

  const datos = {
    cedula: document.getElementById("admCedula").value.trim(),
    cargo: document.getElementById("admCargo").value,
    dependencia: document.getElementById("admDependencia").value.trim(),
    telefono: document.getElementById("admTelefono").value.trim(),
  };

  let hayError = false;
  if (!datos.cedula) {
    ponerError("admCedula", "Requerido");
    hayError = true;
  }
  if (!datos.cargo) {
    ponerError("admCargo", "Selecciona el cargo");
    hayError = true;
  }
  if (hayError) return;

  try {
    await llamarAPI("/perfil/admin", "POST", datos);
    perfilStorage.clearPerfil();
    mostrarTostada("Perfil guardado correctamente", "exito");
    irAPagina("panel-admin");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error guardando perfil", "error");
  }
}

// ── CARGAR PÁGINA MI PERFIL ─────────────────────────────
async function cargarMiPerfil() {
  // Siempre buscar del servidor para garantizar datos correctos del usuario activo
  // Solo usar caché si el ID coincide con la sesión actual
  let perfil = perfilStorage.getPerfil();
  const idSesion = sesion?.id || authStorage.getSesion()?.id;

  // Si el caché es de otro usuario, no existe, o no tiene fotos → buscar del API
  if (!perfil || String(perfil.id) !== String(idSesion) || !perfil.fotos) {
    perfilStorage.clearPerfil();
    try {
      perfil = await llamarAPI("/perfil", "GET");
      perfilStorage.setPerfil(perfil);
    } catch (err) {
      console.error("Error cargando perfil:", err);
      return;
    }
  }

  // Datos básicos del hero
  document.getElementById("perfilHeroNombre").textContent =
    `${perfil.nombres} ${perfil.apellidos}`;
  document.getElementById("perfilHeroCorreo").textContent = perfil.correo;
  document.getElementById("perfilHeroRol").textContent = perfil.rol;

  // Foto de perfil — prioridad: servidor > localStorage
  // (el servidor es fuente de verdad, localStorage es caché de velocidad)
  const fotoPerfilServidor = perfil.fotos?.foto_perfil || "";
  const fotoPerfilLocal    = perfilStorage.getFotoPerfil();
  const fotoPerfil = fotoPerfilServidor || fotoPerfilLocal || "";

  // Si el servidor tiene foto, actualizar el localStorage para que coincida
  if (fotoPerfilServidor) {
    perfilStorage.setFotoPerfil(fotoPerfilServidor);
  }

  const imgPerfil = document.getElementById("perfilFotoImg");
  const iniciales = document.getElementById("perfilFotoIniciales");
  if (fotoPerfil && imgPerfil && iniciales) {
    imgPerfil.src = fotoPerfil;
    imgPerfil.style.display = "block";
    iniciales.style.display = "none";
  } else if (iniciales && imgPerfil) {
    imgPerfil.style.display = "none";
    iniciales.style.display = "flex";
    iniciales.textContent = sesion?.inicial || idSesion?.toString().slice(0,2).toUpperCase() || "?";
  }

  // Foto de portada — misma lógica
  const fotoPortadaServidor = perfil.fotos?.foto_portada || "";
  const fotoPortadaLocal    = perfilStorage.getFotoPortada();
  const fotoPortada = fotoPortadaServidor || fotoPortadaLocal || "";

  if (fotoPortadaServidor) {
    perfilStorage.setFotoPortada(fotoPortadaServidor);
  }

  const imgPortada = document.getElementById("perfilPortadaImg");
  if (imgPortada) {
    if (fotoPortada) {
      imgPortada.src = fotoPortada;
      imgPortada.style.display = "block";
    } else {
      imgPortada.style.display = "none";
    }
  }

  // RF027 — Aviso de perfil incompleto
  const contenedor = document.getElementById("perfilContenido");
  const datos = perfil.perfil || {};
  const incompleto = perfilEstaIncompleto(perfil.rol, datos);

  let avisoHTML = "";
  if (incompleto) {
    avisoHTML = `
      <div class="aviso-naranja" style="margin-bottom:18px">
        <span>⚠️</span>
        <p>
          <strong>Tu perfil está incompleto.</strong>
          Faltan datos requeridos para poder usar todas las funcionalidades del sistema.
          <a href="#" onclick="irAPagina('completar-perfil'); return false;" class="texto-naranja">
            <strong>Completar perfil ahora →</strong>
          </a>
        </p>
      </div>`;
  }

  // Contenido según el rol
  if (perfil.rol === "estudiante")
    contenedor.innerHTML = avisoHTML + perfilEstudianteHTML(perfil);
  else if (perfil.rol === "docente")
    contenedor.innerHTML = avisoHTML + perfilDocenteHTML(perfil);
  else contenedor.innerHTML = avisoHTML + perfilAdminHTML(perfil);
}

// RF027 — Detectar si el perfil está incompleto según el rol
function perfilEstaIncompleto(rol, datos) {
  if (!datos) return true;
  if (rol === "estudiante") {
    return !datos.documento || !datos.programa || !datos.semestre;
  }
  if (rol === "docente") {
    return !datos.cedula || !datos.facultad ||
      !(datos.asignaturas && datos.asignaturas.length > 0);
  }
  if (rol === "admin") {
    return !datos.cedula || !datos.cargo;
  }
  return false;
}

function perfilEstudianteHTML(p) {
  const d = p.perfil || {};
  const promedio = parseFloat(d.promedio) || 0;
  const enAlerta = promedio > 0 && promedio < 3.0;

  // RF031 — barra de progreso de créditos
  const semestre = parseInt(d.semestre) || 0;
  const totalCreditos = 160;
  const creditosAprobados = Math.min(semestre * 16, totalCreditos);
  const porcentajeCreditos = Math.round(
    (creditosAprobados / totalCreditos) * 100,
  );
  const colorBarra = porcentajeCreditos < 50 ? "#f39200" : "#22c55e";

  return `
    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">Datos Académicos</h3>
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">N° Documento</span><span>${d.documento || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Programa</span><span>${d.programa || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Semestre</span><span>${d.semestre || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Promedio</span>
          <span class="${enAlerta ? "texto-naranja" : ""}">${d.promedio || "—"}${enAlerta ? " ⚠️" : ""}</span>
        </div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${d.telefono || "—"}</span></div>
      </div>
    </div>

    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">📚 Avance del Programa Académico</h3>
      <div style="padding:8px 4px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;color:#555">
          <span><strong>${creditosAprobados}</strong> de ${totalCreditos} créditos aprobados</span>
          <span style="color:${colorBarra};font-weight:700">${porcentajeCreditos}%</span>
        </div>
        <div style="background:#e5e7eb;border-radius:8px;height:14px;overflow:hidden">
          <div style="width:${porcentajeCreditos}%;height:100%;background:linear-gradient(90deg,${colorBarra},${colorBarra}cc);border-radius:8px;transition:width 0.6s ease"></div>
        </div>
        <p style="margin-top:10px;font-size:12px;color:#777">
          Estimado a partir del semestre actual · 16 créditos por semestre
        </p>
      </div>
    </div>
  `;
}

function perfilDocenteHTML(p) {
  const d = p.perfil || {};
  const asig = (d.asignaturas || []).join(", ") || "—";
  const progs = (d.programas || []).join(", ") || "—";

  const horarios = d.horarios && d.horarios.length > 0
    ? d.horarios
    : [];

  const horariosHTML = horarios.length > 0
    ? horarios.map(h => `
        <div style="background:#f0f9fb;border-left:3px solid #007b99;padding:10px;border-radius:6px">
          <div style="font-weight:700;color:#007b99;font-size:13px">${h.dia}</div>
          <div style="font-size:12px;color:#333;margin-top:4px">${h.hora_inicio} – ${h.hora_fin}</div>
          <div style="font-size:11px;color:#777">${h.lugar || 'Por definir'}</div>
        </div>`).join("")
    : '<p style="color:#999;font-size:13px;padding:8px 0">Sin horarios registrados aún.</p>';

  // Últimas 4 tutorías
  const tutorias = (academicoStorage.getTutorias() || [])
    .slice()
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
    .slice(0, 4);

  const tutoriasHTML =
    tutorias.length === 0
      ? '<p class="sin-datos">Aún no hay sesiones registradas.</p>'
      : tutorias
          .map(
            (t) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #eee">
          <div>
            <div style="font-weight:600;font-size:13px">${t.asignatura || "—"}</div>
            <div style="font-size:11px;color:#777">${t.nombre_estudiante || "Estudiante"} · ${formatearFecha(t.fecha)}</div>
          </div>
          <span class="insignia ${t.estado === "pendiente" ? "insignia--alerta" : "insignia--activo"}">${t.estado || "pendiente"}</span>
        </div>`,
          )
          .join("");

  return `
    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">Datos del Docente</h3>
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">Cédula</span><span>${d.cedula || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Facultad</span><span>${d.facultad || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${d.telefono || "—"}</span></div>
        <div class="perfil-dato" style="grid-column:1/-1"><span class="perfil-dato__label">Programas que atiende</span><span>${progs}</span></div>
        <div class="perfil-dato" style="grid-column:1/-1"><span class="perfil-dato__label">Materias</span><span>${asig}</span></div>
      </div>
    </div>

    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">🕒 Horarios Disponibles</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;padding:8px 4px">
        ${horariosHTML}
      </div>
      <button class="btn-secundario" style="margin-top:12px;font-size:12px" onclick="irAPagina('completar-perfil')">✏️ Editar horarios</button>
    </div>

    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">📋 Últimas Tutorías</h3>
      <div style="padding:4px">${tutoriasHTML}</div>
    </div>
  `;
}

function perfilAdminHTML(p) {
  const d = p.perfil || {};

  // RF034 — Log de actividad reciente (datos de ejemplo)
  const actividades = [
    { icono: "🔑", accion: "Inicio de sesión", tiempo: "Hace 5 min", color: "#22c55e" },
    { icono: "✏️", accion: "Editó configuración: umbral de alerta", tiempo: "Hace 1h", color: "#007b99" },
    { icono: "📤", accion: "Envió notificación masiva (47 destinatarios)", tiempo: "Hace 3h", color: "#f39200" },
    { icono: "🔗", accion: "Creó asignación: Carlos M. ↔ Lina M.", tiempo: "Hace 5h", color: "#007b99" },
    { icono: "🔒", accion: "Desactivó cuenta: Valentina O.", tiempo: "Ayer", color: "#ef4444" },
    { icono: "📅", accion: "Cerró período académico 2025-2", tiempo: "Hace 2 días", color: "#777" },
  ];

  return `
    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">Datos del Administrador</h3>
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">Cédula</span><span>${d.cedula || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Cargo</span><span>${d.cargo || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Dependencia</span><span>${d.dependencia || "—"}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${d.telefono || "—"}</span></div>
      </div>
    </div>

    <div class="perfil-seccion">
      <h3 class="perfil-seccion__titulo">📜 Actividad Reciente</h3>
      <div style="padding:4px">
        ${actividades
          .map(
            (a) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid #eee">
            <div style="width:36px;height:36px;border-radius:50%;background:${a.color}20;color:${a.color};display:flex;align-items:center;justify-content:center;font-size:16px">${a.icono}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:13px;color:#333">${a.accion}</div>
              <div style="font-size:11px;color:#777">${a.tiempo}</div>
            </div>
          </div>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

// ── SUBIR FOTO DE PERFIL ────────────────────────────────
// Comprime una imagen a máximo maxKB kilobytes
function comprimirImagen(archivo, maxAncho, maxKB) {
  return new Promise(function(resolve) {
    var lector = new FileReader();
    lector.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        var ancho = Math.min(img.width, maxAncho);
        var alto  = Math.round(img.height * (ancho / img.width));
        canvas.width  = ancho;
        canvas.height = alto;
        canvas.getContext('2d').drawImage(img, 0, 0, ancho, alto);

        // Reducir calidad hasta que quepa en maxKB
        var calidad = 0.85;
        var resultado = canvas.toDataURL('image/jpeg', calidad);
        while (resultado.length > maxKB * 1024 && calidad > 0.2) {
          calidad -= 0.1;
          resultado = canvas.toDataURL('image/jpeg', calidad);
        }
        resolve(resultado);
      };
      img.src = e.target.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function subirFotoPerfil(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  mostrarTostada("⏳ Procesando foto...", "info");

  comprimirImagen(archivo, 400, 300).then(async function(base64) {
    // Mostrar inmediatamente en el DOM
    var img = document.getElementById("perfilFotoImg");
    var iniciales = document.getElementById("perfilFotoIniciales");
    if (img) { img.src = base64; img.style.display = "block"; }
    if (iniciales) iniciales.style.display = "none";

    // Actualizar chip barra superior
    var chipAv = document.getElementById("chipAvatar");
    if (chipAv) { chipAv.style.backgroundImage = "url(" + base64 + ")"; chipAv.textContent = ""; }

    // Guardar en localStorage (con manejo de cuota)
    try { perfilStorage.setFotoPerfil(base64); } catch(e) { console.warn("localStorage lleno"); }

    // Subir al servidor (fuente de verdad)
    try {
      await llamarAPI("/perfil/foto", "POST", { foto_base64: base64, tipo: "perfil" });
      mostrarTostada("✅ Foto de perfil actualizada", "exito");
      perfilStorage.clearPerfil(); // invalidar caché para recargar con foto nueva
    } catch (err) {
      mostrarTostada("⚠️ Foto guardada localmente. Sin conexión con servidor.", "advertencia");
    }
  });
}

function subirPortada(input) {
  const archivo = input.files[0];
  if (!archivo) return;

  mostrarTostada("⏳ Procesando portada...", "info");

  comprimirImagen(archivo, 1200, 400).then(async function(base64) {
    var img = document.getElementById("perfilPortadaImg");
    if (img) { img.src = base64; img.style.display = "block"; }

    try { perfilStorage.setFotoPortada(base64); } catch(e) { console.warn("localStorage lleno"); }

    try {
      await llamarAPI("/perfil/foto", "POST", { foto_base64: base64, tipo: "portada" });
      mostrarTostada("✅ Foto de portada actualizada", "exito");
      perfilStorage.clearPerfil();
    } catch (err) {
      mostrarTostada("⚠️ Portada guardada localmente. Sin conexión con servidor.", "advertencia");
    }
  });
}
