const { db } = require('./db');

// Lee un valor de la tabla de configuración o devuelve el valor por defecto.
async function getConfig(clave, defecto) {
  try {
    const row = await db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
    return row?.valor || defecto;
  } catch {
    return defecto;
  }
}

// Igual que getConfig pero devuelve el valor como número.
async function getConfigNum(clave, defecto) {
  return parseFloat(await getConfig(clave, defecto));
}

module.exports = { getConfig, getConfigNum };
