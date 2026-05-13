// ── PROGRAMAR TUTORÍA ───────────────────────────────────
async function alEnviarTutoria(e) {
  e.preventDefault();

  const asignatura = document.getElementById("tutAsignatura").value;
  const modalidad = document.getElementById("tutModalidad").value;
  const fecha = document.getElementById("tutFecha").value;
  const hora = document.getElementById("tutHora").value;
  const observaciones = document.getElementById("tutObservaciones").value;
  let hayError = false;

  [
    "tutAsignatura",
    "tutModalidad",
    "tutFecha",
    "tutHora",
    "tutEstudiante",
    "tutTutor",
  ].forEach((id) => quitarError(id));

  if (!asignatura) {
    ponerError("tutAsignatura", "Selecciona una asignatura");
    hayError = true;
  }
  if (!modalidad) {
    ponerError("tutModalidad", "Selecciona la modalidad");
    hayError = true;
  }
  if (!fecha) {
    ponerError("tutFecha", "La fecha es obligatoria");
    hayError = true;
  }
  if (!hora) {
    ponerError("tutHora", "La hora es obligatoria");
    hayError = true;
  }

  // RN06 — Validar que la fecha sea posterior a hoy
  if (fecha) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fTut = new Date(fecha + "T00:00");
    if (fTut <= hoy) {
      ponerError(
        "tutFecha",
        "La fecha debe ser a partir de mañana (RN06)",
      );
      hayError = true;
    }
  }

  let docente_id = null;
  let estudiante_id = null;

  // Leer datos del demo para buscar IDs reales
  let usuarios = [];
  let perfiles = {};
  try {
    usuarios = JSON.parse(localStorage.getItem("cp_demo.usuarios") || "[]");
    perfiles = JSON.parse(localStorage.getItem("cp_demo.perfiles") || "{}");
  } catch (e) {}

  if (sesion.rol === "estudiante") {
    // El select ahora tiene el ID del docente como value
    const tutorSelect = document.getElementById("tutTutor");
    const idSel = parseInt(tutorSelect.value);
    if (!idSel) {
      ponerError("tutTutor", "Selecciona un tutor");
      hayError = true;
    } else {
      docente_id = idSel;
    }
  }

  if (sesion.rol === "docente") {
    const documento = document.getElementById("tutEstudiante").value.trim();
    if (!documento) {
      ponerError("tutEstudiante", "Escribe el número de documento del estudiante");
      hayError = true;
    } else if (!CONFIG.MODO_DEMO) {
      // Modo real: buscar en el backend por documento
      try {
        const resultados = await llamarAPI("/tutorias/buscar-estudiante?q=" + encodeURIComponent(documento), "GET");
        if (!resultados || resultados.length === 0) {
          ponerError("tutEstudiante", "No existe un estudiante con ese documento");
          hayError = true;
        } else {
          estudiante_id = resultados[0].id;
        }
      } catch(e) {
        ponerError("tutEstudiante", "Error al buscar el estudiante");
        hayError = true;
      }
    } else {
      // Modo demo: buscar por documento en perfiles locales
      let perfiles = {};
      let usuarios = [];
      try {
        perfiles = JSON.parse(localStorage.getItem("cp_demo.perfiles") || "{}");
        usuarios = JSON.parse(localStorage.getItem("cp_demo.usuarios") || "[]");
      } catch (e) {}
      let encontrado = null;
      for (const [uid, p] of Object.entries(perfiles)) {
        if (p.tipo === "estudiante" && (String(p.documento) === documento || String(p.codigo) === documento)) {
          encontrado = parseInt(uid);
          break;
        }
      }
      if (!encontrado) {
        ponerError("tutEstudiante", "No existe un estudiante con documento " + documento);
        hayError = true;
      } else {
        estudiante_id = encontrado;
      }
    }
  }

  if (sesion.rol === "admin") {
    const tutorSelect = document.getElementById("tutTutor");
    const idSel = parseInt(tutorSelect.value);
    if (idSel) docente_id = idSel;
    else { ponerError("tutTutor", "Selecciona un tutor"); hayError = true; }

    const docEst = document.getElementById("tutEstudiante").value.trim();
    if (!docEst) {
      ponerError("tutEstudiante", "Escribe el número de documento");
      hayError = true;
    } else if (!CONFIG.MODO_DEMO) {
      try {
        const res = await llamarAPI("/tutorias/buscar-estudiante?q=" + encodeURIComponent(docEst), "GET");
        if (!res || res.length === 0) { ponerError("tutEstudiante", "Estudiante no encontrado"); hayError = true; }
        else estudiante_id = res[0].id;
      } catch(e) { ponerError("tutEstudiante", "Error buscando estudiante"); hayError = true; }
    } else {
      let perfiles = {}, usuarios = [];
      try {
        perfiles = JSON.parse(localStorage.getItem("cp_demo.perfiles") || "{}");
        usuarios = JSON.parse(localStorage.getItem("cp_demo.usuarios") || "[]");
      } catch (e) {}
      for (const [uid, p] of Object.entries(perfiles)) {
        if (p.tipo === "estudiante" && (String(p.documento) === docEst || String(p.codigo) === docEst)) {
          estudiante_id = parseInt(uid); break;
        }
      }
      if (!estudiante_id) { ponerError("tutEstudiante", "Documento de estudiante inválido"); hayError = true; }
    }
  }

  if (hayError) return;

  try {
    await llamarAPI("/tutorias", "POST", {
      docente_id,
      estudiante_id,
      asignatura,
      modalidad,
      fecha,
      hora,
      observaciones,
    });

    mostrarTostada("¡Tutoría programada correctamente!", "exito");
    document.getElementById("formularioTutoria").reset();
    const panelDestino = sesion.rol === "admin" ? "panel-admin" : sesion.rol === "docente" ? "panel-docente" : "panel-estudiante";
    irAPagina(panelDestino);
  } catch (err) {
    mostrarTostada(err.mensaje || "No se pudo programar la tutoría", "error");
  }
}

