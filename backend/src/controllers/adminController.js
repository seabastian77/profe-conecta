const { db } = require('../config/db');
const bcrypt = require('bcrypt');

// ── USUARIOS ──────────────────────────────────────────

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
    if (estado === 'alerta')   sql += ' AND pe.promedio < 3.0';
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

async function cambiarEstado(req, res) {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean' });
  await db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(activo ? 1 : 0, req.params.id);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(
    req.usuario.id, activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', 'Usuario ID ' + req.params.id
  );
  res.json({ mensaje: 'Usuario ' + (activo ? 'activado' : 'desactivado') });
}

async function crearUsuario(req, res) {
  const { nombres, apellidos, correo, rol, contrasena } = req.body;
  if (!nombres || !apellidos || !correo || !rol) return res.status(400).json({ error: 'Faltan campos' });

  if (!['estudiante', 'docente', 'admin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }

  // Antes: bcrypt.hashSync(contrasena || 'Cambiar123', 10).
  // Dos problemas. Uno, la contraseña por defecto estaba escrita en un
  // repositorio público, así que toda cuenta creada sin indicar contraseña
  // quedaba con una clave que cualquiera podía leer. Dos, 10 rondas cuando el
  // resto del sistema usa 12. Ahora la contraseña es obligatoria.
  if (!contrasena || contrasena.length < 8) {
    return res.status(400).json({ error: 'La contraseña es obligatoria y debe tener mínimo 8 caracteres' });
  }

  const existe = await db.prepare('SELECT id FROM usuarios WHERE correo=?').get(correo);
  if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });

  const hash = await bcrypt.hash(contrasena, 12);
  // RETURNING id: sin él, result.id era undefined y la API respondía
  // {mensaje:'Usuario creado', id: undefined}.
  const result = await db.prepare('INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id').get(nombres, apellidos, correo, hash, rol);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'CREAR_USUARIO', nombres + ' ' + apellidos);
  res.json({ mensaje: 'Usuario creado', id: result.id });
}

// ── ESTADÍSTICAS ──────────────────────────────────────

async function estadisticas(req, res) {
  // Función auxiliar para contar — PostgreSQL devuelve count como string
  async function cnt(sql, ...params) {
    const row = await db.prepare(sql).get(...params);
    return parseInt(row?.n || row?.count || 0);
  }
  const mesActual = new Date().toISOString().slice(0, 7);
  const totales     = await cnt("SELECT COUNT(*) AS n FROM usuarios WHERE activo=1");
  const alertas     = await cnt("SELECT COUNT(*) AS n FROM perfiles_estudiante WHERE promedio < 3.0");
  const tutMes      = await cnt("SELECT COUNT(*) AS n FROM tutorias WHERE fecha LIKE ? AND estado!='cancelada'", mesActual + '%');
  const totalTut    = await cnt("SELECT COUNT(*) AS n FROM tutorias");
  const realizadas  = await cnt("SELECT COUNT(*) AS n FROM tutorias WHERE estado='completada'");
  const perfEst     = await cnt("SELECT COUNT(*) AS n FROM perfiles_estudiante");
  const perfDoc     = await cnt("SELECT COUNT(*) AS n FROM perfiles_docente");
  const perfAdm     = await cnt("SELECT COUNT(*) AS n FROM perfiles_admin");
  const asignaciones = await cnt("SELECT COUNT(*) AS n FROM asignaciones WHERE estado='activa'");
  const notifs      = await cnt("SELECT COUNT(*) AS n FROM notificaciones WHERE leida=0");
  res.json({
    total_usuarios: totales,
    alertas_activas: alertas,
    tutorias_este_mes: tutMes,
    total_tutorias: totalTut,
    perfiles_completos: perfEst + perfDoc + perfAdm,
    total_asignaciones: asignaciones,
    notificaciones_pendientes: notifs,
    tasa_recuperacion: totalTut > 0 ? Math.round(realizadas / totalTut * 100) + '%' : '0%'
  });
}

// ── NOTIFICACIONES ────────────────────────────────────

