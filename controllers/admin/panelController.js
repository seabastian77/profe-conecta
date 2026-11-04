const { db } = require('../../config/db');
const { hoyColombia } = require('../../config/fechas');
const { umbralAlerta, condicionAlerta } = require('../../config/reglasTutoria');

// Convierte el COUNT de PostgreSQL (texto) en número.
const numero = (valor) => parseInt(valor || 0);

// Devuelve el primer y el último día del mes de una fecha AAAA-MM-DD.
function limitesDelMes(fecha) {
  const [anio, mes] = fecha.split('-').map(Number);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const mm = String(mes).padStart(2, '0');
  return { primero: `${anio}-${mm}-01`, ultimo: `${anio}-${mm}-${String(ultimo).padStart(2, '0')}` };
}

// Calcula la tasa de recuperación de RF024: estudiantes con promedio ≥ umbral sobre los perfiles registrados.
async function tasaRecuperacion(umbral) {
  const fila = await db.prepare(`
    SELECT COUNT(*) FILTER (WHERE pe.promedio >= ?) AS recuperados, COUNT(*) AS perfiles
    FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
    WHERE u.activo = 1 AND u.rol = 'estudiante'
  `).get(umbral);
  const perfiles = numero(fila?.perfiles);
  const recuperados = numero(fila?.recuperados);
  return { recuperados, perfiles, porcentaje: perfiles > 0 ? Math.round(recuperados / perfiles * 100) : null };
}

