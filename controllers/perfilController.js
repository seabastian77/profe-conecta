const { db } = require('../config/db');
const { esHoraValida } = require('../config/fechas');
const { textoSeguro } = require('../config/validaciones');
const { obtenerOCrearId, nombreMateriaValido } = require('./asignaturasController');

const MAX_ASIGNATURAS = 30;
const MAX_PROGRAMAS = 20;
const MAX_HORARIOS = 30;
const MAX_BYTES_FOTO = 2 * 1024 * 1024;
const FORMATO_FOTO = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

// Comprueba los primeros bytes de la imagen decodificada: el tipo declarado en el texto no basta.
const FIRMAS_FOTO = {
  png:  (b) => b.length >= 8 && b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG',
  jpg:  (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif:  (b) => b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8',
  webp: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
};

// Aplica a docentes y administradores la misma regla del documento del estudiante: solo números.
function errorCedulaTelefono(cedula, telefono) {
  if (!/^\d{6,11}$/.test(String(cedula).trim())) return 'La cédula debe tener solo números (entre 6 y 11 dígitos)';
  const tel = String(telefono || '').trim();
  if (tel && !/^\d{7,10}$/.test(tel)) return 'El teléfono debe tener entre 7 y 10 números';
  return null;
}

// Devuelve el texto recortado si es una cadena, o '' si no lo es.
const comoTexto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Indica si otra cuenta ya tiene registrado ese documento en la tabla y columna indicadas.
async function documentoEnOtraCuenta(tabla, columna, valor, usuarioId, ejecutor = db) {
  const fila = await ejecutor.prepare(`SELECT usuario_id FROM ${tabla} WHERE ${columna} = ? AND usuario_id <> ? LIMIT 1`).get(valor, usuarioId);
  return Boolean(fila);
}

// Crea o actualiza el perfil del estudiante.
async function guardarPerfilEstudiante(req, res) {
  const usuario_id = req.usuario.id;
  const documento = String(req.body.documento ?? '').trim();
  const programa = comoTexto(req.body.programa);
  const semestre = String(req.body.semestre ?? '').trim();
  const telefono = String(req.body.telefono ?? '').trim();

  if (!documento || !programa || !semestre) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: documento, programa y semestre' });
  }

  // CC y TI son solo números: antes se guardaba cualquier texto, como «: 1098765432».
  if (!/^\d{6,11}$/.test(documento)) {
    return res.status(400).json({ error: 'El documento debe tener solo números (entre 6 y 11 dígitos)' });
  }
  if (telefono && !/^\d{7,10}$/.test(telefono)) {
    return res.status(400).json({ error: 'El teléfono debe tener entre 7 y 10 números' });
  }
  if (!textoSeguro(programa, { min: 2, max: 120 })) {
    return res.status(400).json({ error: 'El programa no es válido' });
  }
  if (!/^([1-9]|1[0-2])$/.test(semestre)) {
    return res.status(400).json({ error: 'El semestre debe ser un número entre 1 y 12' });
  }
  if (await documentoEnOtraCuenta('perfiles_estudiante', 'documento', documento, usuario_id)) {
    return res.status(409).json({ error: 'Ese documento ya está registrado en otra cuenta' });
  }

  // El promedio no lo fija el estudiante: lo registra la institución desde la gestión de usuarios.
  try {
    await db.prepare(`
      INSERT INTO perfiles_estudiante (usuario_id, codigo, documento, programa, semestre, telefono)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(usuario_id) DO UPDATE SET
        codigo=excluded.codigo, documento=excluded.documento, programa=excluded.programa,
        semestre=excluded.semestre, telefono=excluded.telefono
    `).run(usuario_id, documento, documento, programa, semestre, telefono);
  } catch (err) {
    if (err.constraint === 'uq_perfiles_estudiante_documento') {
      return res.status(409).json({ error: 'Ese documento ya está registrado en otra cuenta' });
    }
    throw err;
  }
  res.json({ mensaje: 'Perfil guardado' });
}

// Valida y limpia la lista de asignaturas del docente; devuelve las materias o el error.
function leerAsignaturas(asignaturas) {
  // RF041 pide mínimo una asignatura; el formulario lo exigía pero la API no.
  if (!Array.isArray(asignaturas) || !asignaturas.some(a => typeof a === 'string' && a.trim())) {
    return { error: 'Agrega al menos una asignatura que dictes' };
  }
  const nombres = [...new Set(asignaturas.filter(a => typeof a === 'string' && a.trim()).map(a => a.trim()))];
  if (nombres.length > MAX_ASIGNATURAS) return { error: `Puedes registrar hasta ${MAX_ASIGNATURAS} asignaturas` };
  const invalida = nombres.find(a => !nombreMateriaValido(a));
  if (invalida) return { error: `El nombre de materia «${invalida.slice(0, 40)}» no es válido` };
  return { nombres };
}

