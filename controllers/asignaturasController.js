const { db } = require('../config/db');
const { escaparLike, textoSeguro } = require('../config/validaciones');

// Nombre de materia de 2 a 80 caracteres sin < > " ` ni barra invertida, que terminaban como HTML en las páginas.
const NOMBRE_MATERIA_VALIDO = /^[^<>"`\\\u0000-\u001f]{2,80}$/;
const MAX_AREA_PROGRAMA = 80;

// Indica si el nombre de la materia se puede guardar.
function nombreMateriaValido(nombre) {
  return typeof nombre === 'string' && NOMBRE_MATERIA_VALIDO.test(nombre.trim());
}

// Lee un texto opcional: devuelve el texto recortado, el valor por defecto si falta, o null si no es un texto válido.
function leerEtiqueta(valor, defecto) {
  if (valor === undefined || valor === null || valor === '') return defecto;
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim() || defecto;
  return textoSeguro(limpio, { min: 1, max: MAX_AREA_PROGRAMA }) ? limpio : null;
}

// Busca asignaturas por nombre o devuelve las primeras si no hay término.
async function buscar(req, res) {
  const termino = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  let asignaturas;
  if (termino.length > 0) {
    asignaturas = await db.prepare(
      "SELECT id, nombre, area, programa FROM asignaturas WHERE nombre ILIKE ? ORDER BY area, programa, nombre LIMIT 20"
    ).all('%' + escaparLike(termino.slice(0, 80)) + '%');
  } else {
    asignaturas = await db.prepare(
      "SELECT id, nombre, area, programa FROM asignaturas ORDER BY area, programa, nombre LIMIT 60"
    ).all();
  }
  res.json(asignaturas);
}

// Devuelve todas las asignaturas ordenadas.
async function listarTodas(req, res) {
  const asignaturas = await db.prepare(
    "SELECT id, nombre, area, programa FROM asignaturas ORDER BY area, programa, nombre"
  ).all();
  res.json(asignaturas);
}

// Agrupa las asignaturas por área y programa.
async function listarPorAreas(req, res) {
  const todas = await db.prepare(
    "SELECT id, nombre, area, programa FROM asignaturas ORDER BY area, programa, nombre"
  ).all();
  const areasMap = {};
  for (const a of todas) {
    const area = a.area || 'General';
    const prog = a.programa || 'General';
    if (!areasMap[area]) areasMap[area] = {};
    if (!areasMap[area][prog]) areasMap[area][prog] = [];
    areasMap[area][prog].push({ id: a.id, nombre: a.nombre });
  }
  const resultado = Object.keys(areasMap).sort().map(area => ({
    area,
    programas: Object.keys(areasMap[area]).sort().map(prog => ({
      programa: prog,
      materias: areasMap[area][prog]
    }))
  }));
  res.json(resultado);
}

// Devuelve la asignatura existente o la crea si no está.
async function crearOBuscar(req, res) {
  const { nombre, area, programa } = req.body;
  if (typeof nombre !== 'string' || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la materia es requerido' });
  }
  const nombreLimpio = nombre.trim();
  if (!nombreMateriaValido(nombreLimpio)) {
    return res.status(400).json({ error: 'El nombre de la materia debe tener entre 2 y 80 caracteres y no puede llevar < > " ` ni \\' });
  }
  const areaLimpia = leerEtiqueta(area, 'General');
  const programaLimpio = leerEtiqueta(programa, 'General');
  if (!areaLimpia || !programaLimpio) {
    return res.status(400).json({ error: 'El área y el programa admiten hasta 80 caracteres, sin < > " ` ni \\' });
  }

  const buscarExistente = () => db.prepare(
    "SELECT id, nombre, area, programa FROM asignaturas WHERE lower(nombre) = lower(?)"
  ).get(nombreLimpio);

  const existente = await buscarExistente();
  if (existente) {
    return res.json({ id: existente.id, nombre: existente.nombre, area: existente.area, programa: existente.programa, nueva: false });
  }

  let result;
  try {
    result = await db.prepare(
      "INSERT INTO asignaturas (nombre, area, programa) VALUES (?,?,?) RETURNING id"
    ).get(nombreLimpio, areaLimpia, programaLimpio);
  } catch (err) {
    // Otra petición creó la misma materia en ese instante: se devuelve esa.
    const creada = err.code === '23505' ? await buscarExistente() : null;
    if (!creada) throw err;
    return res.json({ id: creada.id, nombre: creada.nombre, area: creada.area, programa: creada.programa, nueva: false });
  }

  res.status(201).json({ id: result.id, nombre: nombreLimpio, area: areaLimpia, programa: programaLimpio, nueva: true });
}

// Devuelve el id de la asignatura, creándola si no existe; acepta una transacción para guardar todo junto.
async function obtenerOCrearId(nombre, area, programa, ejecutor = db) {
  const nombreLimpio = nombre.trim();
  const buscarId = () => ejecutor.prepare("SELECT id FROM asignaturas WHERE lower(nombre) = lower(?)").get(nombreLimpio);

  const existente = await buscarId();
  if (existente) return existente.id;

  const creada = await ejecutor.prepare(
    "INSERT INTO asignaturas (nombre, area, programa) VALUES (?,?,?) ON CONFLICT DO NOTHING RETURNING id"
  ).get(nombreLimpio, area || 'General', programa || 'General');
  return creada ? creada.id : (await buscarId()).id;
}

module.exports = { buscar, listarTodas, listarPorAreas, crearOBuscar, obtenerOCrearId, nombreMateriaValido };
