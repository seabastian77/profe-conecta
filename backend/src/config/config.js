// config.js — Lee la configuración desde la BD en tiempo real
const { db } = require('./db');

async function getConfig(clave, defecto) {
  try {
    const row = await db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
    return row?.valor || defecto;
  } catch(e) {
    return defecto;
  }
}

async function getConfigNum(clave, defecto) {
  return parseFloat(await getConfig(clave, defecto));
}

module.exports = { getConfig, getConfigNum };