// Valida y limpia los programas del docente; devuelve la lista o el error.
function leerProgramas(programas) {
  if (programas === undefined || programas === null) return { programas: [] };
  if (!Array.isArray(programas)) return { error: 'Los programas deben ser una lista' };
  const limpios = [...new Set(programas.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim()))];
  if (limpios.length > MAX_PROGRAMAS) return { error: `Puedes registrar hasta ${MAX_PROGRAMAS} programas` };
  if (limpios.some(p => !textoSeguro(p, { min: 2, max: 120 }))) return { error: 'Alguno de los programas no es válido' };
  return { programas: limpios };
}

// Valida y limpia los horarios del docente; devuelve la lista o el error.
function leerHorarios(horarios) {
  if (horarios === undefined || horarios === null) return { horarios: [] };
  if (!Array.isArray(horarios)) return { error: 'Los horarios deben ser una lista' };
  if (horarios.length > MAX_HORARIOS) return { error: `Puedes registrar hasta ${MAX_HORARIOS} horarios` };

  const limpios = [];
  for (const h of horarios) {
    const dia = comoTexto(h?.dia);
    const inicio = comoTexto(h?.hora_inicio).slice(0, 5);
    const fin = comoTexto(h?.hora_fin).slice(0, 5);
    const lugar = comoTexto(h?.lugar) || 'Por definir';
    if (!textoSeguro(dia, { min: 3, max: 20 }) || !esHoraValida(inicio) || !esHoraValida(fin)) {
      return { error: 'Alguno de los horarios no tiene un día o una hora válidos' };
    }
    if (inicio >= fin) return { error: `El horario del ${dia} debe terminar después de la hora de inicio` };
    if (!textoSeguro(lugar, { min: 1, max: 80 })) return { error: 'El lugar de un horario no es válido' };
    limpios.push({ dia, inicio, fin, lugar });
  }
  return { horarios: limpios };
}

// Crea o actualiza el perfil del docente con asignaturas, programas y horarios, todo en una transacción.
async function guardarPerfilDocente(req, res) {
  const usuario_id = req.usuario.id;
  const cedula = String(req.body.cedula ?? '').trim();
  const facultad = comoTexto(req.body.facultad);
  const telefono = String(req.body.telefono ?? '').trim();

  if (!cedula || !facultad) {
    return res.status(400).json({ error: 'Faltan datos obligatorios: cédula y facultad' });
  }
  const errorDatos = errorCedulaTelefono(cedula, telefono);
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (!textoSeguro(facultad, { min: 2, max: 120 })) return res.status(400).json({ error: 'La facultad no es válida' });

  const materias = leerAsignaturas(req.body.asignaturas);
  if (materias.error) return res.status(400).json({ error: materias.error });
  const programas = leerProgramas(req.body.programas);
  if (programas.error) return res.status(400).json({ error: programas.error });
  const horarios = leerHorarios(req.body.horarios);
  if (horarios.error) return res.status(400).json({ error: horarios.error });

  const guardado = await db.transaccion(async (tx) => {
    if (await documentoEnOtraCuenta('perfiles_docente', 'cedula', cedula, usuario_id, tx)) {
      return { estado: 409, error: 'Esa cédula ya está registrada en otra cuenta' };
    }

    const perfil = await tx.prepare(`
      INSERT INTO perfiles_docente (usuario_id, cedula, codigo_docente, facultad, telefono)
      VALUES (?,?,?,?,?)
      ON CONFLICT(usuario_id) DO UPDATE SET
        cedula=excluded.cedula, codigo_docente=excluded.codigo_docente,
        facultad=excluded.facultad, telefono=excluded.telefono
      RETURNING id
    `).get(usuario_id, cedula, cedula, facultad, telefono);

    // Revincula las asignaturas, creándolas en el catálogo si faltan.
    await tx.prepare('DELETE FROM docente_asignaturas WHERE docente_id = ?').run(perfil.id);
    for (const nombre of materias.nombres) {
      const asignaturaId = await obtenerOCrearId(nombre, undefined, undefined, tx);
      await tx.prepare('INSERT INTO docente_asignaturas (docente_id, asignatura_id) VALUES (?,?) ON CONFLICT DO NOTHING').run(perfil.id, asignaturaId);
    }

    // Revincula los programas académicos y los horarios disponibles.
    await tx.prepare('DELETE FROM docente_programas WHERE docente_id = ?').run(perfil.id);
    for (const programa of programas.programas) {
      await tx.prepare('INSERT INTO docente_programas (docente_id, programa) VALUES (?,?)').run(perfil.id, programa);
    }

    await tx.prepare('DELETE FROM docente_horarios WHERE docente_id = ?').run(perfil.id);
    for (const h of horarios.horarios) {
      await tx.prepare('INSERT INTO docente_horarios (docente_id, dia, hora_inicio, hora_fin, lugar) VALUES (?,?,?,?,?)')
        .run(perfil.id, h.dia, h.inicio, h.fin, h.lugar);
    }
    return { ok: true };
  }).catch((err) => {
    if (err.constraint === 'uq_perfiles_docente_cedula') return { estado: 409, error: 'Esa cédula ya está registrada en otra cuenta' };
    throw err;
  });

  if (!guardado.ok) return res.status(guardado.estado).json({ error: guardado.error });
  res.json({ mensaje: 'Perfil guardado' });
}

