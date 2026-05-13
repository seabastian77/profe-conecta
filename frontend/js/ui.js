// ── CARGAR PANEL ESTUDIANTE ─────────────────────────────
async function cargarPanelEstudiante() {
  const perfil = perfilStorage.getPerfil();
  const nombre = perfil ? `${perfil.nombres}` : sesion.nombre.split(" ")[0];
  const datosPerfil = perfil?.perfil || {};

  document.getElementById("estudianteSaludo").textContent = nombre;

  // Estadísticas rápidas (RF038)
  const promedio = parseFloat(datosPerfil.promedio) || 0;
  document.getElementById("panelEstPromedio").textContent =
    promedio > 0 ? promedio.toFixed(1) : "—";
  document.getElementById("panelEstSemestre").textContent = datosPerfil.semestre
    ? `${datosPerfil.semestre}°`
    : "—";

  // Cargar tutorías del servidor
  const tutorias = await cargarTutorias();

  // RF040 — contar tutorías del mes en curso
  const hoy = new Date();
  const tutoriasMes = tutorias.filter((t) => {
    if (!t.fecha) return false;
    const f = new Date(t.fecha + "T00:00");
    return (
      f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear()
    );
  }).length;
  document.getElementById("estTutoriasCount").textContent = tutoriasMes;

  // RF039 — alerta por promedio bajo
  const tarjetaAlerta = document.getElementById("estAlertaTarjeta");
  const iconoAlerta = document.getElementById("estAlertaIcono");
  const valorAlerta = document.getElementById("estAlertaValor");
  if (promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO) {
    iconoAlerta.textContent = "⚠️";
    iconoAlerta.classList.add("naranja");
    valorAlerta.textContent = "Activa";
    valorAlerta.style.color = "#ef4444";
    tarjetaAlerta.style.borderLeft = "4px solid #ef4444";
    mostrarAvisoAlertaEstudiante();
  } else {
    iconoAlerta.textContent = "✅";
    valorAlerta.textContent = "Sin";
    valorAlerta.style.color = "";
    tarjetaAlerta.style.borderLeft = "";
    quitarAvisoAlertaEstudiante();
  }

  // Mostrar tarjetas
  const lista = document.getElementById("estListaTutorias");
  if (tutorias.length === 0) {
    lista.innerHTML =
      '<p class="sin-datos">No tienes tutorías programadas. ¡Programa una!</p>';
    document.getElementById("estTutoriasSubtitulo").textContent =
      "Sin tutorías";
  } else {
    lista.innerHTML = tutorias
      .map((t) => tarjetaTutoriaHTML(t, "estudiante"))
      .join("");
    document.getElementById("estTutoriasSubtitulo").textContent =
      `${tutorias.length} tutoría(s) registradas — ${tutoriasMes} este mes`;
  }

  renderizarGrafica(datosPerfil, tutorias);
  renderizarCalendario("est", tutorias);
}

// RF039 — banner de aviso cuando el promedio está bajo
function mostrarAvisoAlertaEstudiante() {
  if (document.getElementById("avisoAlertaEst")) return;
  const banner = document.createElement("div");
  banner.id = "avisoAlertaEst";
  banner.className = "aviso-naranja";
  banner.style.margin = "16px 0";
  banner.innerHTML =
    '<span>⚠️</span><p><strong>Alerta académica activa:</strong> tu promedio está por debajo del mínimo (3.0). Te recomendamos <a href="#" onclick="irAPagina(\'programar-tutoria\'); return false;" class="texto-naranja"><strong>programar una tutoría</strong></a> lo antes posible.</p>';
  const franja = document.querySelector(
    "#pagina-panel-estudiante .franja-estadisticas",
  );
  if (franja && franja.parentNode) {
    franja.parentNode.insertBefore(banner, franja.nextSibling);
  }
}

function quitarAvisoAlertaEstudiante() {
  const banner = document.getElementById("avisoAlertaEst");
  if (banner) banner.remove();
}

