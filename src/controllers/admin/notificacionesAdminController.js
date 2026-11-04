const { db } = require('../../config/db');
const { auditar } = require('../../config/auditoria');
const { umbralAlerta, condicionAlerta } = require('../../config/reglasTutoria');
const { enteroPositivo } = require('../../config/validaciones');

const MAX_ASUNTO = 150;
const MAX_MENSAJE = 2000;
const MAX_TIPO = 40;
const MAX_PROGRAMA = 120;

// Devuelve el texto recortado o null si el valor no es un texto.
const comoTexto = (valor) => (typeof valor === 'string' ? valor.trim() : null);

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

// Busca los usuarios activos del grupo elegido; devuelve sus ids y la etiqueta para el historial, o un error.
async function destinatariosDelGrupo(grupo, { programa, usuarioId }) {
  if (grupo === 'alerta') {
    const filas = await db.prepare(`SELECT u.id FROM usuarios u JOIN perfiles_estudiante pe ON pe.usuario_id=u.id WHERE u.activo=1 AND u.rol='estudiante' AND ${condicionAlerta('pe.promedio')}`).all(await umbralAlerta());
    return { filas, etiqueta: 'Estudiantes en alerta' };
  }
  if (grupo === 'docentes') {
    return { filas: await db.prepare("SELECT id FROM usuarios WHERE rol='docente' AND activo=1").all(), etiqueta: 'Docentes tutores' };
  }
  if (grupo === 'estudiantes') {
    return { filas: await db.prepare("SELECT id FROM usuarios WHERE rol='estudiante' AND activo=1").all(), etiqueta: 'Todos los estudiantes' };
  }
  if (grupo === 'todos') {
    return { filas: await db.prepare('SELECT id FROM usuarios WHERE activo=1').all(), etiqueta: 'Todos los usuarios' };
  }
  if (grupo === 'programa') {
    if (!programa) return { estado: 400, error: 'Elige el programa que recibe la notificación' };
    const filas = await db.prepare("SELECT u.id FROM usuarios u JOIN perfiles_estudiante pe ON pe.usuario_id=u.id WHERE u.activo=1 AND u.rol='estudiante' AND lower(TRIM(pe.programa))=lower(?)").all(programa);
    return { filas, etiqueta: 'Programa: ' + programa };
  }
  if (grupo === 'usuario') {
    if (!usuarioId) return { estado: 400, error: 'Busca y elige el usuario que recibe la notificación' };
    const usuario = await db.prepare('SELECT id, nombres, apellidos FROM usuarios WHERE id=? AND activo=1').get(usuarioId);
    if (!usuario) return { estado: 404, error: 'Ese usuario no existe o está inactivo' };
    return { filas: [usuario], etiqueta: 'Usuario: ' + usuario.nombres + ' ' + usuario.apellidos };
  }
  return { estado: 400, error: 'Destinatario no válido' };
}

// Envía una notificación solo al grupo, programa o usuario elegido y deja constancia en el historial.
async function enviarNotificacion(req, res) {
  const asunto = comoTexto(req.body.asunto);
  const mensaje = comoTexto(req.body.mensaje);
  const tipo = comoTexto(req.body.tipo) || 'General';
  if (!asunto || !mensaje) return res.status(400).json({ error: 'Faltan asunto o mensaje' });
  if (asunto.length > MAX_ASUNTO || mensaje.length > MAX_MENSAJE) {
    return res.status(400).json({ error: `El asunto admite ${MAX_ASUNTO} caracteres y el mensaje ${MAX_MENSAJE}` });
  }
  if (tipo.length > MAX_TIPO) return res.status(400).json({ error: `El tipo admite ${MAX_TIPO} caracteres` });

  const { grupo, programa: programaTexto } = grupoDestinatario(req.body.destinatario);
  const programa = (comoTexto(req.body.programa) || programaTexto || '').slice(0, MAX_PROGRAMA);
  const destino = await destinatariosDelGrupo(grupo, { programa, usuarioId: enteroPositivo(req.body.usuario_id) });
  if (destino.error) return res.status(destino.estado).json({ error: destino.error });

  const ids = destino.filas.map(u => u.id).filter(Boolean);
  if (ids.length === 0) return res.status(400).json({ error: `No hay usuarios activos en «${destino.etiqueta}»` });

  const icono = tipo.includes('Alerta') ? '⚠️' : tipo.includes('Recordatorio') ? '📅' : '📢';

  // Las notificaciones y el historial se guardan juntos: o quedan las dos cosas o ninguna.
  await db.transaccion(async (tx) => {
    await tx.query(
      `INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion)
       SELECT id, $2, $3, $4 FROM UNNEST($1::int[]) AS t(id)`,
      [ids, icono, asunto, mensaje]
    );
    await tx.prepare('INSERT INTO historial_notificaciones (destinatario, tipo, asunto, mensaje, cantidad, enviado_por) VALUES (?,?,?,?,?,?)')
      .run(destino.etiqueta, tipo, asunto, mensaje, ids.length, req.usuario.id);
  });

  await auditar(req, 'NOTIFICACION', `A ${ids.length} usuario(s) — ${destino.etiqueta}: ${asunto}`);
  res.json({ mensaje: `Enviado a ${ids.length} usuario(s) — ${destino.etiqueta}`, cantidad: ids.length });
}

// Devuelve el historial de las últimas 100 notificaciones enviadas.
async function historialNotificaciones(req, res) {
  res.json(await db.prepare('SELECT * FROM historial_notificaciones ORDER BY creada_en DESC, id DESC LIMIT 100').all());
}

module.exports = { enviarNotificacion, historialNotificaciones };
