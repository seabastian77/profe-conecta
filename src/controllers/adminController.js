const { db } = require('../config/db');
const bcrypt = require('bcrypt');
const { RONDAS_BCRYPT, validarContrasena } = require('../config/seguridad');
const { errorDatosSesion, hoyColombia, esFechaValida } = require('../config/fechas');
const { REGLAS, claveRegla, validarRegla, obtenerReglas } = require('../config/config');
const { auditar } = require('../config/auditoria');
const { docenteDictaAsignatura, errorCupoTutor, umbralAlerta, condicionAlerta } = require('../config/reglasTutoria');

// Acepta solo letras, espacios y signos simples en nombres y apellidos.
const NOMBRE_VALIDO = /^[\p{L}\p{M}\s'.-]{1,80}$/u;

// Días que debe tener un registro de auditoría para poder archivarse.
const DIAS_ARCHIVO_AUDITORIA = 90;

// Convierte el COUNT de PostgreSQL (texto) en número.
const numero = (valor) => parseInt(valor || 0);

// Lista los usuarios con filtros opcionales de rol, estado y búsqueda.
async function listarUsuarios(req, res) {
  try {
    const { rol, estado, q } = req.query;
    let sql = `
      SELECT u.id, u.nombres, u.apellidos, u.correo, u.rol, u.activo, u.creado_en,
             pe.programa, pe.semestre, pe.promedio,
             pd.facultad, pa.dependencia
      FROM usuarios u
      LEFT JOIN perfiles_estudiante pe ON pe.usuario_id=u.id
      LEFT JOIN perfiles_docente pd ON pd.usuario_id=u.id
      LEFT JOIN perfiles_admin pa ON pa.usuario_id=u.id
      WHERE 1=1
    `;
    const params = [];
    if (rol)                 { sql += ' AND u.rol=?';       params.push(rol); }
    if (estado === 'activo')   sql += ' AND u.activo=1';
    if (estado === 'inactivo') sql += ' AND u.activo=0';
    if (estado === 'alerta') { sql += ` AND ${condicionAlerta('pe.promedio')}`; params.push(await umbralAlerta()); }
    if (q) {
      sql += ' AND (u.nombres ILIKE ? OR u.apellidos ILIKE ? OR u.correo ILIKE ?)';
      const like = '%' + q + '%';
      params.push(like, like, like);
    }
    sql += ' ORDER BY u.creado_en DESC';
    const rows = await db.prepare(sql).all(...params);
    res.json(rows);
  } catch(err) {
    console.error('listarUsuarios error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Activa o desactiva una cuenta de usuario.
async function cambiarEstado(req, res) {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean' });
  await db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(activo ? 1 : 0, req.params.id);
  await auditar(req, activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', 'Usuario ID ' + req.params.id);
  res.json({ mensaje: 'Usuario ' + (activo ? 'activado' : 'desactivado') });
}

// Crea un usuario desde el panel con contraseña obligatoria y validada.
async function crearUsuario(req, res) {
  const { nombres, apellidos, correo, rol, contrasena } = req.body;
  if (!nombres || !apellidos || !correo || !rol) return res.status(400).json({ error: 'Faltan campos' });

  if (!['estudiante', 'docente', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  if (!NOMBRE_VALIDO.test(nombres) || !NOMBRE_VALIDO.test(apellidos)) {
    return res.status(400).json({ error: 'Nombres y apellidos solo admiten letras' });
  }

  const errorClave = validarContrasena(contrasena);
  if (errorClave) return res.status(400).json({ error: errorClave });

  const existe = await db.prepare('SELECT id FROM usuarios WHERE correo=?').get(correo);
  if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });

  const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
  const result = await db.prepare('INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id').get(nombres, apellidos, correo, hash, rol);
  await auditar(req, 'CREAR_USUARIO', nombres + ' ' + apellidos);
  res.json({ mensaje: 'Usuario creado', id: result.id });
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

// Devuelve los contadores del panel de administración.
async function estadisticas(req, res) {
  const cnt = async (sql, ...params) => numero((await db.prepare(sql).get(...params))?.n);
  const umbral = await umbralAlerta();
  const hoy = hoyColombia();
  const mesActual = hoy.slice(0, 7);
  const totales     = await cnt("SELECT COUNT(*) AS n FROM usuarios WHERE activo=1");
  const alertas     = await cnt(`SELECT COUNT(*) AS n FROM perfiles_estudiante pe JOIN usuarios u ON u.id=pe.usuario_id WHERE u.activo=1 AND u.rol='estudiante' AND ${condicionAlerta('pe.promedio')}`, umbral);
  const tutMes      = await cnt("SELECT COUNT(*) AS n FROM tutorias WHERE fecha LIKE ? AND estado!='cancelada'", mesActual + '%');
  const totalTut    = await cnt("SELECT COUNT(*) AS n FROM tutorias");
  const proximas    = await cnt("SELECT COUNT(*) AS n FROM tutorias WHERE fecha >= ? AND estado IN ('pendiente','confirmada')", hoy);
  const perfEst     = await cnt("SELECT COUNT(*) AS n FROM perfiles_estudiante");
  const perfDoc     = await cnt("SELECT COUNT(*) AS n FROM perfiles_docente");
  const perfAdm     = await cnt("SELECT COUNT(*) AS n FROM perfiles_admin");
  const asignaciones = await cnt("SELECT COUNT(*) AS n FROM asignaciones WHERE estado='activa'");
  const notifs      = await cnt("SELECT COUNT(*) AS n FROM notificaciones WHERE leida=0");
  const eventos     = await cnt("SELECT COUNT(*) AS n FROM auditoria WHERE COALESCE(archivada,0)=0");
  const periodo     = await db.prepare("SELECT nombre FROM periodos WHERE estado='activo' ORDER BY id DESC LIMIT 1").get();
  const recuperacion = await tasaRecuperacion(umbral);
  res.json({
    total_usuarios: totales,
    alertas_activas: alertas,
    tutorias_este_mes: tutMes,
    total_tutorias: totalTut,
    tutorias_proximas: proximas,
    perfiles_completos: perfEst + perfDoc + perfAdm,
    total_asignaciones: asignaciones,
    notificaciones_pendientes: notifs,
    eventos_auditoria: eventos,
    periodo_activo: periodo ? periodo.nombre : null,
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

// Traduce el destinatario (incluidos los textos de la pantalla anterior) a un grupo conocido.
function grupoDestinatario(destinatario) {
  const texto = String(destinatario || '').trim();
  const t = texto.toLowerCase();
  if (['alerta', 'docentes', 'estudiantes', 'todos', 'programa', 'usuario'].includes(t)) return { grupo: t };
  if (t.startsWith('programa:')) return { grupo: 'programa', programa: texto.slice(texto.indexOf(':') + 1).trim() };
  if (t.includes('alerta')) return { grupo: 'alerta' };
  if (t.includes('docente')) return { grupo: 'docentes' };
  if (t.includes('usuario espec')) return { grupo: 'usuario' };
  return { grupo: null };
}

// Envía una notificación solo al grupo, programa o usuario elegido; antes «Programa» y «Usuario» llegaban a todos.
async function enviarNotificacion(req, res) {
  const { destinatario, tipo, asunto, mensaje } = req.body;
  if (!asunto || !mensaje) return res.status(400).json({ error: 'Faltan asunto o mensaje' });
  if (String(asunto).length > 150 || String(mensaje).length > 2000) {
    return res.status(400).json({ error: 'El asunto admite 150 caracteres y el mensaje 2000' });
  }

  const { grupo, programa: programaTexto } = grupoDestinatario(destinatario);
  const programa = String(req.body.programa || programaTexto || '').trim();
  let usuarios = [];
  let etiqueta;

  if (grupo === 'alerta') {
    usuarios = await db.prepare(`SELECT u.id FROM usuarios u JOIN perfiles_estudiante pe ON pe.usuario_id=u.id WHERE u.activo=1 AND u.rol='estudiante' AND ${condicionAlerta('pe.promedio')}`).all(await umbralAlerta());
    etiqueta = 'Estudiantes en alerta';
  } else if (grupo === 'docentes') {
    usuarios = await db.prepare("SELECT id FROM usuarios WHERE rol='docente' AND activo=1").all();
    etiqueta = 'Docentes tutores';
  } else if (grupo === 'estudiantes') {
    usuarios = await db.prepare("SELECT id FROM usuarios WHERE rol='estudiante' AND activo=1").all();
    etiqueta = 'Todos los estudiantes';
  } else if (grupo === 'todos') {
    usuarios = await db.prepare("SELECT id FROM usuarios WHERE activo=1").all();
    etiqueta = 'Todos los usuarios';
  } else if (grupo === 'programa') {
    if (!programa) return res.status(400).json({ error: 'Elige el programa que recibe la notificación' });
    usuarios = await db.prepare("SELECT u.id FROM usuarios u JOIN perfiles_estudiante pe ON pe.usuario_id=u.id WHERE u.activo=1 AND u.rol='estudiante' AND lower(TRIM(pe.programa))=lower(?)").all(programa);
    etiqueta = 'Programa: ' + programa;
  } else if (grupo === 'usuario') {
    const usuarioId = parseInt(req.body.usuario_id);
    if (!usuarioId) return res.status(400).json({ error: 'Busca y elige el usuario que recibe la notificación' });
    const usuario = await db.prepare('SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND activo=1').get(usuarioId);
    if (!usuario) return res.status(404).json({ error: 'Ese usuario no existe o está inactivo' });
    usuarios = [usuario];
    etiqueta = 'Usuario: ' + usuario.nombres + ' ' + usuario.apellidos;
  } else {
    return res.status(400).json({ error: 'Destinatario no válido' });
  }

  const ids = usuarios.map(u => u.id).filter(Boolean);
  if (ids.length === 0) return res.status(400).json({ error: `No hay usuarios activos en «${etiqueta}»` });

  const icono = (tipo && tipo.includes('Alerta')) ? '⚠️' : (tipo && tipo.includes('Recordatorio')) ? '📅' : '📢';

  // Inserta todas las notificaciones en una sola consulta con UNNEST.
  await db.pool.query(
    `INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion)
     SELECT id, $2, $3, $4 FROM UNNEST($1::int[]) AS t(id)`,
    [ids, icono, asunto, mensaje]
  );
  await db.prepare('INSERT INTO historial_notificaciones (destinatario, tipo, asunto, mensaje, cantidad, enviado_por) VALUES (?,?,?,?,?,?)').run(etiqueta, tipo || 'General', asunto, mensaje, ids.length, req.usuario.id);
  await auditar(req, 'NOTIFICACION', `A ${ids.length} usuario(s) — ${etiqueta}: ${asunto}`);
  res.json({ mensaje: `Enviado a ${ids.length} usuario(s) — ${etiqueta}`, cantidad: ids.length });
}

// Devuelve el historial de notificaciones enviadas.
async function historialNotificaciones(req, res) {
  res.json(await db.prepare('SELECT * FROM historial_notificaciones ORDER BY creada_en DESC LIMIT 100').all());
}

// Consulta la auditoría sin los registros archivados, salvo que se pidan.
async function verAuditoria(req, res) {
  const { tipo, fecha, archivadas } = req.query;
  let sql = `SELECT a.id, a.usuario_id, a.evento, a.detalle, a.ip, a.creada_en, COALESCE(a.archivada,0) AS archivada,
                    u.correo AS correo_usuario
             FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE 1=1`;
  const params = [];
  if (archivadas !== '1') sql += ' AND COALESCE(a.archivada,0)=0';
  if (req.query.mios === '1') { sql += ' AND a.usuario_id = ?'; params.push(req.usuario.id); }
  if (tipo) { sql += ' AND a.evento LIKE ?'; params.push('%' + tipo + '%'); }
  if (fecha) {
    if (!esFechaValida(fecha)) return res.status(400).json({ error: 'La fecha no es válida (AAAA-MM-DD)' });
    sql += ' AND a.creada_en LIKE ?';
    params.push(fecha + '%');
  }
  sql += ' ORDER BY a.creada_en DESC, a.id DESC LIMIT 500';
  res.json(await db.prepare(sql).all(...params));
}

// Archiva los registros de auditoría de más de 90 días: salen del listado pero se conservan.
async function archivarAuditoria(req, res) {
  const resultado = await db.pool.query(
    `UPDATE auditoria SET archivada = 1
     WHERE COALESCE(archivada, 0) = 0
       AND creada_en < to_char(NOW() - INTERVAL '${DIAS_ARCHIVO_AUDITORIA} days', 'YYYY-MM-DD"T"HH24:MI:SS')`
  );
  const archivados = resultado.rowCount || 0;
  await auditar(req, 'AUDITORIA_ARCHIVADA', `${archivados} registro(s) de más de ${DIAS_ARCHIVO_AUDITORIA} días`);
  res.json({
    mensaje: archivados > 0
      ? `Se archivaron ${archivados} registro(s) de más de ${DIAS_ARCHIVO_AUDITORIA} días`
      : `No hay registros de más de ${DIAS_ARCHIVO_AUDITORIA} días para archivar`,
    archivados
  });
}

// Lista las asignaciones activas de estudiante a docente.
async function listarAsignaciones(req, res) {
  res.json(await db.prepare("SELECT a.id, a.estado, a.creada_en, ue.nombres||' '||ue.apellidos AS nombre_estudiante, pe.programa, pe.promedio, ud.nombres||' '||ud.apellidos AS nombre_docente FROM asignaciones a JOIN usuarios ue ON ue.id=a.estudiante_id JOIN usuarios ud ON ud.id=a.docente_id LEFT JOIN perfiles_estudiante pe ON pe.usuario_id=a.estudiante_id WHERE a.estado='activa' ORDER BY a.creada_en DESC").all());
}

// Crea una asignación si ambos existen con su rol y el tutor aún tiene cupo (máximo configurado).
async function crearAsignacion(req, res) {
  const estudianteId = parseInt(req.body.estudiante_id);
  const docenteId = parseInt(req.body.docente_id);
  if (!estudianteId || !docenteId) return res.status(400).json({ error: 'Faltan datos' });

  const estudiante = await db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(estudianteId);
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado o inactivo' });
  const docente = await db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(docenteId);
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado o inactivo' });

  const existe = await db.prepare("SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'").get(estudianteId, docenteId);
  if (existe) return res.status(409).json({ error: 'Ya existe esta asignación' });

  const errorCupo = await errorCupoTutor(docenteId, estudianteId);
  if (errorCupo) return res.status(409).json({ error: errorCupo });

  const result = await db.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?) RETURNING id').get(estudianteId, docenteId);
  await auditar(req, 'ASIGNACION_CREADA', 'Est ' + estudianteId + ' → Doc ' + docenteId);
  res.json({ mensaje: 'Asignación creada', id: result.id });
}

// Marca una asignación como removida.
async function eliminarAsignacion(req, res) {
  await db.prepare("UPDATE asignaciones SET estado='removida' WHERE id=?").run(req.params.id);
  await auditar(req, 'ASIGNACION_ELIMINADA', 'ID ' + req.params.id);
  res.json({ mensaje: 'Asignación eliminada' });
}

// Devuelve las reglas vigentes con sus claves RN_*, que son las que leen el servidor y la pantalla.
async function obtenerConfiguracion(req, res) {
  res.json(await obtenerReglas());
}

// Guarda una regla validada; antes se guardaban claves que nadie leía y el cambio no tenía efecto.
async function guardarConfiguracion(req, res) {
  const { clave, valor } = req.body;
  const oficial = claveRegla(clave);
  if (!oficial) return res.status(400).json({ error: 'Ese parámetro no existe' });

  const validado = validarRegla(oficial, valor);
  if (validado.error) return res.status(400).json({ error: validado.error });

  await db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT (clave) DO UPDATE SET valor=excluded.valor').run(oficial, validado.valor);
  await auditar(req, 'CONFIG', oficial + ' = ' + validado.valor);
  res.json({ mensaje: 'Guardado', clave: oficial, valor: Number(validado.valor) });
}

// Restaura cada regla a su valor por defecto.
async function resetearConfiguracion(req, res) {
  for (const [clave, regla] of Object.entries(REGLAS)) {
    const valor = regla.entero ? String(regla.defecto) : regla.defecto.toFixed(1);
    await db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT (clave) DO UPDATE SET valor=excluded.valor').run(clave, valor);
  }
  await auditar(req, 'CONFIG_RESET', 'Valores por defecto restaurados');
  res.json({ mensaje: 'Configuración reseteada', valores: await obtenerReglas() });
}

// Lista los periodos académicos: primero el activo, luego los próximos y al final los cerrados.
async function listarPeriodos(req, res) {
  res.json(await db.prepare(`
    SELECT * FROM periodos
    ORDER BY CASE estado WHEN 'activo' THEN 0 WHEN 'proximo' THEN 1 ELSE 2 END, inicio DESC NULLS LAST, id DESC
  `).all());
}

// Crea un periodo próximo validando nombre, fechas y cruces con los periodos abiertos.
async function crearPeriodo(req, res) {
  const nombre = String(req.body.nombre || '').trim();
  const { inicio, fin } = req.body;
  if (!nombre || !inicio || !fin) return res.status(400).json({ error: 'Faltan el nombre o las fechas del período' });
  if (nombre.length > 40) return res.status(400).json({ error: 'El nombre admite 40 caracteres' });
  if (!esFechaValida(inicio) || !esFechaValida(fin)) return res.status(400).json({ error: 'Las fechas no son válidas (AAAA-MM-DD)' });
  if (inicio >= fin) return res.status(400).json({ error: 'La fecha de cierre debe ser posterior a la de inicio' });

  const repetido = await db.prepare('SELECT id FROM periodos WHERE lower(nombre)=lower(?)').get(nombre);
  if (repetido) return res.status(409).json({ error: `Ya existe el período ${nombre}` });

  const cruce = await db.prepare("SELECT nombre FROM periodos WHERE estado <> 'cerrado' AND inicio <= ? AND fin >= ? LIMIT 1").get(fin, inicio);
  if (cruce) return res.status(409).json({ error: `Las fechas se cruzan con el período ${cruce.nombre}` });

  const result = await db.prepare("INSERT INTO periodos (nombre, inicio, fin, estado) VALUES (?,?,?,'proximo') RETURNING id").get(nombre, inicio, fin);
  await auditar(req, 'PERIODO_CREADO', `${nombre} (${inicio} a ${fin})`);
  res.status(201).json({ mensaje: 'Período creado', id: result.id });
}

// Busca un periodo por el id de la ruta.
async function periodoDeRuta(req) {
  return db.prepare('SELECT id, nombre, estado FROM periodos WHERE id=?').get(parseInt(req.params.id) || 0);
}

// Cierra un periodo abierto.
async function cerrarPeriodo(req, res) {
  const periodo = await periodoDeRuta(req);
  if (!periodo) return res.status(404).json({ error: 'Período no encontrado' });
  if (periodo.estado === 'cerrado') return res.status(400).json({ error: `El período ${periodo.nombre} ya está cerrado` });

  await db.prepare("UPDATE periodos SET estado='cerrado' WHERE id=?").run(periodo.id);
  await auditar(req, 'PERIODO_CERRADO', periodo.nombre);
  res.json({ mensaje: `Período ${periodo.nombre} cerrado` });
}

// Activa un periodo próximo cuando no hay otro activo.
async function activarPeriodo(req, res) {
  const periodo = await periodoDeRuta(req);
  if (!periodo) return res.status(404).json({ error: 'Período no encontrado' });
  if (periodo.estado === 'activo') return res.status(400).json({ error: `El período ${periodo.nombre} ya está activo` });
  if (periodo.estado === 'cerrado') return res.status(400).json({ error: 'Un período cerrado no se vuelve a abrir' });

  const activo = await db.prepare("SELECT nombre FROM periodos WHERE estado='activo' LIMIT 1").get();
  if (activo) return res.status(409).json({ error: `Primero cierra el período activo (${activo.nombre})` });

  await db.prepare("UPDATE periodos SET estado='activo' WHERE id=?").run(periodo.id);
  await auditar(req, 'PERIODO_ACTIVADO', periodo.nombre);
  res.json({ mensaje: `Período ${periodo.nombre} activado` });
}

// Arma el reporte académico con datos de la base, por período (fechas de las tutorías) o de todo el histórico.
async function reportes(req, res) {
  const periodos = await db.prepare('SELECT id, nombre, inicio, fin, estado FROM periodos ORDER BY inicio DESC NULLS LAST, id DESC').all();
  const pedido = String(req.query.periodo || '').trim();
  let periodo = null;
  if (pedido && pedido !== 'todos') {
    periodo = periodos.find(p => String(p.id) === pedido) || null;
    if (!periodo) return res.status(404).json({ error: 'Ese período no existe' });
  } else if (!pedido) {
    periodo = periodos.find(p => p.estado === 'activo') || null;
  }

  const umbral = await umbralAlerta();
  const rango = periodo && periodo.inicio && periodo.fin ? ' AND t.fecha BETWEEN ? AND ?' : '';
  const paramsRango = rango ? [periodo.inicio, periodo.fin] : [];

  const tutorias = await db.prepare(`
    SELECT COUNT(*) FILTER (WHERE t.estado <> 'cancelada') AS programadas,
           COUNT(*) FILTER (WHERE t.estado = 'completada') AS completadas,
           COUNT(*) FILTER (WHERE t.estado IN ('pendiente','confirmada')) AS pendientes,
           COUNT(*) FILTER (WHERE t.estado = 'cancelada') AS canceladas
    FROM tutorias t WHERE 1=1${rango}
  `).get(...paramsRango);

  const estudiantes = await db.prepare(`
    SELECT COUNT(*) AS perfiles,
           COUNT(*) FILTER (WHERE ${condicionAlerta('pe.promedio')}) AS alertas,
           COUNT(*) FILTER (WHERE pe.promedio >= ?) AS recuperados,
           COUNT(*) FILTER (WHERE pe.promedio > 0) AS con_promedio,
           ROUND(AVG(pe.promedio) FILTER (WHERE pe.promedio > 0), 2) AS promedio_general
    FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
    WHERE u.activo = 1 AND u.rol = 'estudiante'
  `).get(umbral, umbral);

  const activos = await db.prepare(`
    SELECT COUNT(*) FILTER (WHERE rol = 'estudiante') AS estudiantes,
           COUNT(*) FILTER (WHERE rol = 'docente') AS docentes
    FROM usuarios WHERE activo = 1
  `).get();

  const programas = await db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(pe.programa), ''), 'Sin programa') AS programa,
           COUNT(*) AS estudiantes,
           COUNT(*) FILTER (WHERE ${condicionAlerta('pe.promedio')}) AS alertas,
           COUNT(*) FILTER (WHERE pe.promedio >= ?) AS recuperados
    FROM perfiles_estudiante pe JOIN usuarios u ON u.id = pe.usuario_id
    WHERE u.activo = 1 AND u.rol = 'estudiante'
    GROUP BY 1
  `).all(umbral, umbral);

  const realizadas = await db.prepare(`
    SELECT COALESCE(NULLIF(TRIM(pe.programa), ''), 'Sin programa') AS programa, COUNT(*) AS realizadas
    FROM tutorias t JOIN perfiles_estudiante pe ON pe.usuario_id = t.estudiante_id
    WHERE t.estado = 'completada'${rango}
    GROUP BY 1
  `).all(...paramsRango);
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

// Busca usuarios por nombre o cédula para el panel.
async function buscarUsuario(req, res) {
  const { q, rol } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Ingresa al menos 2 caracteres' });
  const like = '%' + q.trim() + '%';
  let sql = `
    SELECT u.id, u.nombres, u.apellidos, u.correo, u.rol,
           pe.documento AS cedula_est, pe.programa,
           pd.cedula AS cedula_doc, pd.facultad
    FROM usuarios u
    LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
    LEFT JOIN perfiles_docente pd ON pd.usuario_id = u.id
    WHERE u.activo = 1
      AND (u.nombres ILIKE ? OR u.apellidos ILIKE ? OR u.correo ILIKE ? OR pe.documento ILIKE ? OR pd.cedula ILIKE ?)
  `;
  const params = [like, like, like, like, like];
  if (rol) { sql += ' AND u.rol = ?'; params.push(rol); }
  sql += ' ORDER BY u.nombres LIMIT 10';
  const resultados = (await db.prepare(sql).all(...params)).map(u => ({
    id: u.id,
    nombre: u.nombres + ' ' + u.apellidos,
    correo: u.correo,
    rol: u.rol,
    cedula: u.cedula_doc || u.cedula_est || '—',
    info: u.facultad || u.programa || u.correo || '—'
  }));
  res.json(resultados);
}

// Elimina un usuario y todos sus registros relacionados.
async function eliminarUsuario(req, res) {
  try {
    const id = parseInt(req.params.id);
    if (id === req.usuario.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }
    const existe = await db.prepare('SELECT id, nombres, apellidos, rol FROM usuarios WHERE id=?').get(id);
    if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (existe.rol === 'admin') {
      return res.status(400).json({ error: 'No se puede eliminar a otro administrador' });
    }

    // Borra los registros relacionados antes que el usuario.
    await db.prepare('DELETE FROM notificaciones WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM tutorias WHERE estudiante_id=? OR docente_id=?').run(id, id);
    await db.prepare('DELETE FROM asignaciones WHERE estudiante_id=? OR docente_id=?').run(id, id);
    await db.prepare('DELETE FROM clases_admin WHERE estudiante_id=? OR docente_id=?').run(id, id);
    await db.prepare('DELETE FROM docente_programas WHERE docente_id IN (SELECT id FROM perfiles_docente WHERE usuario_id=?)').run(id);
    await db.prepare('DELETE FROM docente_horarios WHERE docente_id IN (SELECT id FROM perfiles_docente WHERE usuario_id=?)').run(id);
    await db.prepare('DELETE FROM docente_asignaturas WHERE docente_id IN (SELECT id FROM perfiles_docente WHERE usuario_id=?)').run(id);
    await db.prepare('DELETE FROM fotos_usuario WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM auditoria WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM perfiles_estudiante WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM perfiles_docente WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM perfiles_admin WHERE usuario_id=?').run(id);
    await db.prepare('DELETE FROM usuarios WHERE id=?').run(id);

    await auditar(req, 'ELIMINAR_USUARIO', 'Usuario #' + id + ' (' + existe.nombres + ' ' + existe.apellidos + ') eliminado permanentemente');

    res.json({ mensaje: existe.nombres + ' ' + existe.apellidos + ' eliminado permanentemente' });
  } catch(err) {
    console.error('eliminarUsuario error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

// Actualiza los datos de un usuario y, si viene, su contraseña validada.
async function actualizarUsuario(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { nombres, apellidos, correo, rol, contrasena, promedio } = req.body;

    if (!nombres || !apellidos || !correo || !rol) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    // El promedio lo registra la institución desde aquí; vacío lo deja sin registrar (RF035).
    let nuevoPromedio;
    if (promedio !== undefined && rol === 'estudiante') {
      nuevoPromedio = (promedio === null || promedio === '') ? null : Number(promedio);
      if (nuevoPromedio !== null && (!Number.isFinite(nuevoPromedio) || nuevoPromedio < 0 || nuevoPromedio > 5)) {
        return res.status(400).json({ error: 'El promedio debe estar entre 0 y 5' });
      }
    }

    if (!NOMBRE_VALIDO.test(nombres) || !NOMBRE_VALIDO.test(apellidos)) {
      return res.status(400).json({ error: 'Nombres y apellidos solo admiten letras' });
    }

    const existe = await db.prepare('SELECT id FROM usuarios WHERE id=?').get(id);
    if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });

    const correoOcupado = await db.prepare('SELECT id FROM usuarios WHERE correo=? AND id<>?').get(correo, id);
    if (correoOcupado) return res.status(409).json({ error: 'Ya existe otro usuario con ese correo' });

    if (contrasena) {
      const errorClave = validarContrasena(contrasena);
      if (errorClave) return res.status(400).json({ error: errorClave });
      const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
      await db.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=?, contrasena=? WHERE id=?').run(nombres, apellidos, correo, rol, hash, id);
    } else {
      await db.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=? WHERE id=?').run(nombres, apellidos, correo, rol, id);
    }

    if (nuevoPromedio !== undefined) {
      await db.prepare(
        'INSERT INTO perfiles_estudiante (usuario_id, promedio) VALUES (?,?) ON CONFLICT (usuario_id) DO UPDATE SET promedio=excluded.promedio'
      ).run(id, nuevoPromedio);
    }

    await auditar(req, 'EDITAR_USUARIO', 'Usuario #' + id + ' actualizado por admin');

    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch(err) {
    console.error('Error actualizarUsuario:', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

// Programa una asesoría entre docente y estudiante y notifica a ambos.
async function programarClase(req, res) {
  const { docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones } = req.body;

  if (!docente_id || !estudiante_id || !asignatura || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: docente, estudiante, materia, fecha y hora' });
  }

  // RRN06 también aplica a las asesorías del admin: antes se creaban para hoy y hasta para fechas pasadas.
  const errorDatos = errorDatosSesion({ fecha, hora, modalidad });
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (String(asignatura).length > 120 || String(observaciones || '').length > 500) {
    return res.status(400).json({ error: 'La materia admite 120 caracteres y las observaciones 500' });
  }

  // Comprueba que docente y estudiante existan y estén activos.
  const docente = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(docente_id);
  const estudiante = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(estudiante_id);

  if (!docente)    return res.status(404).json({ error: 'Docente no encontrado o inactivo' });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado o inactivo' });

  // La materia tiene que ser una de las que el docente registró en su perfil.
  if (!(await docenteDictaAsignatura(docente.id, asignatura))) {
    return res.status(400).json({ error: `${docente.nombres} ${docente.apellidos} no tiene registrada la materia ${asignatura}` });
  }

  // Descarta un choque de horario del docente.
  const conflictoDoc = await db.prepare(
    "SELECT id FROM tutorias WHERE docente_id=? AND fecha=? AND hora=? AND estado NOT IN ('cancelada')"
  ).get(docente_id, fecha, hora);
  if (conflictoDoc) {
    return res.status(409).json({ error: 'El docente ya tiene una sesión a esa fecha y hora' });
  }

  // Descarta un choque de horario del estudiante.
  const conflictoEst = await db.prepare(
    "SELECT id FROM tutorias WHERE estudiante_id=? AND fecha=? AND hora=? AND estado NOT IN ('cancelada')"
  ).get(estudiante_id, fecha, hora);
  if (conflictoEst) {
    return res.status(409).json({ error: 'El estudiante ya tiene una sesión a esa fecha y hora' });
  }

  // Respeta el máximo de estudiantes por tutor antes de crear una asignación nueva.
  const errorCupo = await errorCupoTutor(docente.id, estudiante.id);
  if (errorCupo) return res.status(409).json({ error: errorCupo });

  // Crea la tutoría ya confirmada.
  const result = await db.prepare(`
    INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, modalidad, estado, observaciones)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id
  `).get(estudiante_id, docente_id, asignatura, fecha, hora, modalidad || 'Virtual', 'confirmada', observaciones || '');

  const tutoriaId = result.id;
  const fechaHora = `${fecha} a las ${hora.slice(0,5)}`;

  // Crea la asignación estudiante-docente si aún no existe.
  const asigExiste = await db.prepare(
    "SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'"
  ).get(estudiante_id, docente_id);

  if (!asigExiste) {
    await db.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?)').run(estudiante_id, docente_id);
  }

  // Registra la clase en el historial del administrador.
  await db.prepare('INSERT INTO clases_admin (docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones, programado_por) VALUES (?,?,?,?,?,?,?,?)').run(
    docente_id, estudiante_id, asignatura, fecha, hora, modalidad || 'Virtual', observaciones || '', req.usuario.id
  );

  // Notifica al docente.
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    docente_id, '📅',
    'Nueva asesoría: ' + asignatura,
    `Sesión programada con ${estudiante.nombres} ${estudiante.apellidos} el ${fechaHora}. Modalidad: ${modalidad || 'Virtual'}. ${observaciones ? 'Nota: ' + observaciones : ''}`
  );

  // Notifica al estudiante.
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    estudiante_id, '📅',
    'Asesoría programada: ' + asignatura,
    `El administrador programó una sesión con ${docente.nombres} ${docente.apellidos} el ${fechaHora}. Modalidad: ${modalidad || 'Virtual'}. ${observaciones ? 'Nota: ' + observaciones : ''}`
  );

  await auditar(req, 'ASESORIA_PROGRAMADA', `Tutoría #${tutoriaId}: ${asignatura} — Doc ${docente_id} + Est ${estudiante_id}`);

  res.json({
    mensaje: `Asesoría creada. Se notificó a ${docente.nombres} ${docente.apellidos} y a ${estudiante.nombres} ${estudiante.apellidos}.`,
    tutoria_id: tutoriaId
  });
}

// Lista las clases programadas por el administrador.
async function listarClasesAdmin(req, res) {
  const clases = await db.prepare(`
    SELECT ca.id, ca.asignatura, ca.fecha, ca.hora, ca.modalidad, ca.observaciones, ca.creada_en,
           ud.nombres||' '||ud.apellidos AS nombre_docente,
           ue.nombres||' '||ue.apellidos AS nombre_estudiante,
           ua.nombres||' '||ua.apellidos AS programado_por_nombre
    FROM clases_admin ca
    JOIN usuarios ud ON ud.id = ca.docente_id
    JOIN usuarios ue ON ue.id = ca.estudiante_id
    LEFT JOIN usuarios ua ON ua.id = ca.programado_por
    ORDER BY ca.fecha DESC, ca.hora DESC
    LIMIT 100
  `).all();
  res.json(clases);
}

module.exports = {
  listarUsuarios, cambiarEstado, crearUsuario, actualizarUsuario, eliminarUsuario, estadisticas,
  listarProgramas, enviarNotificacion, historialNotificaciones, verAuditoria, archivarAuditoria,
  listarAsignaciones, crearAsignacion, eliminarAsignacion, obtenerConfiguracion, guardarConfiguracion,
  resetearConfiguracion, listarPeriodos, crearPeriodo, cerrarPeriodo, activarPeriodo, reportes,
  buscarUsuario, programarClase, listarClasesAdmin
};