// ── CARGAR PANEL DOCENTE ────────────────────────────────
async function cargarPanelDocente() {
  const perfil = perfilStorage.getPerfil();
  const nombre = perfil ? `${perfil.nombres}` : sesion.nombre.split(" ")[0];

  document.getElementById("docenteSaludo").textContent = nombre;

  const tutorias = await cargarTutorias();

  // RF043 — métricas dinámicas del docente
  // Tutorías del mes actual
  const hoy = new Date();
  const tutoriasMes = tutorias.filter((t) => {
    if (!t.fecha) return false;
    const f = new Date(t.fecha + "T00:00");
    return (
      f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear()
    );
  });
  document.getElementById("docTutoriasMes").textContent = tutoriasMes.length;

  // Estudiantes únicos atendidos
  const estudiantesUnicos = [...new Set(tutorias.map((t) => t.estudiante_id))];
  document.getElementById("docEstudiantesCount").textContent =
    estudiantesUnicos.length;

  // RF024 — tasa de recuperación académica + RF044 — lista alertas
  const estudiantesEnAlerta = obtenerEstudiantesEnAlerta(tutorias);
  document.getElementById("docAlertasCount").textContent =
    estudiantesEnAlerta.length;

  const totalEstudiantes = Math.max(estudiantesUnicos.length, 1);
  const enRecuperacion = totalEstudiantes - estudiantesEnAlerta.length;
  const tasaRecuperacion = Math.round((enRecuperacion / totalEstudiantes) * 100);
  document.getElementById("docRecuperacion").textContent =
    estudiantesUnicos.length > 0 ? tasaRecuperacion + "%" : "—";

  // Mostrar tarjetas
  const lista = document.getElementById("docListaTutorias");
  if (tutorias.length === 0) {
    lista.innerHTML =
      '<p class="sin-datos">No tienes tutorías programadas.</p>';
    document.getElementById("docTutoriasSubtitulo").textContent =
      "Sin tutorías";
  } else {
    lista.innerHTML = tutorias
      .map((t) => tarjetaTutoriaHTML(t, "docente"))
      .join("");
    document.getElementById("docTutoriasSubtitulo").textContent =
      `${tutorias.length} tutoría(s) — ${tutoriasMes.length} este mes`;
  }

  // RF044 — renderizar lista de alertas
  renderizarAlertasDocente(estudiantesEnAlerta);

  renderizarCalendario("doc", tutorias);
}

// RF044 — Construir lista de estudiantes en alerta a partir de tutorías
function obtenerEstudiantesEnAlerta(tutorias) {
  // Agrupar por estudiante
  const porEstudiante = {};
  tutorias.forEach((t) => {
    if (!t.estudiante_id) return;
    if (!porEstudiante[t.estudiante_id]) {
      porEstudiante[t.estudiante_id] = {
        id: t.estudiante_id,
        nombre: t.nombre_estudiante || "Estudiante",
        sesiones: 0,
        ultima: null,
        asignaturas: new Set(),
        // Promedio simulado: a partir del id (estable entre cargas)
        promedio: 2.0 + ((t.estudiante_id * 7) % 15) / 10,
      };
    }
    porEstudiante[t.estudiante_id].sesiones++;
    porEstudiante[t.estudiante_id].asignaturas.add(t.asignatura);
    if (
      !porEstudiante[t.estudiante_id].ultima ||
      t.fecha > porEstudiante[t.estudiante_id].ultima
    ) {
      porEstudiante[t.estudiante_id].ultima = t.fecha;
    }
  });

  return Object.values(porEstudiante)
    .filter((e) => e.promedio < CONFIG.PROMEDIO_MINIMO)
    .sort((a, b) => a.promedio - b.promedio);
}