// ── PREPARAR FORMULARIO DE TUTORÍA ──────────────────────
async function prepararFormTutoria() {
  const selectTutor = document.getElementById("tutTutor");
  const campoEstudiante = document.getElementById("tutEstudiante");

  // En modo real, cargar docentes del backend
  if (!CONFIG.MODO_DEMO && selectTutor) {
    try {
      const docentes = await llamarAPI("/tutorias/docentes-disponibles", "GET");
      selectTutor.innerHTML =
        '<option value="">— Selecciona tutor —</option>' +
        docentes.map(d => `<option value="${d.id}">${d.nombre} · ${d.facultad}</option>`).join("");
    } catch(e) {
      selectTutor.innerHTML = '<option value="">Sin tutores disponibles</option>';
    }
  } else {
    // Modo demo: usar datos locales
    let usuarios = [];
    try { usuarios = JSON.parse(localStorage.getItem("cp_demo.usuarios") || "[]"); } catch (e) {}
    const docentes = usuarios.filter(u => u.rol === "docente" && u.activo);
    if (selectTutor) {
      selectTutor.innerHTML =
        '<option value="">— Selecciona tutor —</option>' +
        docentes.map(d => `<option value="${d.id}">${d.nombres} ${d.apellidos}</option>`).join("");
    }
  }

  const contEst = campoEstudiante?.closest(".campo");
  const contTut = selectTutor?.closest(".campo");

  if (sesion.rol === "estudiante") {
    if (contEst) contEst.style.display = "none";
    if (contTut) contTut.style.display = "";
  } else if (sesion.rol === "docente") {
    if (contEst) contEst.style.display = "";
    if (contTut) contTut.style.display = "none";
    if (campoEstudiante) {
      campoEstudiante.placeholder = "Número de documento del estudiante (cédula o TI)";
    }
  } else {
    if (contEst) contEst.style.display = "";
    if (contTut) contTut.style.display = "";
  }
}

// ── CARGAR TUTORÍAS DEL PANEL ───────────────────────────
async function cargarTutorias() {
  try {
    const tutorias = await llamarAPI("/tutorias", "GET");
    academicoStorage.setTutorias(tutorias);
    return tutorias;
  } catch (err) {
    console.error("Error cargando tutorías:", err);
    return academicoStorage.getTutorias(); // retornar caché si falla el servidor
  }
}

// ── RENDERIZAR TARJETAS DE TUTORÍA ──────────────────────
function tarjetaTutoriaHTML(t, vistaRol) {
  const esEstudiante = vistaRol === "estudiante";
  const nombre = esEstudiante
    ? t.nombre_docente || "Tutor"
    : t.nombre_estudiante || "Estudiante";
  const etiqueta = esEstudiante ? "Tutor" : "Estudiante";

  const colores = {
    pendiente: "#007b99",
    realizada: "#22c55e",
    cancelada: "#ef4444",
  };
  const color = colores[t.estado] || "#007b99";

  return `
    <div class="tarjeta-tutoria">
      <div class="tarjeta-tutoria__estado" style="background:${color}">
        ${t.estado.charAt(0).toUpperCase() + t.estado.slice(1)}
      </div>
      <div class="tarjeta-tutoria__cuerpo">
        <div class="tarjeta-tutoria__asig">${t.asignatura}</div>
        <div class="tarjeta-tutoria__meta">${etiqueta}: <strong>${nombre}</strong></div>
        <div class="tarjeta-tutoria__fecha">📅 ${formatearFecha(t.fecha)} · ⏰ ${t.hora?.slice(0, 5)}</div>
        <div class="tarjeta-tutoria__modo">${iconoModalidad(t.modalidad)} ${t.modalidad}</div>
      </div>
      ${
        t.estado === "pendiente"
          ? `
        <button class="tarjeta-tutoria__btn" onclick="cancelarTutoria(${t.id})" type="button">
          Cancelar
        </button>`
          : ""
      }
    </div>
  `;
}

async function cancelarTutoria(id) {
  if (!confirm("¿Cancelar esta tutoría?")) return;

  try {
    await llamarAPI(`/tutorias/${id}/cancelar`, "PATCH");
    mostrarTostada("Tutoría cancelada", "exito");

    // Recargar el panel
    if (sesion.rol === "estudiante") cargarPanelEstudiante();
    else cargarPanelDocente();
  } catch (err) {
    mostrarTostada(err.mensaje || "No se pudo cancelar", "error");
  }
}

function iconoModalidad(m) {
  if (!m) return "";
  var ml = m.toLowerCase();
  if (ml.includes("presencial")) return "🏫";
  if (ml.includes("virtual"))    return "💻";
  if (ml.includes("h")) return "🔀";
  return "";
}
