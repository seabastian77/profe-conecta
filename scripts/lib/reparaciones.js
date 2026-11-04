// Reparación guiada de datos: primero planifica y muestra cada cambio; solo aplica lo planificado, con copia previa y en una transacción.
const path = require('path');
const { CARPETA_RESPALDOS } = require('./comun');
const { crearRespaldo } = require('./respaldo');
const { endurecerEsquema, INDICES_UNICOS, RESTRICCIONES } = require('../../src/config/esquema');
const { CLAVES } = require('../../src/config/bloqueos');
const { horaCorta } = require('../../src/config/agenda');

const FECHA_VALIDA = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const HORA_VALIDA = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
const RANGO_ESTADO = { completada: 0, confirmada: 1, pendiente: 2 };
const CANCELABLES = new Set(['pendiente', 'confirmada']);

// Protecciones que se resuelven de forma manual y qué hacer en cada caso.
const AYUDA_MANUAL = {
  uq_usuarios_correo_minuscula: 'Dos cuentas con el mismo correo (ignorando mayúsculas): decide cuál se conserva y desactiva o cambia el correo de la otra desde el panel.',
  uq_usuarios_google_id: 'Dos cuentas con el mismo identificador de Google: revisa cuál es la real.',
  uq_asignaturas_nombre_minuscula: 'Asignaturas repetidas: unifícalas manualmente porque hay docentes enlazados a cada una.',
  uq_periodos_un_activo: 'Hay más de un período activo: cierra los que no correspondan desde el panel de administración.',
  uq_perfiles_estudiante_documento: 'Documentos repetidos: confirma con las personas cuál es el correcto, o usa --limpiar-documentos para vaciar el de las cuentas más nuevas.',
  uq_perfiles_docente_cedula: 'Cédulas repetidas: confirma con las personas cuál es la correcta, o usa --limpiar-documentos para vaciar la de las cuentas más nuevas.'
};

// Indica si un texto con formato AAAA-MM-DD es una fecha real del calendario.
function fechaReal(fecha) {
  const dia = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
}

// Agrupa filas por una clave y devuelve solo los grupos con más de una.
function gruposRepetidos(filas, clave) {
  const grupos = new Map();
  for (const fila of filas) {
    const k = clave(fila);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(fila);
  }
  return [...grupos.values()].filter(g => g.length > 1);
}

// Arma el aviso que recibe una persona cuando se le cancela algo por una revisión de datos.
const aviso = (usuarioId, titulo, descripcion) => ({
  sql: 'INSERT INTO notificaciones (usuario_id, titulo, descripcion) VALUES ($1, $2, $3)',
  params: [usuarioId, titulo, descripcion]
});

// Arma la acción de cancelar una tutoría con su observación y los avisos a docente y estudiante.
function cancelarTutoria(tutoria, motivo, aviso1, opciones) {
  const sentencias = [];
  if (opciones.notificar) {
    for (const usuario of [tutoria.estudiante_id, tutoria.docente_id]) {
      sentencias.push(aviso(usuario, 'Tutoría cancelada por una revisión de datos', aviso1));
    }
  }
  return {
    resumen: `Cancelar la tutoría #${tutoria.id} de ${tutoria.asignatura} (${tutoria.fecha} ${tutoria.hora}): ${motivo}`,
    principal: {
      sql: `UPDATE tutorias SET estado = 'cancelada', observaciones = concat_ws(' | ', NULLIF(observaciones, ''), $2::text)
             WHERE id = $1 AND estado IN ('pendiente', 'confirmada')`,
      params: [tutoria.id, `Cancelada en una revisión de datos: ${motivo}`]
    },
    siguientes: sentencias,
    docentes: [tutoria.docente_id],
    estudiantes: [tutoria.estudiante_id]
  };
}

// Tutorías vigentes repetidas para el mismo docente o estudiante en la misma fecha y hora.
async function planTutoriasRepetidas(c, opciones) {
  const { rows } = await c.query(
    `SELECT id, estudiante_id, docente_id, asignatura, fecha, hora, estado FROM tutorias
      WHERE estado <> 'cancelada' AND fecha ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
      ORDER BY id`
  );
  const acciones = [];
  const manuales = [];
  const canceladas = new Set();

  const resolver = (clave, quien) => {
    const vigentes = rows.filter(t => !canceladas.has(t.id));
    for (const grupo of gruposRepetidos(vigentes, clave)) {
      grupo.sort((a, b) => (RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado]) || (a.id - b.id));
      const [conservada, ...sobrantes] = grupo;
      for (const t of sobrantes) {
        if (!CANCELABLES.has(t.estado)) {
          manuales.push({
            id: 'tutorias-completadas-repetidas',
            resumen: `La tutoría #${t.id} ya figura como completada y repite la #${conservada.id} (${quien}, ${t.fecha} ${t.hora})`,
            ayuda: 'Una tutoría completada no se cancela sola: revísala con las personas involucradas.'
          });
          continue;
        }
        canceladas.add(t.id);
        acciones.push({
          reparacion: 'tutorias-repetidas',
          ...cancelarTutoria(
            t,
            `repetía la tutoría #${conservada.id} (${quien})`,
            `La tutoría de ${t.asignatura} del ${t.fecha} a las ${t.hora} estaba registrada dos veces y se canceló. Si la necesitas, vuelve a programarla.`,
            opciones
          )
        });
      }
    }
  };

  resolver(t => `${t.docente_id}|${t.fecha}|${horaCorta(t.hora)}`, 'mismo docente');
  resolver(t => `${t.estudiante_id}|${t.fecha}|${horaCorta(t.hora)}`, 'mismo estudiante');
  return { acciones, manuales };
}

