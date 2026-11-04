// Calcula el mensaje destacado de cada panel y lo dibuja arriba de los indicadores.

// Devuelve la próxima tutoría activa que todavía no ocurre, o null.
function proximaTutoria(tutorias) {
  const ahora = new Date();
  const futuras = (tutorias || [])
    .filter((t) => ['pendiente', 'confirmada'].includes(normalizarEstado(t.estado)))
    .map((t) => ({ tutoria: t, cuando: instanteTutoria(t) }))
    .filter((x) => x.cuando && x.cuando >= ahora)
    .sort((a, b) => a.cuando - b.cuando);
  return futuras.length ? futuras[0].tutoria : null;
}

const INSIGNIA_CHIP = { pend: 'aviso', ok: 'ok', aler: 'error', info: 'marca' };

// Dibuja la tarjeta destacada; los datos definen el tono, los textos, las etiquetas y el botón.
function renderAccion(idContenedor, datos) {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;
  const chips = (datos.chips || []).map((c) => '<span class="insignia insignia--' + INSIGNIA_CHIP[c.tipo] + '">' + escaparHtml(c.texto) + '</span>').join('');
  const boton = datos.boton
    ? '<button type="button" class="btn btn--primario" onclick="irAPagina(\'' + datos.boton.pagina + '\')">' + escaparHtml(datos.boton.texto) + '</button>'
    : '';

  contenedor.className = 'destacado' + (datos.tono === 'alerta' || datos.tono === 'ok' ? ' destacado--' + datos.tono : '');
  contenedor.hidden = false;
  contenedor.innerHTML =
    '<span class="destacado__icono">' + icono(datos.icono || 'info', 'l') + '</span>' +
    '<div class="destacado__texto">' +
      '<span class="destacado__etiqueta">' + escaparHtml(datos.etiqueta || '') + '</span>' +
      '<h2 class="destacado__titulo">' + escaparHtml(datos.titulo) + '</h2>' +
      (datos.sub ? '<p class="destacado__sub">' + escaparHtml(datos.sub) + '</p>' : '') +
      (chips ? '<div class="destacado__chips">' + chips + '</div>' : '') +
    '</div>' + boton;
}

// Calcula el mensaje destacado cuando faltan datos obligatorios del perfil.
function accionPerfilIncompleto(rol) {
  return {
    tono: 'info', icono: 'usuario', etiqueta: 'Falta un paso',
    titulo: 'Completa tu perfil',
    sub: rol === 'docente'
      ? 'Agrega tu cédula, facultad y materias para que los estudiantes puedan programar tutorías contigo.'
      : 'Agrega tu documento, programa y semestre para que tus docentes te identifiquen al programar tutorías.',
    chips: [], boton: { texto: 'Completar perfil', pagina: 'completar-perfil' },
  };
}

// Calcula la acción destacada del estudiante.
function accionEstudiante({ promedio, tutorias }) {
  const enAlerta = promedio > 0 && promedio < CONFIG.PROMEDIO_MINIMO;
  const proxima = proximaTutoria(tutorias);
  const pendientes = tutorias.filter((t) => normalizarEstado(t.estado) === 'pendiente').length;
  const hechas = tutorias.filter((t) => normalizarEstado(t.estado) === 'completada').length;

  const chips = [];
  if (pendientes) chips.push({ tipo: 'pend', texto: pendientes + (pendientes > 1 ? ' pendientes' : ' pendiente') });
  if (hechas) chips.push({ tipo: 'ok', texto: hechas + (hechas > 1 ? ' realizadas' : ' realizada') });
  if (enAlerta) chips.push({ tipo: 'aler', texto: 'Alerta académica' });

  if (enAlerta) {
    return {
      tono: 'alerta', icono: 'escudo-alerta', etiqueta: 'Requiere tu atención',
      titulo: 'Tu promedio está por debajo del mínimo',
      sub: 'Programa una tutoría con tus docentes para recuperar antes del corte académico.',
      chips, boton: { texto: 'Programar tutoría', pagina: 'programar-tutoria' },
    };
  }
  if (proxima) {
    return {
      tono: 'info', icono: 'calendario', etiqueta: 'Tu próxima tutoría',
      titulo: (proxima.asignatura || 'Tutoría') + ' · ' + fechaLegible(proxima.fecha),
      sub: 'A las ' + String(proxima.hora || '').slice(0, 5) + ' · ' + (proxima.modalidad || 'modalidad por definir'),
      chips, boton: { texto: 'Ver mi calendario', pagina: 'mi-calendario' },
    };
  }
  return {
    tono: 'ok', icono: 'escudo-ok', etiqueta: 'Todo al día',
    titulo: 'No tienes alertas ni tutorías pendientes',
    sub: 'Cuando lo necesites, programa una tutoría con tus docentes.',
    chips, boton: { texto: 'Programar tutoría', pagina: 'programar-tutoria' },
  };
}