async function enviarNotificacion(req, res) {
  const { destinatario, tipo, asunto, mensaje } = req.body;
  if (!asunto || !mensaje) return res.status(400).json({ error: 'Faltan asunto o mensaje' });
  var usuarios = [];
  if (destinatario && destinatario.includes('alerta')) {
    usuarios = await db.prepare('SELECT usuario_id AS id FROM perfiles_estudiante WHERE promedio < 3.0').all();
  } else if (destinatario && destinatario.includes('docente')) {
    usuarios = await db.prepare("SELECT id FROM usuarios WHERE rol='docente' AND activo=1").all();
  } else {
    usuarios = await db.prepare("SELECT id FROM usuarios WHERE activo=1").all();
  }
  const icono = (tipo && tipo.includes('Alerta')) ? '⚠️' : (tipo && tipo.includes('Recordatorio')) ? '📅' : '📢';

  // Antes: un INSERT por usuario dentro de un bucle (N+1). Con 500 estudiantes
  // eran 500 viajes a la base y 500 transacciones sueltas: lento, y si fallaba
  // a la mitad quedaban unos notificados y otros no.
  // Ahora: un solo INSERT con todas las filas, usando UNNEST.
  const ids = usuarios.map(u => u.id || u.usuario_id).filter(Boolean);

  if (ids.length > 0) {
    await db.pool.query(
      `INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion)
       SELECT id, $2, $3, $4 FROM UNNEST($1::int[]) AS t(id)`,
      [ids, icono, asunto, mensaje]
    );
  }
  await db.prepare('INSERT INTO historial_notificaciones (destinatario, tipo, asunto, mensaje, cantidad, enviado_por) VALUES (?,?,?,?,?,?)').run(destinatario || 'Todos', tipo || 'General', asunto, mensaje, usuarios.length, req.usuario.id);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'NOTIFICACION', 'A ' + usuarios.length + ' usuarios: ' + asunto);
  res.json({ mensaje: 'Enviado a ' + usuarios.length + ' usuarios', cantidad: usuarios.length });
}

async function historialNotificaciones(req, res) {
  res.json(await db.prepare('SELECT * FROM historial_notificaciones ORDER BY creada_en DESC LIMIT 100').all());
}

// ── AUDITORÍA ─────────────────────────────────────────

async function verAuditoria(req, res) {
  const { tipo, fecha } = req.query;
  let sql = "SELECT a.*, u.correo AS correo_usuario FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE 1=1";
  const params = [];
  if (tipo) { sql += ' AND a.evento LIKE ?'; params.push('%' + tipo + '%'); }
  if (fecha) { sql += ' AND a.creada_en::date = ?::date'; params.push(fecha); }
  sql += ' ORDER BY a.creada_en DESC LIMIT 500';
  res.json(await db.prepare(sql).all(...params));
}

// ── ASIGNACIONES ──────────────────────────────────────

async function listarAsignaciones(req, res) {
  res.json(await db.prepare("SELECT a.id, a.estado, a.creada_en, ue.nombres||' '||ue.apellidos AS nombre_estudiante, pe.programa, pe.promedio, ud.nombres||' '||ud.apellidos AS nombre_docente FROM asignaciones a JOIN usuarios ue ON ue.id=a.estudiante_id JOIN usuarios ud ON ud.id=a.docente_id LEFT JOIN perfiles_estudiante pe ON pe.usuario_id=a.estudiante_id WHERE a.estado='activa' ORDER BY a.creada_en DESC").all());
}

async function crearAsignacion(req, res) {
  const { estudiante_id, docente_id } = req.body;
  if (!estudiante_id || !docente_id) return res.status(400).json({ error: 'Faltan datos' });
  var existe = await db.prepare("SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'").get(estudiante_id, docente_id);
  if (existe) return res.status(409).json({ error: 'Ya existe esta asignación' });
  const result = await db.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?) RETURNING id').get(estudiante_id, docente_id);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'ASIGNACION_CREADA', 'Est ' + estudiante_id + ' → Doc ' + docente_id);
  res.json({ mensaje: 'Asignación creada', id: result.id });
}

async function eliminarAsignacion(req, res) {
  await db.prepare("UPDATE asignaciones SET estado='removida' WHERE id=?").run(req.params.id);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'ASIGNACION_ELIMINADA', 'ID ' + req.params.id);
  res.json({ mensaje: 'Asignación eliminada' });
}

// ── CONFIGURACIÓN ─────────────────────────────────────

async function obtenerConfiguracion(req, res) {
  var rows = await db.prepare('SELECT * FROM configuracion').all();
  var config = {};
  rows.forEach(function(r) { config[r.clave] = r.valor; });
  res.json(config);
}