// RF044 — Renderizar lista visual de estudiantes en alerta
function renderizarAlertasDocente(estudiantes) {
  const lista = document.getElementById("docListaAlertas");
  if (!lista) return;

  if (estudiantes.length === 0) {
    lista.innerHTML =
      '<p class="sin-datos">Ningún estudiante en alerta. ¡Buen trabajo!</p>';
    return;
  }

  lista.innerHTML = estudiantes
    .map((e) => {
      // Color por nivel de riesgo
      let nivel, color, etiqueta;
      if (e.promedio < 2.5) {
        nivel = "critico";
        color = "#ef4444";
        etiqueta = "🔴 Crítico";
      } else if (e.promedio < 2.8) {
        nivel = "alto";
        color = "#f97316";
        etiqueta = "🟠 Alto";
      } else {
        nivel = "moderado";
        color = "#eab308";
        etiqueta = "🟡 Moderado";
      }

      const inicial = (e.nombre[0] || "?").toUpperCase();
      const asignaturas = [...e.asignaturas].slice(0, 2).join(", ") || "—";

      return `
        <div class="tarjeta-tutoria" style="border-left:4px solid ${color}">
          <div class="tarjeta-tutoria__cuerpo">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <div style="width:36px;height:36px;border-radius:50%;background:${color};color:white;display:flex;align-items:center;justify-content:center;font-weight:700">${inicial}</div>
              <div>
                <div class="tarjeta-tutoria__asig">${e.nombre}</div>
                <div class="tarjeta-tutoria__meta" style="color:${color};font-weight:600">${etiqueta}</div>
              </div>
            </div>
            <div class="tarjeta-tutoria__meta">Promedio: <strong style="color:${color}">${e.promedio.toFixed(1)}</strong></div>
            <div class="tarjeta-tutoria__meta">${e.sesiones} sesión(es) · ${asignaturas}</div>
          </div>
        </div>`;
    })
    .join("");
}