// Calcula la acción destacada del docente.
function accionDocente({ enAlerta, tutorias, tutoriasMes }) {
  const proxima = proximaTutoria(tutorias);
  const chips = [];
  if (enAlerta) chips.push({ tipo: 'aler', texto: enAlerta + ' en alerta' });
  if (tutoriasMes) chips.push({ tipo: 'info', texto: tutoriasMes + (tutoriasMes > 1 ? ' tutorías este mes' : ' tutoría este mes') });

  if (enAlerta > 0) {
    return {
      tono: 'alerta', icono: 'objetivo', etiqueta: 'Requiere tu atención',
      titulo: enAlerta + (enAlerta > 1 ? ' estudiantes en alerta académica' : ' estudiante en alerta académica'),
      sub: 'Revisa la lista y programa tutorías de apoyo para quienes lo necesitan.',
      chips, boton: { texto: 'Programar tutoría', pagina: 'programar-tutoria' },
    };
  }
  if (proxima) {
    return {
      tono: 'info', icono: 'calendario', etiqueta: 'Tu próxima sesión',
      titulo: (proxima.asignatura || 'Tutoría') + ' · ' + fechaLegible(proxima.fecha),
      sub: 'Con ' + (proxima.nombre_estudiante || 'tu estudiante') + ' a las ' + String(proxima.hora || '').slice(0, 5),
      chips, boton: { texto: 'Ver mis tutorías', pagina: 'mi-calendario' },
    };
  }
  return {
    tono: 'ok', icono: 'escudo-ok', etiqueta: 'Todo al día',
    titulo: 'Ningún estudiante en alerta por ahora',
    sub: 'Puedes programar tutorías de seguimiento cuando quieras.',
    chips, boton: { texto: 'Programar tutoría', pagina: 'programar-tutoria' },
  };
}

// Calcula la acción destacada del administrador.
function accionAdmin({ alertas, totalUsuarios, totalAsignaciones }) {
  const chips = [];
  if (totalUsuarios != null) chips.push({ tipo: 'info', texto: totalUsuarios + (totalUsuarios === 1 ? ' usuario' : ' usuarios') });
  if (totalAsignaciones != null) chips.push({ tipo: 'ok', texto: totalAsignaciones + (totalAsignaciones === 1 ? ' asignación' : ' asignaciones') });
  if (alertas) chips.push({ tipo: 'aler', texto: alertas + ' en alerta' });

  if (alertas > 0) {
    return {
      tono: 'alerta', icono: 'reportes', etiqueta: 'Atención del sistema',
      titulo: alertas + (alertas > 1 ? ' estudiantes en alerta académica' : ' estudiante en alerta académica'),
      sub: 'Revisa las asignaciones estudiante–tutor y envía notificaciones si hace falta.',
      chips, boton: { texto: 'Ver asignaciones', pagina: 'admin-asignacion' },
    };
  }
  return {
    tono: 'ok', icono: 'escudo-ok', etiqueta: 'Sistema al día',
    titulo: 'No hay alertas académicas activas',
    sub: 'Todo en orden. Puedes revisar reportes o gestionar usuarios.',
    chips, boton: { texto: 'Gestionar usuarios', pagina: 'admin-usuarios' },
  };
}
