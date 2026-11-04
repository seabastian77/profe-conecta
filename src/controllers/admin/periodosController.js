const { db } = require('../../config/db');
const { CLAVES, bloquear } = require('../../config/bloqueos');
const { auditar } = require('../../config/auditoria');
const { esFechaValida } = require('../../config/fechas');
const { textoSeguro } = require('../../config/validaciones');

const MAX_NOMBRE_PERIODO = 40;

// Lista los periodos académicos: primero el activo, luego los próximos y al final los cerrados.
async function listarPeriodos(req, res) {
  res.json(await db.prepare(`
    SELECT * FROM periodos
    ORDER BY CASE estado WHEN 'activo' THEN 0 WHEN 'proximo' THEN 1 ELSE 2 END, inicio DESC NULLS LAST, id DESC
  `).all());
}

// Crea un periodo próximo validando nombre, fechas y cruces con los periodos abiertos.
async function crearPeriodo(req, res) {
  const nombre = typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
  const { inicio, fin } = req.body;
  if (!nombre || !inicio || !fin) return res.status(400).json({ error: 'Faltan el nombre o las fechas del período' });
  if (!textoSeguro(nombre, { min: 1, max: MAX_NOMBRE_PERIODO })) {
    return res.status(400).json({ error: `El nombre admite hasta ${MAX_NOMBRE_PERIODO} caracteres, sin símbolos especiales` });
  }
  if (!esFechaValida(inicio) || !esFechaValida(fin)) return res.status(400).json({ error: 'Las fechas no son válidas (AAAA-MM-DD)' });
  if (inicio >= fin) return res.status(400).json({ error: 'La fecha de cierre debe ser posterior a la de inicio' });

  const resultado = await db.transaccion(async (tx) => {
    await bloquear(tx, CLAVES.PERIODOS);
    const repetido = await tx.prepare('SELECT id FROM periodos WHERE lower(nombre)=lower(?)').get(nombre);
    if (repetido) return { estado: 409, error: `Ya existe el período ${nombre}` };

    const cruce = await tx.prepare("SELECT nombre FROM periodos WHERE estado <> 'cerrado' AND inicio <= ? AND fin >= ? LIMIT 1").get(fin, inicio);
    if (cruce) return { estado: 409, error: `Las fechas se cruzan con el período ${cruce.nombre}` };

    const creado = await tx.prepare("INSERT INTO periodos (nombre, inicio, fin, estado) VALUES (?,?,?,'proximo') RETURNING id").get(nombre, inicio, fin);
    return { id: creado.id };
  });

  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  await auditar(req, 'PERIODO_CREADO', `${nombre} (${inicio} a ${fin})`);
  res.status(201).json({ mensaje: 'Período creado', id: resultado.id });
}

// Cierra un periodo abierto.
async function cerrarPeriodo(req, res) {
  const id = Number(req.params.id);
  const resultado = await db.transaccion(async (tx) => {
    await bloquear(tx, CLAVES.PERIODOS);
    const periodo = await tx.prepare('SELECT id, nombre, estado FROM periodos WHERE id=? FOR UPDATE').get(id);
    if (!periodo) return { estado: 404, error: 'Período no encontrado' };
    if (periodo.estado === 'cerrado') return { estado: 400, error: `El período ${periodo.nombre} ya está cerrado` };

    await tx.prepare("UPDATE periodos SET estado='cerrado' WHERE id=?").run(id);
    return { nombre: periodo.nombre };
  });

  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  await auditar(req, 'PERIODO_CERRADO', resultado.nombre);
  res.json({ mensaje: `Período ${resultado.nombre} cerrado` });
}

// Activa un periodo próximo cuando no hay otro activo.
async function activarPeriodo(req, res) {
  const id = Number(req.params.id);
  const resultado = await db.transaccion(async (tx) => {
    await bloquear(tx, CLAVES.PERIODOS);
    const periodo = await tx.prepare('SELECT id, nombre, estado FROM periodos WHERE id=? FOR UPDATE').get(id);
    if (!periodo) return { estado: 404, error: 'Período no encontrado' };
    if (periodo.estado === 'activo') return { estado: 400, error: `El período ${periodo.nombre} ya está activo` };
    if (periodo.estado === 'cerrado') return { estado: 400, error: 'Un período cerrado no se vuelve a abrir' };

    const activo = await tx.prepare("SELECT nombre FROM periodos WHERE estado='activo' LIMIT 1").get();
    if (activo) return { estado: 409, error: `Primero cierra el período activo (${activo.nombre})` };

    await tx.prepare("UPDATE periodos SET estado='activo' WHERE id=?").run(id);
    return { nombre: periodo.nombre };
  });

  if (resultado.error) return res.status(resultado.estado).json({ error: resultado.error });
  await auditar(req, 'PERIODO_ACTIVADO', resultado.nombre);
  res.json({ mensaje: `Período ${resultado.nombre} activado` });
}

module.exports = { listarPeriodos, crearPeriodo, cerrarPeriodo, activarPeriodo };
