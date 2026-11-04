const bcrypt = require('bcrypt');
const { db } = require('../../config/db');
const { CLAVES, bloquear } = require('../../config/bloqueos');
const { RONDAS_BCRYPT, validarContrasena } = require('../../config/seguridad');
const { auditar } = require('../../config/auditoria');
const { umbralAlerta, condicionAlerta } = require('../../config/reglasTutoria');
const {
  nombrePersonaValido, normalizarCorreo, correoValido, escaparLike, paginacion
} = require('../../config/validaciones');

const ROLES = ['estudiante', 'docente', 'admin'];

const DESDE_USUARIOS = `
  FROM usuarios u
  LEFT JOIN perfiles_estudiante pe ON pe.usuario_id = u.id
  LEFT JOIN perfiles_docente pd ON pd.usuario_id = u.id
  LEFT JOIN perfiles_admin pa ON pa.usuario_id = u.id`;

// Serializa los cambios sobre administradores para que dos a la vez no dejen el sistema sin ninguno.
function bloquearAdministradores(tx) {
  return bloquear(tx, CLAVES.ADMINISTRADORES);
}

// Cuenta los administradores activos distintos del indicado.
async function otrosAdministradoresActivos(tx, id) {
  const fila = await tx.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ?").get(id);
  return parseInt(fila?.n || 0);
}

// Arma las condiciones del listado a partir de los filtros de rol, estado y búsqueda.
async function condicionesDeUsuarios({ rol, estado, q }) {
  let donde = 'WHERE 1=1';
  const params = [];
  if (rol) { donde += ' AND u.rol = ?'; params.push(String(rol)); }
  if (estado === 'activo') donde += ' AND u.activo = 1';
  if (estado === 'inactivo') donde += ' AND u.activo = 0';
  if (estado === 'alerta') { donde += ` AND u.activo = 1 AND ${condicionAlerta('pe.promedio')}`; params.push(await umbralAlerta()); }
  if (q && String(q).trim()) {
    donde += ' AND (u.nombres ILIKE ? OR u.apellidos ILIKE ? OR u.correo ILIKE ?)';
    const like = '%' + escaparLike(String(q).trim()) + '%';
    params.push(like, like, like);
  }
  return { donde, params };
}

// Lista los usuarios con filtros de rol, estado y búsqueda; devuelve el total en la cabecera X-Total-Count.
async function listarUsuarios(req, res) {
  const { limite, desplazamiento } = paginacion(req.query, { porDefecto: 500, maximo: 500 });
  const { donde, params } = await condicionesDeUsuarios(req.query);

  const [filas, total] = await Promise.all([
    db.prepare(`
      SELECT u.id, u.nombres, u.apellidos, u.correo, u.rol, u.activo, u.creado_en,
             pe.programa, pe.semestre, pe.promedio, pd.facultad, pa.dependencia
      ${DESDE_USUARIOS} ${donde}
      ORDER BY u.creado_en DESC, u.id DESC LIMIT ? OFFSET ?
    `).all(...params, limite, desplazamiento),
    db.prepare(`SELECT COUNT(*) AS n ${DESDE_USUARIOS} ${donde}`).get(...params)
  ]);

  res.set('X-Total-Count', String(parseInt(total?.n || 0)));
  res.json(filas);
}

// Activa o desactiva una cuenta sin permitir que el administrador se bloquee a sí mismo ni al último admin.
async function cambiarEstado(req, res) {
  const { activo } = req.body;
  const id = Number(req.params.id);
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'activo debe ser boolean' });
  if (!activo && id === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
  }

  const resultado = await db.transaccion(async (tx) => {
    await bloquearAdministradores(tx);
    const usuario = await tx.prepare('SELECT id, rol, activo FROM usuarios WHERE id = ? FOR UPDATE').get(id);
    if (!usuario) return { estado: 404, error: 'Usuario no encontrado' };
    if (!activo && usuario.rol === 'admin' && usuario.activo === 1 && (await otrosAdministradoresActivos(tx, id)) === 0) {
      return { estado: 400, error: 'No puedes desactivar al último administrador activo' };
    }
    await tx.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, id);
    return { ok: true };
  });

  if (!resultado.ok) return res.status(resultado.estado).json({ error: resultado.error });
  await auditar(req, activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO', 'Usuario ID ' + id);
  res.json({ mensaje: 'Usuario ' + (activo ? 'activado' : 'desactivado') });
}

// Valida los datos comunes de crear y editar un usuario; devuelve el error o null.
function errorDatosUsuario({ nombres, apellidos, correo, rol }) {
  if (!nombres || !apellidos || !correo || !rol) return 'Faltan campos obligatorios';
  if (!ROLES.includes(rol)) return 'Rol inválido';
  if (!nombrePersonaValido(nombres) || !nombrePersonaValido(apellidos)) return 'Nombres y apellidos solo admiten letras';
  if (!correoValido(correo)) return 'El correo no es válido';
  return null;
}

// Crea un usuario desde el panel con correo normalizado y contraseña obligatoria y validada.
async function crearUsuario(req, res) {
  const { nombres, apellidos, rol, contrasena } = req.body;
  const correo = normalizarCorreo(req.body.correo);

  const errorDatos = errorDatosUsuario({ nombres, apellidos, correo, rol });
  if (errorDatos) return res.status(400).json({ error: errorDatos === 'Faltan campos obligatorios' ? 'Faltan campos' : errorDatos });
  const errorClave = validarContrasena(contrasena);
  if (errorClave) return res.status(400).json({ error: errorClave });

  const existe = await db.prepare('SELECT id FROM usuarios WHERE lower(correo) = ?').get(correo);
  if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });

  const hash = await bcrypt.hash(contrasena, RONDAS_BCRYPT);
  let creado;
  try {
    creado = await db.prepare(
      'INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES (?,?,?,?,?) RETURNING id'
    ).get(nombres.trim(), apellidos.trim(), correo, hash, rol);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    throw err;
  }

  await auditar(req, 'CREAR_USUARIO', nombres.trim() + ' ' + apellidos.trim());
  res.json({ mensaje: 'Usuario creado', id: creado.id });
}