// Tutorías vigentes cuya fecha u hora no es válida: no se puede adivinar la correcta, así que se cancelan.
async function planTutoriasInvalidas(c, opciones) {
  const { rows } = await c.query(
    `SELECT id, estudiante_id, docente_id, asignatura, fecha, hora, estado FROM tutorias WHERE estado <> 'cancelada' ORDER BY id`
  );
  const acciones = [];
  const manuales = [];

  for (const t of rows) {
    const formatoValido = FECHA_VALIDA.test(t.fecha) && HORA_VALIDA.test(t.hora);
    if (formatoValido && fechaReal(t.fecha)) continue;

    if (!CANCELABLES.has(t.estado)) {
      manuales.push({
        id: 'tutorias-invalidas',
        resumen: `La tutoría #${t.id} figura como completada con fecha u hora no válida (${t.fecha} ${t.hora})`,
        ayuda: 'No se modifica sola: corrige la fecha a mano si la conoces.'
      });
      continue;
    }
    acciones.push({
      reparacion: 'tutorias-invalidas',
      ...cancelarTutoria(
        t,
        'la fecha u hora registrada no era válida',
        `La tutoría de ${t.asignatura} tenía una fecha u hora no válida (${t.fecha} ${t.hora}) y se canceló. Vuelve a programarla con una fecha correcta.`,
        opciones
      )
    });
  }
  return { acciones, manuales };
}

// Asignaciones activas repetidas entre el mismo estudiante y docente: se conserva la más antigua.
async function planAsignacionesRepetidas(c) {
  const { rows } = await c.query("SELECT id, estudiante_id, docente_id FROM asignaciones WHERE estado = 'activa' ORDER BY id");
  const acciones = [];
  for (const grupo of gruposRepetidos(rows, a => `${a.estudiante_id}|${a.docente_id}`)) {
    const [conservada, ...sobrantes] = grupo;
    for (const a of sobrantes) {
      acciones.push({
        reparacion: 'asignaciones-repetidas',
        resumen: `Marcar como removida la asignación #${a.id} (estudiante ${a.estudiante_id} con docente ${a.docente_id}): repite la #${conservada.id}`,
        principal: { sql: "UPDATE asignaciones SET estado = 'removida' WHERE id = $1 AND estado = 'activa'", params: [a.id] },
        siguientes: [],
        docentes: [],
        estudiantes: []
      });
    }
  }
  return { acciones, manuales: [] };
}

// Documentos o cédulas repetidos: solo con permiso explícito; se vacía el de las cuentas más nuevas y se deja constancia del valor anterior.
async function planDocumentosRepetidos(c, opciones) {
  const acciones = [];
  const definiciones = [
    { tabla: 'perfiles_estudiante', columna: 'documento', etiqueta: 'documento' },
    { tabla: 'perfiles_docente', columna: 'cedula', etiqueta: 'cédula' }
  ];

  for (const { tabla, columna, etiqueta } of definiciones) {
    const { rows } = await c.query(
      `SELECT id, usuario_id, ${columna} AS valor FROM ${tabla}
        WHERE ${columna} IS NOT NULL AND ${columna} <> ''
          AND ${columna} IN (SELECT ${columna} FROM ${tabla} WHERE ${columna} IS NOT NULL AND ${columna} <> '' GROUP BY ${columna} HAVING COUNT(*) > 1)
        ORDER BY id`
    );
    for (const grupo of gruposRepetidos(rows, f => f.valor)) {
      const [conservado, ...sobrantes] = grupo;
      for (const f of sobrantes) {
        const siguientes = [{
          sql: "INSERT INTO auditoria (usuario_id, evento, detalle) VALUES ($1, 'REPARACION_DATOS', $2)",
          params: [f.usuario_id, `Se vació el ${etiqueta} ${f.valor} del perfil #${f.id} porque repetía el del perfil #${conservado.id}`]
        }];
        if (opciones.notificar) {
          siguientes.push(aviso(f.usuario_id, `Actualiza tu ${etiqueta}`, `El ${etiqueta} que tenías registrado estaba repetido en otra cuenta y se quitó de tu perfil. Vuelve a escribirlo en tu perfil si es el tuyo.`));
        }
        acciones.push({
          reparacion: 'documentos-repetidos',
          resumen: `Vaciar el ${etiqueta} del perfil #${f.id} (usuario ${f.usuario_id}): repite el del perfil #${conservado.id}`,
          principal: { sql: `UPDATE ${tabla} SET ${columna} = NULL WHERE id = $1 AND ${columna} = $2`, params: [f.id, f.valor] },
          siguientes,
          docentes: [],
          estudiantes: []
        });
      }
    }
  }
  return { acciones, manuales: [] };
}

