// Agrega una fila dinámica para capturar un horario del docente
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

// Muestra el formulario de perfil correcto según el rol activo
function mostrarFormPerfil() {
  const rol = sesion.rol;
  document.getElementById("perfilFormEstudiante").classList.add("oculto");
  document.getElementById("perfilFormDocente").classList.add("oculto");
  document.getElementById("perfilFormAdmin").classList.add("oculto");

  if (rol === "estudiante") {
    document.getElementById("perfilFormEstudiante").classList.remove("oculto");
    rellenarFormEstudiante();
  }
  if (rol === "docente") {
    document.getElementById("perfilFormDocente").classList.remove("oculto");
    if (typeof inicializarAutocompleteAsignaturas === "function")
      inicializarAutocompleteAsignaturas();
    if (typeof inicializarSelectFacultad === "function")
      inicializarSelectFacultad();
    rellenarFormDocente();
  }
  if (rol === "admin") {
    document.getElementById("perfilFormAdmin").classList.remove("oculto");
    rellenarFormAdmin();
  }

  const etiquetas = {
    estudiante: "Estudiante",
    docente: "Docente / Tutor",
    admin: "Administrador",
  };
  document.getElementById("perfilRolEtiqueta").textContent =
    etiquetas[rol] || "";
}

// Llena el formulario con el perfil guardado para que «Editar datos» no obligue a escribir todo otra vez.
async function rellenarFormEstudiante() {
  try {
    const perfil = await llamarAPI("/perfil", "GET");
    const d = perfil?.perfil || {};
    if (d.documento) document.getElementById("estDocumento").value = d.documento;
    if (d.programa) document.getElementById("estPrograma").value = d.programa;
    if (d.semestre) document.getElementById("estSemestre").value = d.semestre;
    if (d.telefono) document.getElementById("estTelefono").value = d.telefono;
  } catch (err) {
    // Sin perfil previo el formulario queda vacío, como en el primer registro.
  }
}

// Llena el formulario del docente con lo guardado: cédula, facultad, programas, materias y horarios.
async function rellenarFormDocente() {
  let d;
  try {
    d = (await llamarAPI("/perfil", "GET"))?.perfil;
  } catch (err) {
    return;
  }
  if (!d) return;

  if (d.cedula) document.getElementById("docCedula").value = d.cedula;
  if (d.telefono) document.getElementById("docTelefono").value = d.telefono;

  if (d.facultad) {
    const facultad = FACULTADES_FUNLAM.find((f) => f.nombre === d.facultad);
    if (facultad) {
      seleccionarFacultad(facultad.area, facultad.nombre);
    } else {
      document.getElementById("docFacultadInput").value = d.facultad;
      document.getElementById("docFacultad").value = d.facultad;
    }
    (d.programas || []).forEach((programa) => {
      const casilla = [...document.querySelectorAll("#docProgramas input")].find((c) => c.value === programa);
      if (casilla) casilla.checked = true;
    });
  }

  if (typeof precargarAsignaturas === "function") precargarAsignaturas(d.asignaturas || []);

  const contenedor = document.getElementById("docHorariosContainer");
  if (contenedor) {
    contenedor.innerHTML = "";
    (d.horarios || []).forEach((h) => {
      agregarFilaHorario();
      const fila = contenedor.lastElementChild;
      fila.querySelector(".horDia").value = h.dia || "";
      fila.querySelector(".horInicio").value = (h.hora_inicio || "").slice(0, 5);
      fila.querySelector(".horFin").value = (h.hora_fin || "").slice(0, 5);
      fila.querySelector(".horLugar").value = h.lugar || "";
    });
  }
}

// Llena el formulario del administrador con sus datos guardados.
async function rellenarFormAdmin() {
  try {
    const d = (await llamarAPI("/perfil", "GET"))?.perfil;
    if (!d) return;
    if (d.cedula) document.getElementById("admCedula").value = d.cedula;
    if (d.cargo) document.getElementById("admCargo").value = d.cargo;
    if (d.dependencia) document.getElementById("admDependencia").value = d.dependencia;
    if (d.telefono) document.getElementById("admTelefono").value = d.telefono;
  } catch (err) {
    // Sin perfil previo el formulario queda vacío.
  }
}