// Lee y valida el promedio recibido: undefined si no aplica, null si se deja sin registrar.
function leerPromedio(promedio, rol) {
  if (promedio === undefined || rol !== 'estudiante') return { valor: undefined };
  const valor = (promedio === null || promedio === '') ? null : Number(promedio);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || valor > 5)) {
    return { error: 'El promedio debe estar entre 0 y 5' };
  }
  return { valor };
}

// Actualiza los datos de un usuario y, si viene, su contraseña validada, protegiendo al último administrador.
async function actualizarUsuario(req, res) {
  const id = Number(req.params.id);
  const { nombres, apellidos, rol, contrasena, promedio } = req.body;
  const correo = normalizarCorreo(req.body.correo);

  const errorDatos = errorDatosUsuario({ nombres, apellidos, correo, rol });
  if (errorDatos) return res.status(400).json({ error: errorDatos === 'Faltan campos obligatorios' ? 'Faltan campos obligatorios' : errorDatos });

  const lectura = leerPromedio(promedio, rol);
  if (lectura.error) return res.status(400).json({ error: lectura.error });

  if (contrasena) {
    const errorClave = validarContrasena(contrasena);
    if (errorClave) return res.status(400).json({ error: errorClave });
  }
  if (id === req.usuario.id && rol !== 'admin') {
    return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador' });
  }

  const hash = contrasena ? await bcrypt.hash(contrasena, RONDAS_BCRYPT) : null;

  const resultado = await db.transaccion(async (tx) => {
    await bloquearAdministradores(tx);
    const actual = await tx.prepare('SELECT id, rol, activo FROM usuarios WHERE id = ? FOR UPDATE').get(id);
    if (!actual) return { estado: 404, error: 'Usuario no encontrado' };

    if (actual.rol === 'admin' && rol !== 'admin' && actual.activo === 1 && (await otrosAdministradoresActivos(tx, id)) === 0) {
      return { estado: 400, error: 'No puedes quitar el rol al último administrador activo' };
    }

    const ocupado = await tx.prepare('SELECT id FROM usuarios WHERE lower(correo) = ? AND id <> ?').get(correo, id);
    if (ocupado) return { estado: 409, error: 'Ya existe otro usuario con ese correo' };

    if (hash) {
      await tx.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=?, contrasena=? WHERE id=?')
        .run(nombres.trim(), apellidos.trim(), correo, rol, hash, id);
    } else {
      await tx.prepare('UPDATE usuarios SET nombres=?, apellidos=?, correo=?, rol=? WHERE id=?')
        .run(nombres.trim(), apellidos.trim(), correo, rol, id);
    }

    if (lectura.valor !== undefined) {
      await tx.prepare(
        'INSERT INTO perfiles_estudiante (usuario_id, promedio) VALUES (?,?) ON CONFLICT (usuario_id) DO UPDATE SET promedio=excluded.promedio'
      ).run(id, lectura.valor);
    }
    return { ok: true, rolAnterior: actual.rol };
  });

  if (!resultado.ok) return res.status(resultado.estado).json({ error: resultado.error });

  const cambioDeRol = resultado.rolAnterior !== rol ? ` (rol ${resultado.rolAnterior} → ${rol})` : '';
  await auditar(req, 'EDITAR_USUARIO', 'Usuario #' + id + ' actualizado por admin' + cambioDeRol);
  res.json({ mensaje: 'Usuario actualizado correctamente' });
}

// Elimina un usuario; sus perfiles, tutorías y notificaciones caen en cascada y la auditoría se conserva sin usuario.
async function eliminarUsuario(req, res) {
  const id = Number(req.params.id);
  if (id === req.usuario.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }
  const existe = await db.prepare('SELECT id, nombres, apellidos, rol FROM usuarios WHERE id = ?').get(id);
  if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (existe.rol === 'admin') {
    return res.status(400).json({ error: 'No se puede eliminar a otro administrador' });
  }

  await db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  const nombre = existe.nombres + ' ' + existe.apellidos;
  await auditar(req, 'ELIMINAR_USUARIO', 'Usuario #' + id + ' (' + nombre + ') eliminado permanentemente');
  res.json({ mensaje: nombre + ' eliminado permanentemente' });
}

// Busca usuarios activos por nombre, correo o cédula para los selectores del panel.
async function buscarUsuario(req, res) {
  const { q, rol } = req.query;
  if (!q || String(q).trim().length < 2) return res.status(400).json({ error: 'Ingresa al menos 2 caracteres' });
  const like = '%' + escaparLike(String(q).trim()) + '%';
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
  if (rol) { sql += ' AND u.rol = ?'; params.push(String(rol)); }
  sql += ' ORDER BY u.nombres LIMIT 10';

  const filas = await db.prepare(sql).all(...params);
  res.json(filas.map(u => ({
    id: u.id,
    nombre: u.nombres + ' ' + u.apellidos,
    correo: u.correo,
    rol: u.rol,
    cedula: u.cedula_doc || u.cedula_est || '—',
    info: u.facultad || u.programa || u.correo || '—'
  })));
}

module.exports = { listarUsuarios, cambiarEstado, crearUsuario, actualizarUsuario, eliminarUsuario, buscarUsuario };