// Crea o actualiza el perfil del administrador.
async function guardarPerfilAdmin(req, res) {
  const usuario_id = req.usuario.id;
  const cedula = String(req.body.cedula ?? '').trim();
  const cargo = comoTexto(req.body.cargo);
  const dependencia = comoTexto(req.body.dependencia);
  const telefono = String(req.body.telefono ?? '').trim();

  if (!cedula || !cargo) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }
  const errorDatos = errorCedulaTelefono(cedula, telefono);
  if (errorDatos) return res.status(400).json({ error: errorDatos });
  if (!textoSeguro(cargo, { min: 2, max: 120 }) || !textoSeguro(dependencia, { min: 0, max: 120 })) {
    return res.status(400).json({ error: 'El cargo y la dependencia admiten hasta 120 caracteres, sin < > " ` ni \\' });
  }

  await db.prepare(`
    INSERT INTO perfiles_admin (usuario_id, cedula, cargo, dependencia, telefono)
    VALUES (?,?,?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET
      cedula=excluded.cedula, cargo=excluded.cargo,
      dependencia=excluded.dependencia, telefono=excluded.telefono
  `).run(usuario_id, cedula, cargo, dependencia, telefono);

  res.json({ mensaje: 'Perfil guardado' });
}

// Devuelve el perfil completo del usuario según su rol.
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
      const [asignaturas, programas, horarios] = await Promise.all([
        db.prepare(`
          SELECT a.id, a.nombre
          FROM docente_asignaturas da
          JOIN asignaturas a ON a.id = da.asignatura_id
          WHERE da.docente_id = ?
          ORDER BY a.nombre
        `).all(perfil.id),
        db.prepare('SELECT programa FROM docente_programas WHERE docente_id = ? ORDER BY id').all(perfil.id),
        db.prepare('SELECT dia, hora_inicio, hora_fin, lugar FROM docente_horarios WHERE docente_id = ? ORDER BY id').all(perfil.id)
      ]);
      perfil.asignaturas = asignaturas.map(a => a.nombre);
      perfil.programas = programas.map(p => p.programa);
      perfil.horarios = horarios;
    }
    usuario.perfil = perfil || null;

  } else if (rol === 'admin') {
    usuario.perfil = await db.prepare('SELECT * FROM perfiles_admin WHERE usuario_id = ?').get(id) || null;
  }

  usuario.fotos = await db.prepare('SELECT foto_perfil, foto_portada FROM fotos_usuario WHERE usuario_id = ?').get(id) || {};

  res.json(usuario);
}

// Guarda la foto de perfil o de portada del usuario después de comprobar que realmente es una imagen.
async function subirFoto(req, res) {
  const { foto_base64, tipo } = req.body;
  const usuario_id = req.usuario.id;

  if (!foto_base64) return res.status(400).json({ error: 'No se recibió foto' });
  if (tipo !== undefined && tipo !== 'perfil' && tipo !== 'portada') {
    return res.status(400).json({ error: 'El tipo de foto debe ser perfil o portada' });
  }

  // Solo acepta imágenes en base64; cualquier otro texto terminaba en el atributo src de la página.
  const coincidencia = typeof foto_base64 === 'string' ? FORMATO_FOTO.exec(foto_base64) : null;
  if (!coincidencia) {
    return res.status(400).json({ error: 'El archivo debe ser una imagen JPG, PNG, WebP o GIF' });
  }

  // Rechaza imágenes de más de 2 MB para no llenar la base ni degradar el servicio.
  const [, formato, datos] = coincidencia;
  if (Math.floor(datos.length * 3 / 4) > MAX_BYTES_FOTO) {
    return res.status(400).json({ error: 'El tamaño máximo permitido es 2 MB' });
  }
  if (!FIRMAS_FOTO[formato](Buffer.from(datos.slice(0, 32), 'base64'))) {
    return res.status(400).json({ error: 'El contenido del archivo no corresponde a una imagen válida' });
  }

  const campo = tipo === 'portada' ? 'foto_portada' : 'foto_perfil';

  await db.prepare(`
    INSERT INTO fotos_usuario (usuario_id, ${campo}) VALUES (?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET ${campo}=excluded.${campo}
  `).run(usuario_id, foto_base64);

  res.json({ mensaje: 'Foto guardada' });
}

module.exports = { guardarPerfilEstudiante, guardarPerfilDocente, guardarPerfilAdmin, obtenerPerfil, subirFoto };