// Problemas que no se corrigen solos: se listan con qué hacer en cada caso.
async function planManuales(c, opciones) {
  const manuales = [];
  const cubiertosPorFlag = opciones.limpiarDocumentos ? ['uq_perfiles_estudiante_documento', 'uq_perfiles_docente_cedula'] : [];
  const cubiertosPorPlan = ['uq_tutorias_docente_horario', 'uq_tutorias_estudiante_horario', 'uq_asignaciones_activa'];

  for (const indice of INDICES_UNICOS) {
    if (cubiertosPorFlag.includes(indice.nombre) || cubiertosPorPlan.includes(indice.nombre)) continue;
    const { rows } = await c.query(indice.duplicados);
    if (rows.length) manuales.push({ id: indice.nombre, resumen: `${indice.motivo} (${rows.length} caso(s)): ${rows.slice(0, 5).map(r => r.clave).join(', ')}`, ayuda: AYUDA_MANUAL[indice.nombre] });
  }

  for (const [tabla, nombre, expresion] of RESTRICCIONES) {
    if (nombre === 'tutorias_fecha_check' || nombre === 'tutorias_hora_check') continue;
    const { rows } = await c.query(`SELECT id FROM ${tabla} WHERE NOT (${expresion}) LIMIT 20`);
    if (rows.length) manuales.push({ id: nombre, resumen: `hay filas de ${tabla} que incumplen ${nombre}: ids ${rows.map(r => r.id).join(', ')}`, ayuda: 'No se inventa un valor: corrígelo a mano.' });
  }
  return manuales;
}

// Calcula todo lo que se haría, sin modificar nada.
async function planificarReparaciones(c, { limpiarDocumentos = false, notificar = true } = {}) {
  const opciones = { limpiarDocumentos, notificar };
  const partes = [await planTutoriasRepetidas(c, opciones), await planTutoriasInvalidas(c, opciones), await planAsignacionesRepetidas(c, opciones)];
  if (limpiarDocumentos) partes.push(await planDocumentosRepetidos(c, opciones));

  // Una tutoría marcada por dos reglas se cancela una sola vez.
  const vistas = new Set();
  const acciones = partes.flatMap(p => p.acciones).filter(a => {
    const llave = `${a.principal.sql}|${JSON.stringify(a.principal.params)}`;
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });
  const manuales = [...partes.flatMap(p => p.manuales), ...await planManuales(c, opciones)];
  return { acciones, manuales };
}

// Aplica el plan en una sola transacción, después de guardar una copia de seguridad; si algo falla no queda ningún cambio.
async function aplicarReparaciones(c, plan, { carpeta = CARPETA_RESPALDOS } = {}) {
  if (!plan.acciones.length) return { aplicadas: 0, omitidas: 0, respaldo: null };

  const respaldo = await crearRespaldo(c, { carpeta, etiqueta: 'previo-reparacion' });
  let aplicadas = 0;
  let omitidas = 0;

  await c.query('BEGIN');
  try {
    // Se toman los mismos bloqueos de agenda que usa la aplicación al reservar, siempre en el mismo orden.
    const docentes = [...new Set(plan.acciones.flatMap(a => a.docentes))].sort((a, b) => a - b);
    const estudiantes = [...new Set(plan.acciones.flatMap(a => a.estudiantes))].sort((a, b) => a - b);
    for (const id of docentes) await c.query('SELECT pg_advisory_xact_lock($1, $2)', [CLAVES.AGENDA_DOCENTE, id]);
    for (const id of estudiantes) await c.query('SELECT pg_advisory_xact_lock($1, $2)', [CLAVES.AGENDA_ESTUDIANTE, id]);

    const porReparacion = {};
    for (const accion of plan.acciones) {
      const resultado = await c.query(accion.principal.sql, accion.principal.params);
      if (resultado.rowCount === 0) { omitidas++; continue; }
      for (const s of accion.siguientes) await c.query(s.sql, s.params);
      aplicadas++;
      porReparacion[accion.reparacion] = (porReparacion[accion.reparacion] || 0) + 1;
    }

    if (aplicadas) {
      await c.query(
        "INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (NULL, 'REPARACION_DATOS', $1)",
        [`Reparación de datos: ${Object.entries(porReparacion).map(([k, n]) => `${k}=${n}`).join(', ')}. Copia previa: ${path.basename(respaldo.archivo)}`]
      );
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => { /* la conexión ya se perdió */ });
    throw err;
  }

  const endurecimiento = await endurecerEsquema(c);
  return { aplicadas, omitidas, respaldo, endurecimiento };
}

module.exports = { planificarReparaciones, aplicarReparaciones, fechaReal };
