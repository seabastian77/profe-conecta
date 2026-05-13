const { db } = require('../config/db');

async function buscar(req, res) {
  const { q } = req.query;
  let asignaturas;
  if (q && q.trim().length > 0) {
    const like = '%' + q.trim() + '%';
    asignaturas = await db.prepare(
      "SELECT id, nombre, area, programa FROM asignaturas WHERE nombre LIKE ? ORDER BY area, programa, nombre LIMIT 20"
    ).all(like);
  } else {
    asignaturas = await db.prepare(
      "SELECT id, nombre, area, programa FROM asignaturas ORDER BY area, programa, nombre LIMIT 60"
    ).all();
  }
  res.json(asignaturas);
}

async function listarTodas(req, res) {
  const asignaturas = await db.prepare(
    "SELECT id, nombre, area, programa FROM asignaturas ORDER BY area, programa, nombre"
  ).all();
  res.json(asignaturas);
}

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

async function crearOBuscar(req, res) {
  const { nombre, area, programa } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre de la materia es requerido' });
  }
  const nombreLimpio = nombre.trim();
  const areaLimpia = (area || 'General').trim();
  const programaLimpio = (programa || 'General').trim();
  const existente = await db.prepare(
    "SELECT id, nombre, area, programa FROM asignaturas WHERE nombre = ? COLLATE NOCASE"
  ).get(nombreLimpio);
  if (existente) {
    return res.json({ id: existente.id, nombre: existente.nombre, area: existente.area, programa: existente.programa, nueva: false });
  }
  const result = await db.prepare(
    "INSERT INTO asignaturas (nombre, area, programa) VALUES (?,?,?)"
  ).run(nombreLimpio, areaLimpia, programaLimpio);
  res.status(201).json({ id: result.lastInsertRowid, nombre: nombreLimpio, area: areaLimpia, programa: programaLimpio, nueva: true });
}

function obtenerOCrearId(nombre, area, programa) {
  const nombreLimpio = nombre.trim();
  const existente = await db.prepare("SELECT id FROM asignaturas WHERE nombre = ? COLLATE NOCASE").get(nombreLimpio);
  if (existente) return existente.id;
  const result = await db.prepare("INSERT INTO asignaturas (nombre, area, programa) VALUES (?,?,?)").run(nombreLimpio, area || 'General', programa || 'General');
  return result.lastInsertRowid;
}

module.exports = { buscar, listarTodas, listarPorAreas, crearOBuscar, obtenerOCrearId };