async function guardarConfiguracion(req, res) {
  const { clave, valor } = req.body;
  if (!clave || valor === undefined) return res.status(400).json({ error: 'Faltan datos' });
  await db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT (clave) DO UPDATE SET valor=excluded.valor').run(clave, String(valor));
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'CONFIG', clave + ' = ' + valor);
  res.json({ mensaje: 'Guardado' });
}

async function resetearConfiguracion(req, res) {
  await db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('umbral_alerta','3.0') ON CONFLICT (clave) DO UPDATE SET valor='3.0'").run();
  await db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('max_estudiantes_tutor','15') ON CONFLICT (clave) DO UPDATE SET valor='15'").run();
  await db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('horas_cancelacion','24') ON CONFLICT (clave) DO UPDATE SET valor='24'").run();
  await db.prepare("INSERT INTO configuracion (clave, valor) VALUES ('minutos_sesion','120') ON CONFLICT (clave) DO UPDATE SET valor='120'").run();
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'CONFIG_RESET', 'Valores restaurados');
  res.json({ mensaje: 'Configuración reseteada' });
}

// ── PERÍODOS ──────────────────────────────────────────

async function listarPeriodos(req, res) {
  res.json(await db.prepare('SELECT * FROM periodos ORDER BY id DESC').all());
}

async function crearPeriodo(req, res) {
  const { nombre, inicio, fin } = req.body;
  if (!nombre || !inicio || !fin) return res.status(400).json({ error: 'Faltan datos' });
  var result = await db.prepare("INSERT INTO periodos (nombre, inicio, fin, estado) VALUES (?,?,?,'proximo') RETURNING id").get(nombre, inicio, fin);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'PERIODO_CREADO', nombre);
  res.json({ mensaje: 'Período creado', id: result.id });
}

async function cerrarPeriodo(req, res) {
  await db.prepare("UPDATE periodos SET estado='cerrado' WHERE id=?").run(req.params.id);
  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(req.usuario.id, 'PERIODO_CERRADO', 'ID ' + req.params.id);
  res.json({ mensaje: 'Período cerrado' });
}