// Devuelve los contadores del panel de administración con una sola consulta a la base.
async function estadisticas(req, res) {
  const umbral = await umbralAlerta();
  const hoy = hoyColombia();
  const { primero, ultimo } = limitesDelMes(hoy);

  const [fila, recuperacion] = await Promise.all([
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM usuarios WHERE activo = 1) AS total_usuarios,
        (SELECT COUNT(*) FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
           WHERE u.activo = 1 AND u.rol = 'estudiante' AND ${condicionAlerta('pe.promedio')}) AS alertas,
        (SELECT COUNT(*) FROM tutorias WHERE fecha BETWEEN ? AND ? AND estado <> 'cancelada') AS tutorias_mes,
        (SELECT COUNT(*) FROM tutorias) AS total_tutorias,
        (SELECT COUNT(*) FROM tutorias WHERE fecha >= ? AND estado IN ('pendiente','confirmada')) AS proximas,
        (SELECT COUNT(*) FROM perfiles_estudiante) AS perfiles_estudiante,
        (SELECT COUNT(*) FROM perfiles_docente) AS perfiles_docente,
        (SELECT COUNT(*) FROM perfiles_admin) AS perfiles_admin,
        (SELECT COUNT(*) FROM asignaciones WHERE estado = 'activa') AS asignaciones,
        (SELECT COUNT(*) FROM notificaciones WHERE leida = 0) AS notificaciones,
        (SELECT COUNT(*) FROM auditoria WHERE COALESCE(archivada, 0) = 0) AS eventos,
        (SELECT nombre FROM periodos WHERE estado = 'activo' ORDER BY id DESC LIMIT 1) AS periodo
    `).get(umbral, primero, ultimo, hoy),
    tasaRecuperacion(umbral)
  ]);

  res.json({
    total_usuarios: numero(fila.total_usuarios),
    alertas_activas: numero(fila.alertas),
    tutorias_este_mes: numero(fila.tutorias_mes),
    total_tutorias: numero(fila.total_tutorias),
    tutorias_proximas: numero(fila.proximas),
    perfiles_completos: numero(fila.perfiles_estudiante) + numero(fila.perfiles_docente) + numero(fila.perfiles_admin),
    total_asignaciones: numero(fila.asignaciones),
    notificaciones_pendientes: numero(fila.notificaciones),
    eventos_auditoria: numero(fila.eventos),
    periodo_activo: fila.periodo || null,
    umbral_alerta: umbral,
    tasa_recuperacion: (recuperacion.porcentaje ?? 0) + '%'
  });
}

// Lista los programas que tienen estudiantes activos, para notificar por programa.
async function listarProgramas(req, res) {
  const filas = await db.prepare(`
    SELECT TRIM(pe.programa) AS programa, COUNT(*) AS estudiantes
    FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
    WHERE u.activo = 1 AND u.rol = 'estudiante' AND COALESCE(TRIM(pe.programa), '') <> ''
    GROUP BY TRIM(pe.programa)
    ORDER BY 1
  `).all();
  res.json(filas.map(f => ({ programa: f.programa, estudiantes: numero(f.estudiantes) })));
}

// Elige el periodo del reporte: el pedido, el activo si no se pide ninguno, o ninguno para todo el histórico.
function periodoPedido(periodos, pedido) {
  if (pedido === 'todos') return { periodo: null };
  if (!pedido) return { periodo: periodos.find(p => p.estado === 'activo') || null };
  const periodo = periodos.find(p => String(p.id) === pedido);
  return periodo ? { periodo } : { error: 'Ese período no existe' };
}

// Arma el reporte académico con datos de la base, por período (fechas de las tutorías) o de todo el histórico.
async function reportes(req, res) {
  const periodos = await db.prepare('SELECT id, nombre, inicio, fin, estado FROM periodos ORDER BY inicio DESC NULLS LAST, id DESC').all();
  const eleccion = periodoPedido(periodos, String(req.query.periodo || '').trim());
  if (eleccion.error) return res.status(404).json({ error: eleccion.error });
  const periodo = eleccion.periodo;

  const umbral = await umbralAlerta();
  const rango = periodo && periodo.inicio && periodo.fin ? ' AND t.fecha BETWEEN ? AND ?' : '';
  const paramsRango = rango ? [periodo.inicio, periodo.fin] : [];

  const [tutorias, estudiantes, activos, programas, realizadas] = await Promise.all([
    db.prepare(`
      SELECT COUNT(*) FILTER (WHERE t.estado <> 'cancelada') AS programadas,
             COUNT(*) FILTER (WHERE t.estado = 'completada') AS completadas,
             COUNT(*) FILTER (WHERE t.estado IN ('pendiente','confirmada')) AS pendientes,
             COUNT(*) FILTER (WHERE t.estado = 'cancelada') AS canceladas
      FROM tutorias t WHERE 1=1${rango}
    `).get(...paramsRango),
    db.prepare(`
      SELECT COUNT(*) AS perfiles,
             COUNT(*) FILTER (WHERE ${condicionAlerta('pe.promedio')}) AS alertas,
             COUNT(*) FILTER (WHERE pe.promedio >= ?) AS recuperados,
             COUNT(*) FILTER (WHERE pe.promedio > 0) AS con_promedio,
             ROUND(AVG(pe.promedio) FILTER (WHERE pe.promedio > 0), 2) AS promedio_general
      FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
      WHERE u.activo = 1 AND u.rol = 'estudiante'
    `).get(umbral, umbral),
    db.prepare(`
      SELECT COUNT(*) FILTER (WHERE rol = 'estudiante') AS estudiantes,
             COUNT(*) FILTER (WHERE rol = 'docente') AS docentes
      FROM usuarios WHERE activo = 1
    `).get(),
    db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(pe.programa), ''), 'Sin programa') AS programa,
             COUNT(*) AS estudiantes,
             COUNT(*) FILTER (WHERE ${condicionAlerta('pe.promedio')}) AS alertas,
             COUNT(*) FILTER (WHERE pe.promedio >= ?) AS recuperados
      FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
      WHERE u.activo = 1 AND u.rol = 'estudiante'
      GROUP BY 1
    `).all(umbral, umbral),
    db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(pe.programa), ''), 'Sin programa') AS programa, COUNT(*) AS realizadas
      FROM tutorias t JOIN perfiles_estudiante pe ON pe.usuario_id = t.estudiante_id
      WHERE t.estado = 'completada'${rango}
      GROUP BY 1
    `).all(...paramsRango)
  ]);

  const realizadasPorPrograma = Object.fromEntries(realizadas.map(r => [r.programa, numero(r.realizadas)]));
  const perfiles = numero(estudiantes.perfiles);
  const porcentaje = (parte, total) => (total > 0 ? Math.round(parte / total * 1000) / 10 : 0);

  res.json({
    periodo,
    periodos,
    umbral,
    generado: new Date().toISOString(),
    indicadores: {
      total_tutorias: numero(tutorias.programadas),
      tutorias_completadas: numero(tutorias.completadas),
      tutorias_pendientes: numero(tutorias.pendientes),
      tutorias_canceladas: numero(tutorias.canceladas),
      alertas_activas: numero(estudiantes.alertas),
      perfiles_estudiante: perfiles,
      estudiantes_recuperados: numero(estudiantes.recuperados),
      tasa_recuperacion: perfiles > 0 ? Math.round(numero(estudiantes.recuperados) / perfiles * 100) : null,
      estudiantes_con_promedio: numero(estudiantes.con_promedio),
      promedio_general: estudiantes.promedio_general === null ? null : Number(estudiantes.promedio_general),
      estudiantes_activos: numero(activos.estudiantes),
      docentes_tutores: numero(activos.docentes)
    },
    por_programa: programas
      .map(p => {
        const total = numero(p.estudiantes);
        return {
          programa: p.programa,
          estudiantes: total,
          alertas: numero(p.alertas),
          porcentaje_alerta: porcentaje(numero(p.alertas), total),
          tutorias_realizadas: realizadasPorPrograma[p.programa] || 0,
          recuperacion: total > 0 ? Math.round(numero(p.recuperados) / total * 100) : 0
        };
      })
      .sort((a, b) => b.alertas - a.alertas || b.estudiantes - a.estudiantes || a.programa.localeCompare(b.programa))
  });
}

module.exports = { estadisticas, listarProgramas, reportes };
