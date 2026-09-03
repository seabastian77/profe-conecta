const { db } = require('../config/db');
const { obtenerOCrearId } = require('./asignaturasController');


// ── POST /api/perfil/estudiante ─────────────────────────
async function guardarPerfilEstudiante(req, res) {
  const { documento, programa, semestre, telefono, promedio } = req.body;
  const usuario_id = req.usuario.id;

  if (!documento || !programa || !semestre) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: documento, programa y semestre' });
  }

  const promedioNum = parseFloat(promedio) || 0;

  await db.prepare(`
    INSERT INTO perfiles_estudiante (usuario_id, codigo, documento, programa, semestre, telefono, promedio)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET
      codigo=excluded.codigo, documento=excluded.documento, programa=excluded.programa,
      semestre=excluded.semestre, telefono=excluded.telefono, promedio=excluded.promedio
  `).run(usuario_id, documento, documento, programa, semestre, telefono || '', promedioNum);
  res.json({ mensaje: 'Perfil guardado' });
}

// ── POST /api/perfil/docente ────────────────────────────
async function guardarPerfilDocente(req, res) {
  const { cedula, facultad, telefono, asignaturas, programas, horarios } = req.body;
  const usuario_id = req.usuario.id;

  if (!cedula || !facultad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: cédula y facultad' });
  }

  await db.prepare(`
    INSERT INTO perfiles_docente (usuario_id, cedula, codigo_docente, facultad, telefono)
    VALUES (?,?,?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET
      cedula=excluded.cedula, codigo_docente=excluded.codigo_docente,
      facultad=excluded.facultad, telefono=excluded.telefono
  `).run(usuario_id, cedula, cedula, facultad, telefono || '');

  const perfil = await db.prepare('SELECT id FROM perfiles_docente WHERE usuario_id = ?').get(usuario_id);

  // Asignaturas: verificar/crear en catálogo y vincular con el docente
  await db.prepare('DELETE FROM docente_asignaturas WHERE docente_id = ?').run(perfil.id);
  if (Array.isArray(asignaturas) && asignaturas.length > 0) {
    const insertar = await db.prepare(
      'INSERT INTO docente_asignaturas (docente_id, asignatura_id) VALUES (?,?) ON CONFLICT DO NOTHING'
    );
    for (const nombre of asignaturas) {
      if (!nombre || !nombre.trim()) continue;
      const asignaturaId = await obtenerOCrearId(nombre.trim());
      insertar.run(perfil.id, asignaturaId);
    }
  }

  // Programas académicos
  await db.prepare('DELETE FROM docente_programas WHERE docente_id = ?').run(perfil.id);
  if (Array.isArray(programas) && programas.length > 0) {
    const insP = await db.prepare('INSERT INTO docente_programas (docente_id, programa) VALUES (?,?) ON CONFLICT DO NOTHING');
    programas.forEach(p => insP.run(perfil.id, p));
  }

  // Horarios disponibles
  await db.prepare('DELETE FROM docente_horarios WHERE docente_id = ?').run(perfil.id);
  if (Array.isArray(horarios) && horarios.length > 0) {
    const insH = await db.prepare('INSERT INTO docente_horarios (docente_id, dia, hora_inicio, hora_fin, lugar) VALUES (?,?,?,?,?)');
    horarios.forEach(h => insH.run(perfil.id, h.dia, h.hora_inicio, h.hora_fin, h.lugar || 'Por definir'));
  }

  res.json({ mensaje: 'Perfil guardado' });
}

// ── POST /api/perfil/admin ──────────────────────────────
async function guardarPerfilAdmin(req, res) {
  const { cedula, cargo, dependencia, telefono } = req.body;
  const usuario_id = req.usuario.id;

  if (!cedula || !cargo) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  await db.prepare(`
    INSERT INTO perfiles_admin (usuario_id, cedula, cargo, dependencia, telefono)
    VALUES (?,?,?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET
      cedula=excluded.cedula, cargo=excluded.cargo,
      dependencia=excluded.dependencia, telefono=excluded.telefono
  `).run(usuario_id, cedula, cargo, dependencia || '', telefono || '');

  res.json({ mensaje: 'Perfil guardado' });
}

// ── GET /api/perfil ─────────────────────────────────────
async function obtenerPerfil(req, res) {
  const { id, rol } = req.usuario;

  const usuario = await db.prepare(
    'SELECT id, nombres, apellidos, correo, rol, creado_en FROM usuarios WHERE id = ?'
  ).get(id);

  if (!usuario) return res.status(404).json({ error: 'No encontrado' });

  if (rol === 'estudiante') {
    usuario.perfil = await db.prepare('SELECT * FROM perfiles_estudiante WHERE usuario_id = ?').get(id) || null;

  } else if (rol === 'docente') {
    const perfil = await db.prepare('SELECT * FROM perfiles_docente WHERE usuario_id = ?').get(id);
    if (perfil) {
      const asignaturas = await db.prepare(`
        SELECT a.id, a.nombre
        FROM docente_asignaturas da
        JOIN asignaturas a ON a.id = da.asignatura_id
        WHERE da.docente_id = ?
        ORDER BY a.nombre
      `).all(perfil.id);
      perfil.asignaturas = asignaturas.map(a => a.nombre);
      const programas = await db.prepare('SELECT programa FROM docente_programas WHERE docente_id = ?').all(perfil.id);
      perfil.programas = programas.map(p => p.programa);
      perfil.horarios = await db.prepare('SELECT dia, hora_inicio, hora_fin, lugar FROM docente_horarios WHERE docente_id = ? ORDER BY id').all(perfil.id);
    }
    usuario.perfil = perfil || null;

  } else if (rol === 'admin') {
    usuario.perfil = await db.prepare('SELECT * FROM perfiles_admin WHERE usuario_id = ?').get(id) || null;
  }

  usuario.fotos = await db.prepare('SELECT foto_perfil, foto_portada FROM fotos_usuario WHERE usuario_id = ?').get(id) || {};

  res.json(usuario);
}

// ── POST /api/perfil/foto ───────────────────────────────
async function subirFoto(req, res) {
  const { foto_base64, tipo } = req.body;
  const usuario_id = req.usuario.id;

  if (!foto_base64) return res.status(400).json({ error: 'No se recibió foto' });

  const campo = tipo === 'portada' ? 'foto_portada' : 'foto_perfil';

  await db.prepare(`
    INSERT INTO fotos_usuario (usuario_id, ${campo}) VALUES (?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET ${campo}=excluded.${campo}
  `).run(usuario_id, foto_base64);

  res.json({ mensaje: 'Foto guardada' });
}

module.exports = { guardarPerfilEstudiante, guardarPerfilDocente, guardarPerfilAdmin, obtenerPerfil, subirFoto };