// ── BUSCAR USUARIO (por cédula o nombre) ─────────────────

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
      AND (u.nombres ILIKE ? OR u.apellidos ILIKE ? OR pe.documento ILIKE ? OR pd.cedula ILIKE ?)
  `;
  const params = [like, like, like, like];
  if (rol) { sql += ' AND u.rol = ?'; params.push(rol); }
  sql += ' ORDER BY u.nombres LIMIT 10';
  const resultados = (await db.prepare(sql).all(...params)).map(u => ({
    id: u.id,
    nombre: u.nombres + ' ' + u.apellidos,
    correo: u.correo,
    rol: u.rol,
    cedula: u.cedula_doc || u.cedula_est || '—',
    info: u.facultad || u.programa || '—'
  }));
  res.json(resultados);
}

// ── PUT /api/admin/usuarios/:id ────────────────────────
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

    // Borrar registros relacionados en orden correcto (respetar llaves foráneas)
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

    try {
      await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(
        req.usuario.id, 'ELIMINAR_USUARIO',
        'Usuario #' + id + ' (' + existe.nombres + ' ' + existe.apellidos + ') eliminado permanentemente'
      );
    } catch {}

    res.json({ mensaje: existe.nombres + ' ' + existe.apellidos + ' eliminado permanentemente' });
  } catch(err) {
    console.error('eliminarUsuario error:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
}

async function actualizarUsuario(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { nombres, apellidos, correo, rol, contrasena } = req.body;

    if (!nombres || !apellidos || !correo || !rol) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const existe = await db.prepare('SELECT id FROM usuarios WHERE id=?').get(id);
    if (!existe) return res.status(404).json({ error: 'Usuario no encontrado (ID: ' + id + ')' });

    if (contrasena && contrasena.length >= 6) {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash(contrasena, 10);
      await db.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=?, contrasena=? WHERE id=?').run(nombres, apellidos, correo, rol, hash, id);
    } else {
      await db.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=? WHERE id=?').run(nombres, apellidos, correo, rol, id);
    }

    try {
      await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(
        req.usuario.id, 'EDITAR_USUARIO', 'Usuario #' + id + ' actualizado por admin'
      );
    } catch { /* auditoria no crítica */ }

    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch(err) {
    console.error('Error actualizarUsuario:', err.message);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

// ── PROGRAMAR CLASE (admin programa asesoría) ────────────

async function programarClase(req, res) {
  const { docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones } = req.body;

  if (!docente_id || !estudiante_id || !asignatura || !fecha || !hora) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: docente, estudiante, materia, fecha y hora' });
  }

  // Verificar existencia de usuarios con el rol correcto
  const docente = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='docente' AND activo=1").get(docente_id);
  const estudiante = await db.prepare("SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND rol='estudiante' AND activo=1").get(estudiante_id);

  if (!docente)    return res.status(404).json({ error: 'Docente no encontrado o inactivo' });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado o inactivo' });

  // Verificar conflicto de horario para el docente
  const conflictoDoc = await db.prepare(
    "SELECT id FROM tutorias WHERE docente_id=? AND fecha=? AND hora=? AND estado NOT IN ('cancelada')"
  ).get(docente_id, fecha, hora);
  if (conflictoDoc) {
    return res.status(409).json({ error: 'El docente ya tiene una sesión a esa fecha y hora' });
  }

  // Verificar conflicto para el estudiante
  const conflictoEst = await db.prepare(
    "SELECT id FROM tutorias WHERE estudiante_id=? AND fecha=? AND hora=? AND estado NOT IN ('cancelada')"
  ).get(estudiante_id, fecha, hora);
  if (conflictoEst) {
    return res.status(409).json({ error: 'El estudiante ya tiene una sesión a esa fecha y hora' });
  }

  // Crear la tutoría con estado 'confirmada'
  const result = await db.prepare(`
    INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, modalidad, estado, observaciones)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id
  `).get(estudiante_id, docente_id, asignatura, fecha, hora, modalidad || 'Virtual', 'confirmada', observaciones || '');

  const tutoriaId = result.id;
  const fechaHora = `${fecha} a las ${hora.slice(0,5)}`;

  // Crear asignación automáticamente si no existe
  const asigExiste = await db.prepare(
    "SELECT id FROM asignaciones WHERE estudiante_id=? AND docente_id=? AND estado='activa'"
  ).get(estudiante_id, docente_id);

  if (!asigExiste) {
    await db.prepare('INSERT INTO asignaciones (estudiante_id, docente_id) VALUES (?,?)').run(estudiante_id, docente_id);
  }

  // Guardar en clases_admin
  await db.prepare('INSERT INTO clases_admin (docente_id, estudiante_id, asignatura, fecha, hora, modalidad, observaciones, programado_por) VALUES (?,?,?,?,?,?,?,?)').run(
    docente_id, estudiante_id, asignatura, fecha, hora, modalidad || 'Virtual', observaciones || '', req.usuario.id
  );

  // Notificación al docente
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    docente_id, '📅',
    'Nueva asesoría: ' + asignatura,
    `Sesión programada con ${estudiante.nombres} ${estudiante.apellidos} el ${fechaHora}. Modalidad: ${modalidad || 'Virtual'}. ${observaciones ? 'Nota: ' + observaciones : ''}`
  );

  // Notificación al estudiante
  await db.prepare('INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion) VALUES (?,?,?,?)').run(
    estudiante_id, '📅',
    'Asesoría programada: ' + asignatura,
    `El administrador programó una sesión con ${docente.nombres} ${docente.apellidos} el ${fechaHora}. Modalidad: ${modalidad || 'Virtual'}. ${observaciones ? 'Nota: ' + observaciones : ''}`
  );

  await db.prepare('INSERT INTO auditoria (usuario_id, evento, detalle) VALUES (?,?,?)').run(
    req.usuario.id, 'ASESORIA_PROGRAMADA',
    `Tutoría #${tutoriaId}: ${asignatura} — Doc ${docente_id} + Est ${estudiante_id}`
  );

  res.json({
    mensaje: `Asesoría creada. Se notificó a ${docente.nombres} ${docente.apellidos} y a ${estudiante.nombres} ${estudiante.apellidos}.`,
    tutoria_id: tutoriaId
  });
}

// ── LISTAR CLASES PROGRAMADAS POR ADMIN ─────────────────

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

module.exports = { listarUsuarios, cambiarEstado, crearUsuario, actualizarUsuario, eliminarUsuario, estadisticas, enviarNotificacion, historialNotificaciones, verAuditoria, listarAsignaciones, crearAsignacion, eliminarAsignacion, obtenerConfiguracion, guardarConfiguracion, resetearConfiguracion, listarPeriodos, crearPeriodo, cerrarPeriodo, buscarUsuario, programarClase, listarClasesAdmin };
