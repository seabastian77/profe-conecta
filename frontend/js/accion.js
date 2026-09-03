// ── Acción destacada (dirección C) ───────────────────────────
// Calcula, según el estado real del usuario, la única cosa más importante que
// debería hacer ahora, y la pinta como una tarjeta al inicio de su panel.
// Un panel que dice "programa una tutoría, tu promedio está bajo" guía mejor
// que uno que solo muestra cifras.

// Devuelve la próxima tutoría pendiente (fecha futura), o null.
function proximaTutoria(tutorias) {
  const ahora = new Date();
  const futuras = (tutorias || [])
    .filter((t) => t.estado === "pendiente" || t.estado === "confirmada")
    .map((t) => ({ ...t, cuando: new Date(`${t.fecha}T${(t.hora || "00:00").slice(0, 5)}`) }))
    .filter((t) => !isNaN(t.cuando) && t.cuando >= ahora)
    .sort((a, b) => a.cuando - b.cuando);
  return futuras[0] || null;
}

// Formatea una fecha ISO (yyyy-mm-dd) como "jueves 4 de septiembre".
function fechaLegible(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

// Pinta la tarjeta. `datos` define tono, textos, chips y (opcional) el botón.
function renderAccion(idContenedor, datos) {
  const cont = document.getElementById(idContenedor);
  if (!cont) return;

  const tono = datos.tono || "info"; // alerta | info | ok
  const chips = (datos.chips || [])
    .map((c) => `<span class="accion-chip accion-chip--${c.tipo}">${c.texto}</span>`)
    .join("");

  const boton = datos.boton
    ? `<button type="button" class="accion-destacada__boton"
         onclick="irAPagina('${datos.boton.pagina}')">${datos.boton.texto}</button>`
    : "";

  cont.className = `accion-destacada accion-destacada--${tono}`;
  cont.hidden = false;
  cont.innerHTML = `
    <div class="accion-destacada__icono">${datos.icono || "📌"}</div>
    <div class="accion-destacada__texto">
      <span class="accion-destacada__eyebrow">${datos.eyebrow || ""}</span>
      <h2 class="accion-destacada__titulo">${datos.titulo}</h2>
      ${datos.sub ? `<p class="accion-destacada__sub">${datos.sub}</p>` : ""}
      ${chips ? `<div class="accion-chips">${chips}</div>` : ""}
    </div>
    ${boton}
  `;
}

// ── Estudiante ───────────────────────────────────────────────
function accionEstudiante({ promedio, tutorias, tutoriasMes }) {
  const enAlerta = promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO;
  const prox = proximaTutoria(tutorias);
  const pendientes = (tutorias || []).filter((t) => t.estado === "pendiente").length;
  const hechas = (tutorias || []).filter((t) => t.estado === "completada").length;

  const chips = [];
  if (pendientes) chips.push({ tipo: "pend", texto: `${pendientes} pendiente${pendientes > 1 ? "s" : ""}` });
  if (hechas) chips.push({ tipo: "ok", texto: `${hechas} realizada${hechas > 1 ? "s" : ""}` });
  if (enAlerta) chips.push({ tipo: "aler", texto: "Alerta académica" });

  if (enAlerta) {
    return {
      tono: "alerta", icono: "⚠️", eyebrow: "Requiere tu atención",
      titulo: "Tu promedio está por debajo del mínimo",
      sub: "Programa una tutoría para recuperar antes del corte académico.",
      chips, boton: { texto: "+ Programar tutoría", pagina: "programar-tutoria" },
    };
  }
  if (prox) {
    return {
      tono: "info", icono: "📅", eyebrow: "Tu próxima tutoría",
      titulo: `${prox.asignatura || "Tutoría"} · ${fechaLegible(prox.fecha)}`,
      sub: `A las ${(prox.hora || "").slice(0, 5)} · ${prox.modalidad || "por definir"}.`,
      chips, boton: { texto: "Ver mi calendario", pagina: "mi-calendario" },
    };
  }
  return {
    tono: "ok", icono: "✅", eyebrow: "Todo al día",
    titulo: "No tienes alertas ni tutorías pendientes",
    sub: "Cuando lo necesites, programa una tutoría con tus docentes.",
    chips, boton: { texto: "+ Programar tutoría", pagina: "programar-tutoria" },
  };
}

// ── Docente ──────────────────────────────────────────────────
function accionDocente({ enAlerta, tutorias, tutoriasMes }) {
  const prox = proximaTutoria(tutorias);
  const nAlerta = enAlerta || 0;

  const chips = [];
  if (nAlerta) chips.push({ tipo: "aler", texto: `${nAlerta} en alerta` });
  if (tutoriasMes) chips.push({ tipo: "info", texto: `${tutoriasMes} este mes` });

  if (nAlerta > 0) {
    return {
      tono: "alerta", icono: "🎯", eyebrow: "Requiere tu atención",
      titulo: `${nAlerta} estudiante${nAlerta > 1 ? "s" : ""} en alerta académica`,
      sub: "Revisa la lista y programa tutorías de apoyo para quienes lo necesitan.",
      chips, boton: { texto: "Programar tutoría", pagina: "programar-tutoria" },
    };
  }
  if (prox) {
    return {
      tono: "info", icono: "📅", eyebrow: "Tu próxima sesión",
      titulo: `${prox.asignatura || "Tutoría"} · ${fechaLegible(prox.fecha)}`,
      sub: `Con ${prox.nombre_estudiante || "tu estudiante"} a las ${(prox.hora || "").slice(0, 5)}.`,
      chips, boton: { texto: "Ver mi calendario", pagina: "mi-calendario" },
    };
  }
  return {
    tono: "ok", icono: "✅", eyebrow: "Todo al día",
    titulo: "Ningún estudiante en alerta por ahora",
    sub: "Puedes programar tutorías de seguimiento cuando quieras.",
    chips, boton: { texto: "Programar tutoría", pagina: "programar-tutoria" },
  };
}

// ── Administrador ────────────────────────────────────────────
function accionAdmin({ alertas, totalUsuarios, totalAsignaciones }) {
  const chips = [];
  if (totalUsuarios != null) chips.push({ tipo: "info", texto: `${totalUsuarios} usuarios` });
  if (totalAsignaciones != null) chips.push({ tipo: "ok", texto: `${totalAsignaciones} asignaciones` });
  if (alertas) chips.push({ tipo: "aler", texto: `${alertas} en alerta` });

  if (alertas > 0) {
    return {
      tono: "alerta", icono: "📊", eyebrow: "Atención del sistema",
      titulo: `${alertas} estudiante${alertas > 1 ? "s" : ""} en alerta académica`,
      sub: "Revisa las asignaciones estudiante–tutor y envía notificaciones si hace falta.",
      chips, boton: { texto: "Ver asignaciones", pagina: "admin-asignacion" },
    };
  }
  return {
    tono: "ok", icono: "✅", eyebrow: "Sistema al día",
    titulo: "No hay alertas académicas activas",
    sub: "Todo en orden. Puedes revisar reportes o gestionar usuarios.",
    chips, boton: { texto: "Gestionar usuarios", pagina: "admin-usuarios" },
  };
}