// ── MEDIDOR DE RENDIMIENTO (SVG) ────────────────────────
// Muestra el promedio actual del estudiante en un medidor tipo gauge,
// con el umbral de 3.0 marcado. Debajo muestra estadísticas REALES
// calculadas a partir de las tutorías del estudiante.
function renderizarGrafica(perfil, tutorias) {
  const wrap = document.getElementById("estGraficaWrap");
  const pie = document.getElementById("estGraficaPie");
  if (!wrap || !pie) return;

  const promedio = parseFloat(perfil.promedio) || 0;
  const minimo = CONFIG.PROMEDIO_MINIMO;
  const maximo = 5.0;

  // Color y etiqueta según el nivel
  let color, etiqueta, icono;
  if (promedio === 0) {
    color = "#9ca3af";
    etiqueta = "Sin calificaciones registradas";
    icono = "❓";
  } else if (promedio < minimo) {
    color = "#ef4444";
    etiqueta = "En alerta académica";
    icono = "⚠️";
  } else if (promedio < 3.8) {
    color = "#f39200";
    etiqueta = "Rendimiento aceptable";
    icono = "📊";
  } else if (promedio < 4.5) {
    color = "#22c55e";
    etiqueta = "Buen rendimiento";
    icono = "👍";
  } else {
    color = "#16a34a";
    etiqueta = "Excelente rendimiento";
    icono = "🏆";
  }

  // Geometría del medidor (semicírculo)
  const W = 560,
    H = 240;
  const cx = W / 2,
    cy = 180,
    r = 130;
  const angIni = Math.PI; //  180° — izquierda
  const angFin = 2 * Math.PI; // 360° — derecha

  function pol(ang) {
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
  }
  function arco(a1, a2) {
    const p1 = pol(a1),
      p2 = pol(a2);
    const largo = a2 - a1 > Math.PI ? 1 : 0;
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largo} 1 ${p2.x} ${p2.y}`;
  }

  const angPromedio = angIni + (promedio / maximo) * Math.PI;
  const angMinimo = angIni + (minimo / maximo) * Math.PI;

  const pMin = pol(angMinimo);
  const cosMin = Math.cos(angMinimo);
  const senMin = Math.sin(angMinimo);

  let svg = `<svg viewBox="0 0 ${W} ${H}" class="grafica-svg">
    <!-- Arco de fondo (gris claro) -->
    <path d="${arco(angIni, angFin)}" fill="none" stroke="#e5e7eb" stroke-width="20" stroke-linecap="round"/>

    <!-- Zona de alerta (0 a 3.0) en rojo tenue -->
    <path d="${arco(angIni, angMinimo)}" fill="none" stroke="#fecaca" stroke-width="20" stroke-linecap="round"/>

    <!-- Arco del promedio actual, solo si hay promedio -->
    ${
      promedio > 0
        ? `<path d="${arco(angIni, angPromedio)}" fill="none" stroke="${color}" stroke-width="20" stroke-linecap="round"/>`
        : ""
    }

    <!-- Marca del umbral 3.0 -->
    <line x1="${pMin.x - 16 * cosMin}" y1="${pMin.y - 16 * senMin}"
          x2="${pMin.x + 16 * cosMin}" y2="${pMin.y + 16 * senMin}"
          stroke="#f39200" stroke-width="3"/>
    <text x="${pMin.x + 28 * cosMin}" y="${pMin.y + 28 * senMin + 4}"
          font-size="12" fill="#f39200" font-weight="700" text-anchor="middle">3.0</text>

    <!-- Extremos de escala -->
    <text x="${pol(angIni).x - 14}" y="${pol(angIni).y + 6}"
          font-size="13" fill="#9ca3af" text-anchor="end" font-weight="600">0.0</text>
    <text x="${pol(angFin).x + 14}" y="${pol(angFin).y + 6}"
          font-size="13" fill="#9ca3af" font-weight="600">5.0</text>

    <!-- Número grande: promedio actual -->
    <text x="${cx}" y="${cy - 24}" text-anchor="middle"
          font-size="64" font-weight="800" fill="${color}">${promedio > 0 ? promedio.toFixed(1) : "—"}</text>

    <!-- Subtítulo -->
    <text x="${cx}" y="${cy + 2}" text-anchor="middle"
          font-size="13" fill="#6b7280" font-weight="700" letter-spacing="1">PROMEDIO ACTUAL</text>
    <text x="${cx}" y="${cy + 26}" text-anchor="middle"
          font-size="13" fill="${color}" font-weight="600">${icono} ${etiqueta}</text>
  </svg>`;

  wrap.innerHTML = svg;

  // ── Estadísticas REALES desde las tutorías ──
  const completadas = tutorias.filter(
    (t) => t.estado === "completada" || t.estado === "realizada",
  ).length;
  const pendientes = tutorias.filter((t) => t.estado === "pendiente").length;
  const canceladas = tutorias.filter((t) => t.estado === "cancelada").length;

  // Contar asignaturas distintas
  const asignaturasUnicas = new Set(
    tutorias.filter((t) => t.estado !== "cancelada").map((t) => t.asignatura),
  );

  pie.innerHTML = `
    <div class="grafica-pie__item">
      <span class="grafica-pie__val" style="color:#22c55e">${completadas}</span>
      <span class="grafica-pie__lbl">Sesiones completadas</span>
    </div>
    <div class="grafica-pie__item">
      <span class="grafica-pie__val" style="color:#007b99">${pendientes}</span>
      <span class="grafica-pie__lbl">Pendientes</span>
    </div>
    <div class="grafica-pie__item">
      <span class="grafica-pie__val" style="color:#f39200">${asignaturasUnicas.size}</span>
      <span class="grafica-pie__lbl">Asignaturas con apoyo</span>
    </div>
  `;
}

// ── CALENDARIO VISUAL ───────────────────────────────────
const _calEstado = {}; // estado por prefijo ('est' | 'doc')

function renderizarCalendario(prefijo, tutorias) {
  if (!_calEstado[prefijo]) {
    const hoy = new Date();
    _calEstado[prefijo] = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
  }
  _renderizarMes(prefijo, tutorias);
}

function navegarCalendario(prefijo, delta) {
  const estado = _calEstado[prefijo];
  if (!estado) return;

  estado.mes += delta;
  if (estado.mes > 11) {
    estado.mes = 0;
    estado.anio++;
  }
  if (estado.mes < 0) {
    estado.mes = 11;
    estado.anio--;
  }

  const tutorias = academicoStorage.getTutorias();
  _renderizarMes(prefijo, tutorias);
}

function _renderizarMes(prefijo, tutorias) {
  const estado = _calEstado[prefijo];
  const { anio, mes } = estado;

  const hoy = new Date();
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const diaSemana = primerDia.getDay();
  const nombresMeses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  // Marcar días con tutorías
  const diasConTutoria = new Set(
    tutorias
      .filter((t) => {
        const f = new Date(t.fecha + "T00:00");
        return (
          f.getFullYear() === anio &&
          f.getMonth() === mes &&
          t.estado !== "cancelada"
        );
      })
      .map((t) => new Date(t.fecha + "T00:00").getDate()),
  );

  // Título del calendario
  const titulo = document
    .getElementById(`${prefijo}CalendarioGrilla`)
    ?.closest(".calendario-wrap")
    ?.querySelector(".calendario-titulo");
  if (titulo) titulo.textContent = `📅 ${nombresMeses[mes]} ${anio}`;

  let html = "";

  // Celdas vacías antes del primer día
  for (let i = 0; i < diaSemana; i++) {
    html += '<div class="calendario-celda otro-mes"></div>';
  }

  for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
    const esHoy =
      dia === hoy.getDate() &&
      mes === hoy.getMonth() &&
      anio === hoy.getFullYear();
    const conTut = diasConTutoria.has(dia);
    const clases = [
      "calendario-celda",
      esHoy ? "hoy" : "",
      conTut ? "con-tutoria" : "",
    ]
      .join(" ")
      .trim();

    html += `
      <div class="${clases}" onclick="seleccionarDia('${prefijo}', ${dia})">
        <span class="calendario-celda__num">${dia}</span>
        ${conTut ? '<span class="calendario-celda__punto"></span>' : ""}
      </div>`;
  }

  const grilla = document.getElementById(`${prefijo}CalendarioGrilla`);
  if (grilla) grilla.innerHTML = html;
}

function seleccionarDia(prefijo, dia) {
  const estado = _calEstado[prefijo];
  const tutorias = academicoStorage.getTutorias();
  const { anio, mes } = estado;

  // Marcar la celda seleccionada
  document
    .querySelectorAll(`#${prefijo}CalendarioGrilla .calendario-celda`)
    .forEach((c) => c.classList.remove("seleccionada"));

  // Buscar tutorías de ese día
  const fechaStr = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const del_dia = tutorias.filter(
    (t) => t.fecha === fechaStr && t.estado !== "cancelada",
  );

  const detalle = document.getElementById(`${prefijo}CalendarioDetalle`);
  const fechaDiv = document.getElementById(`${prefijo}DetalleFecha`);
  const listaDiv = document.getElementById(`${prefijo}DetalleLista`);

  if (!detalle) return;

  detalle.classList.remove("oculto");
  const nombresMeses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  if (fechaDiv) fechaDiv.textContent = `${dia} de ${nombresMeses[mes]}`;

  if (del_dia.length === 0) {
    listaDiv.innerHTML = '<p class="sin-datos">Sin tutorías este día</p>';
    return;
  }

  listaDiv.innerHTML = del_dia
    .map(
      (t) => `
    <div class="calendario-evento">
      <span class="calendario-evento__hora">${t.hora?.slice(0, 5)}</span>
      <div class="calendario-evento__info">
        <div class="calendario-evento__asig">${t.asignatura}</div>
        <div class="calendario-evento__meta">
          ${t.nombre_docente || t.nombre_estudiante || ""} · 
          <span class="calendario-evento__modo">${iconoModalidad(t.modalidad)} ${t.modalidad}</span>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ── NOTIFICACIONES ──────────────────────────────────────
async function cargarNotificaciones() {
  if (!sesion.activa) return;

  try {
    const notifs = await llamarAPI("/notificaciones", "GET");
    const noLeidas = notifs.filter((n) => !n.leida).length;
    const badge = document.getElementById("campanaBadge");

    if (noLeidas > 0) {
      badge.textContent = noLeidas > 99 ? "99+" : noLeidas;
      badge.classList.remove("oculto");
    } else {
      badge.classList.add("oculto");
    }

    // Renderizar en el panel de notificaciones
    const lista = document.getElementById("notifLista");
    if (!lista) return;

    if (notifs.length === 0) {
      lista.innerHTML =
        '<div class="notif-vacia">No tienes notificaciones</div>';
      return;
    }

    lista.innerHTML = notifs
      .slice(0, 20)
      .map(
        (n) => `
      <div class="notif-item ${n.leida ? "" : "no-leida"}" onclick="leerNotif(${n.id})">
        <div class="notif-item__icono">${n.icono || "🔔"}</div>
        <div class="notif-item__cuerpo">
          <div class="notif-item__titulo">${n.titulo}</div>
          <div class="notif-item__desc">${n.descripcion || ""}</div>
          <div class="notif-item__tiempo">${formatearTiempo(n.creada_en)}</div>
        </div>
        ${!n.leida ? '<span class="notif-item__punto"></span>' : ""}
      </div>
    `,
      )
      .join("");
  } catch (err) {
    // Si no hay backend, no romper la app
    console.warn("No se pudieron cargar notificaciones:", err);
  }
}

function alternarNotificaciones() {
  const panel = document.getElementById("notifPanel");
  panel.classList.toggle("oculto");

  if (!panel.classList.contains("oculto")) {
    document.addEventListener("click", cerrarNotifFuera, { once: true });
  }
}

function cerrarNotifFuera(e) {
  const panel = document.getElementById("notifPanel");
  if (!panel.contains(e.target) && e.target.id !== "botonCampana") {
    panel.classList.add("oculto");
  }
}

async function leerNotif(id) {
  try {
    await llamarAPI(`/notificaciones/${id}/leer`, "PATCH");
    cargarNotificaciones();
  } catch (err) {
    console.warn("Error marcando notificación:", err);
  }
}

async function marcarTodasLeidas() {
  try {
    await llamarAPI("/notificaciones/leer-todas", "PATCH");
    cargarNotificaciones();
  } catch (err) {
    console.warn("Error:", err);
  }
}

// ── TOSTADA (TOAST) ─────────────────────────────────────
function mostrarTostada(mensaje, tipo) {
  const tostada = document.getElementById("tostada");
  tostada.textContent = mensaje;
  tostada.className = "tostada tostada--visible";

  if (tipo === "error") tostada.classList.add("tostada--error");
  if (tipo === "alerta") tostada.classList.add("tostada--alerta");

  clearTimeout(window._tostadaTimer);
  window._tostadaTimer = setTimeout(
    () => tostada.classList.remove("tostada--visible"),
    3500,
  );
}

// ── UTILIDADES ──────────────────────────────────────────
function formatearFecha(isoFecha) {
  if (!isoFecha) return "—";
  const [y, m, d] = isoFecha.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function formatearTiempo(isoFecha) {
  if (!isoFecha) return "";
  const diff = Math.floor((Date.now() - new Date(isoFecha).getTime()) / 60000);
  if (diff < 1) return "Ahora mismo";
  if (diff < 60) return `Hace ${diff} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff / 60)}h`;
  return `Hace ${Math.floor(diff / 1440)} días`;
}