// Valida y guarda el perfil del estudiante; el promedio no va porque lo registra la institución.
async function alEnviarPerfilEstudiante(e) {
  e.preventDefault();

  const datos = {
    documento: document.getElementById("estDocumento").value.trim(),
    programa: document.getElementById("estPrograma").value,
    semestre: document.getElementById("estSemestre").value,
    telefono: document.getElementById("estTelefono").value.trim(),
  };

  let hayError = false;
  if (!datos.documento) {
    ponerError("estDocumento", "El número de documento es requerido");
    hayError = true;
  } else if (!/^\d{6,11}$/.test(datos.documento)) {
    ponerError("estDocumento", "Solo números, entre 6 y 11 dígitos");
    hayError = true;
  }
  if (datos.telefono && !/^\d{7,10}$/.test(datos.telefono)) {
    ponerError("estTelefono", "Entre 7 y 10 números");
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
    perfilStorage.clearPerfil(); // invalida la caché

    mostrarTostada("Perfil guardado correctamente", "exito");

    irAPagina("panel-estudiante");
  } catch (err) {
    mostrarTostada(err.mensaje || "Error guardando perfil", "error");
  }
}

// Valida y guarda el perfil del docente
async function alEnviarPerfilDocente(e) {
  e.preventDefault();

  // Lee las asignaturas del campo JSON oculto
  let asignaturas = [];
  try {
    const jsonField = document.getElementById("docAsignaturasJSON");
    asignaturas = jsonField ? JSON.parse(jsonField.value || "[]") : [];
  } catch(err) { asignaturas = []; }

  // Obtiene los programas seleccionados
  const programas = typeof getProgramasSeleccionados === 'function'
    ? getProgramasSeleccionados()
    : [...document.querySelectorAll("#docProgramas input:checked")].map(cb => cb.value || cb.closest("label").textContent.trim());

  // Captura los horarios desde las filas dinámicas
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
  } else if (!/^\d{6,11}$/.test(datos.cedula)) {
    ponerError("docCedula", "Solo números, entre 6 y 11 dígitos");
    hayError = true;
  }
  if (datos.telefono && !/^\d{7,10}$/.test(datos.telefono)) {
    ponerError("docTelefono", "Entre 7 y 10 números");
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

// Valida y guarda el perfil del administrador
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
  } else if (!/^\d{6,11}$/.test(datos.cedula)) {
    ponerError("admCedula", "Solo números, entre 6 y 11 dígitos");
    hayError = true;
  }
  if (datos.telefono && !/^\d{7,10}$/.test(datos.telefono)) {
    ponerError("admTelefono", "Entre 7 y 10 números");
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

// Carga y renderiza la página de perfil del usuario
async function cargarMiPerfil() {
  let perfil = perfilStorage.getPerfil();
  const idSesion = sesion?.id || authStorage.getSesion()?.id;

  // Consulta el API si la caché no corresponde al usuario actual o no tiene fotos
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

  // Rellena los datos básicos del encabezado
  document.getElementById("perfilHeroNombre").textContent =
    `${escaparHtml(perfil.nombres)} ${escaparHtml(perfil.apellidos)}`;
  document.getElementById("perfilHeroCorreo").textContent = perfil.correo;
  document.getElementById("perfilHeroRol").textContent = perfil.rol;

  // Resuelve la foto de perfil dando prioridad al servidor sobre la caché local
  const fotoPerfilServidor = perfil.fotos?.foto_perfil || "";
  const fotoPerfilLocal    = perfilStorage.getFotoPerfil();
  const fotoPerfil = fotoPerfilServidor || fotoPerfilLocal || "";

  // Sincroniza la caché local con la foto del servidor
  if (fotoPerfilServidor) {
    perfilStorage.setFotoPerfil(fotoPerfilServidor);
  }

  // La foto empieza con la clase «oculto» (display:none !important): hay que quitarla, el style.display no basta.
  const imgPerfil = document.getElementById("perfilFotoImg");
  const iniciales = document.getElementById("perfilFotoIniciales");
  if (fotoPerfil && imgPerfil && iniciales) {
    imgPerfil.src = fotoPerfil;
    imgPerfil.classList.remove("oculto");
    iniciales.classList.add("oculto");
  } else if (iniciales && imgPerfil) {
    imgPerfil.classList.add("oculto");
    iniciales.classList.remove("oculto");
    iniciales.textContent = sesion?.inicial || "?";
  }
  aplicarFotoAvatar(fotoPerfil);

  // Resuelve la foto de portada con la misma lógica
  const fotoPortadaServidor = perfil.fotos?.foto_portada || "";
  const fotoPortadaLocal    = perfilStorage.getFotoPortada();
  const fotoPortada = fotoPortadaServidor || fotoPortadaLocal || "";

  if (fotoPortadaServidor) {
    perfilStorage.setFotoPortada(fotoPortadaServidor);
  }

  const imgPortada = document.getElementById("perfilPortadaImg");
  if (imgPortada) {
    if (fotoPortada) imgPortada.src = fotoPortada;
    imgPortada.classList.toggle("oculto", !fotoPortada);
  }

  // RF027 — Muestra un aviso si el perfil está incompleto
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

  // Renderiza el contenido según el rol
  if (perfil.rol === "estudiante")
    contenedor.innerHTML = avisoHTML + perfilEstudianteHTML(perfil);
  else if (perfil.rol === "docente")
    contenedor.innerHTML = avisoHTML + perfilDocenteHTML(perfil);
  else contenedor.innerHTML = avisoHTML + perfilAdminHTML(perfil);
}

// RF027 — Detecta si el perfil está incompleto según el rol
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

// Arma una sección del perfil con cabecera y cuerpo con espacio interno; antes el contenido pegaba con el borde.
function seccionPerfil(titulo, cuerpo) {
  return `
    <div class="perfil-seccion">
      <div class="perfil-seccion__cabecera"><h3 class="perfil-seccion__titulo">${titulo}</h3></div>
      <div class="perfil-seccion__cuerpo">${cuerpo}</div>
    </div>`;
}

function perfilEstudianteHTML(p) {
  const d = p.perfil || {};
  const promedio = parseFloat(d.promedio) || 0;
  const textoPromedio = promedio > 0 ? promedio.toFixed(1) : "Sin registrar";
  const enAlerta = promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO;

  // RF031 — Calcula la barra de progreso de créditos
  const semestre = parseInt(d.semestre) || 0;
  const totalCreditos = 160;
  const creditosAprobados = Math.min(semestre * 16, totalCreditos);
  const porcentajeCreditos = Math.round(
    (creditosAprobados / totalCreditos) * 100,
  );
  const colorBarra = porcentajeCreditos < 50 ? "#f39200" : "#22c55e";

  return (
    seccionPerfil("Datos Académicos", `
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">N° Documento</span><span>${escaparHtml(d.documento || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Programa</span><span>${escaparHtml(d.programa || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Semestre</span><span>${escaparHtml(d.semestre || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Promedio</span>
          <span class="${enAlerta ? "texto-naranja" : ""}">${textoPromedio}${enAlerta ? " ⚠️" : ""}</span>
          <small style="display:block;color:#94a3b8;font-size:11px">Lo registra la universidad</small>
        </div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${escaparHtml(d.telefono || "—")}</span></div>
      </div>`) +
    seccionPerfil("📚 Avance del Programa Académico", `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;color:#555">
        <span><strong>${creditosAprobados}</strong> de ${totalCreditos} créditos aprobados</span>
        <span style="color:${colorBarra};font-weight:700">${porcentajeCreditos}%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:8px;height:14px;overflow:hidden">
        <div style="width:${porcentajeCreditos}%;height:100%;background:linear-gradient(90deg,${colorBarra},${colorBarra}cc);border-radius:8px;transition:width 0.6s ease"></div>
      </div>
      <p style="margin-top:10px;font-size:12px;color:#777">
        Estimado a partir del semestre actual · 16 créditos por semestre
      </p>`)
  );
}

function perfilDocenteHTML(p) {
  const d = p.perfil || {};
  const asig = escaparHtml((d.asignaturas || []).join(", ") || "—");
  const progs = escaparHtml((d.programas || []).join(", ") || "—");
  const horarios = d.horarios || [];

  const horariosHTML = horarios.length > 0
    ? horarios.map(h => `
        <div style="background:#f0f9fb;border-left:3px solid #007b99;padding:10px;border-radius:6px">
          <div style="font-weight:700;color:#007b99;font-size:13px">${escaparHtml(h.dia)}</div>
          <div style="font-size:12px;color:#333;margin-top:4px">${escaparHtml(h.hora_inicio)} – ${escaparHtml(h.hora_fin)}</div>
          <div style="font-size:11px;color:#777">${escaparHtml(h.lugar || 'Por definir')}</div>
        </div>`).join("")
    : '<p style="color:#999;font-size:13px;padding:8px 0">Sin horarios registrados aún.</p>';

  // Obtiene las últimas 4 tutorías
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
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee">
          <div>
            <div style="font-weight:600;font-size:13px">${escaparHtml(t.asignatura || "—")}</div>
            <div style="font-size:11px;color:#777">${escaparHtml(t.nombre_estudiante || "Estudiante")} · ${formatearFecha(t.fecha)}</div>
          </div>
          <span class="insignia ${t.estado === "pendiente" ? "insignia--alerta" : "insignia--activo"}">${escaparHtml(t.estado || "pendiente")}</span>
        </div>`,
          )
          .join("");

  return (
    seccionPerfil("Datos del Docente", `
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">Cédula</span><span>${escaparHtml(d.cedula || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Facultad</span><span>${escaparHtml(d.facultad || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${escaparHtml(d.telefono || "—")}</span></div>
        <div class="perfil-dato" style="grid-column:1/-1"><span class="perfil-dato__label">Programas que atiende</span><span>${progs}</span></div>
        <div class="perfil-dato" style="grid-column:1/-1"><span class="perfil-dato__label">Materias</span><span>${asig}</span></div>
      </div>`) +
    seccionPerfil("🕒 Horarios Disponibles", `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px">
        ${horariosHTML}
      </div>
      <button class="btn-secundario" style="margin-top:12px;font-size:12px" onclick="irAPagina('completar-perfil')">✏️ Editar perfil y horarios</button>`) +
    seccionPerfil("📋 Últimas Tutorías", tutoriasHTML)
  );
}

function perfilAdminHTML(p) {
  const d = p.perfil || {};
  // RF034 — La actividad reciente sale de la auditoría; antes eran acciones de ejemplo que nunca pasaron.
  setTimeout(cargarActividadAdmin, 0);

  return (
    seccionPerfil("Datos del Administrador", `
      <div class="perfil-datos-grilla">
        <div class="perfil-dato"><span class="perfil-dato__label">Cédula</span><span>${escaparHtml(d.cedula || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Cargo</span><span>${escaparHtml(d.cargo || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Dependencia</span><span>${escaparHtml(d.dependencia || "—")}</span></div>
        <div class="perfil-dato"><span class="perfil-dato__label">Teléfono</span><span>${escaparHtml(d.telefono || "—")}</span></div>
      </div>`) +
    seccionPerfil("📜 Actividad Reciente", '<div id="perfilActividadAdmin"><p class="sin-datos">Cargando…</p></div>')
  );
}

// Muestra las últimas acciones del administrador registradas en la auditoría.
async function cargarActividadAdmin() {
  const contenedor = document.getElementById("perfilActividadAdmin");
  if (!contenedor) return;
  try {
    const eventos = await llamarAPI("/admin/auditoria?mios=1", "GET");
    if (!eventos.length) {
      contenedor.innerHTML = '<p class="sin-datos">Aún no hay acciones registradas.</p>';
      return;
    }
    contenedor.innerHTML = eventos.slice(0, 6).map((e) => {
      const evento = typeof EVENTOS_AUDITORIA !== "undefined" ? EVENTOS_AUDITORIA[e.evento] : null;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #eee">
          <div style="width:36px;height:36px;border-radius:50%;background:#007b9920;display:flex;align-items:center;justify-content:center;font-size:16px">${evento ? evento.icono : "📝"}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px;color:#333">${escaparHtml(evento ? evento.texto : e.evento)}${e.detalle ? " — " + escaparHtml(e.detalle) : ""}</div>
            <div style="font-size:11px;color:#777">${formatearTiempo(e.creada_en)}</div>
          </div>
        </div>`;
    }).join("");
  } catch (err) {
    contenedor.innerHTML = '<p class="sin-datos">No se pudo cargar la actividad.</p>';
  }
}

// Pone la foto en los avatares del encabezado y del menú, o las iniciales si no hay foto.
function aplicarFotoAvatar(foto) {
  const valida = typeof foto === "string" && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(foto);
  ["chipAvatar", "barraAvatar"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (valida) {
      el.style.backgroundImage = `url("${foto}")`;
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = sesion?.inicial || "?";
    }
  });
}

// Al entrar, trae la foto guardada para que el encabezado no quede con las iniciales.
async function cargarFotoAvatar() {
  let foto = perfilStorage.getFotoPerfil();
  if (!foto) {
    try {
      const perfil = await llamarAPI("/perfil", "GET");
      foto = perfil?.fotos?.foto_perfil || "";
      if (foto) perfilStorage.setFotoPerfil(foto);
    } catch (err) {
      foto = "";
    }
  }
  aplicarFotoAvatar(foto);
}

// Comprime una imagen hasta un máximo de maxKB kilobytes
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

        // Reduce la calidad hasta que la imagen quepa en maxKB
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

// Comprime la foto elegida, la previsualiza y la sube al servidor
// RF036 fija 2 MB; antes la imagen se reducía en silencio y el límite nunca se aplicaba (DEF-03).
const LIMITE_FOTO_BYTES = 2 * 1024 * 1024;

// Rechaza lo que no es imagen o pesa más de 2 MB; devuelve true si el archivo sirve.
function fotoAceptable(input, archivo) {
  if (!archivo.type || !archivo.type.startsWith("image/")) {
    mostrarTostada("El archivo debe ser una imagen (JPG, PNG o WebP)", "error");
    input.value = "";
    return false;
  }
  if (archivo.size > LIMITE_FOTO_BYTES) {
    const mb = (archivo.size / 1048576).toFixed(1).replace(".", ",");
    mostrarTostada(`La imagen pesa ${mb} MB y el máximo permitido es 2 MB`, "error");
    input.value = "";
    return false;
  }
  return true;
}

function subirFotoPerfil(input) {
  const archivo = input.files[0];
  if (!archivo) return;
  if (!fotoAceptable(input, archivo)) return;

  mostrarTostada("⏳ Procesando foto...", "info");

  comprimirImagen(archivo, 400, 300).then(async function(base64) {
    var img = document.getElementById("perfilFotoImg");
    var iniciales = document.getElementById("perfilFotoIniciales");
    if (img) { img.src = base64; img.classList.remove("oculto"); }
    if (iniciales) iniciales.classList.add("oculto");
    aplicarFotoAvatar(base64);

    try { perfilStorage.setFotoPerfil(base64); } catch(e) { console.warn("localStorage lleno"); }

    try {
      await llamarAPI("/perfil/foto", "POST", { foto_base64: base64, tipo: "perfil" });
      mostrarTostada("✅ Foto de perfil actualizada", "exito");
      perfilStorage.clearPerfil();
    } catch (err) {
      mostrarTostada("⚠️ Foto guardada localmente. Sin conexión con servidor.", "advertencia");
    }
  });
}

// Comprime la portada elegida y la sube al servidor
function subirPortada(input) {
  const archivo = input.files[0];
  if (!archivo) return;
  if (!fotoAceptable(input, archivo)) return;

  mostrarTostada("⏳ Procesando portada...", "info");

  comprimirImagen(archivo, 1200, 400).then(async function(base64) {
    var img = document.getElementById("perfilPortadaImg");
    if (img) { img.src = base64; img.classList.remove("oculto"); }

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
