const { db } = require('../../config/db');
const { auditar } = require('../../config/auditoria');
const { REGLAS, claveRegla, validarRegla, obtenerReglas } = require('../../config/config');

const GUARDAR_REGLA = 'INSERT INTO configuracion (clave, valor) VALUES (?,?) ON CONFLICT (clave) DO UPDATE SET valor=excluded.valor';

// Devuelve las reglas vigentes con sus claves RN_*, que son las que leen el servidor y la pantalla.
async function obtenerConfiguracion(req, res) {
  res.json(await obtenerReglas());
}

// Guarda una regla validada; las claves que ninguna regla lee se rechazan.
async function guardarConfiguracion(req, res) {
  const { clave, valor } = req.body;
  const oficial = claveRegla(clave);
  if (!oficial) return res.status(400).json({ error: 'Ese parámetro no existe' });

  const validado = validarRegla(oficial, valor);
  if (validado.error) return res.status(400).json({ error: validado.error });

  await db.prepare(GUARDAR_REGLA).run(oficial, validado.valor);
  await auditar(req, 'CONFIG', oficial + ' = ' + validado.valor);
  res.json({ mensaje: 'Guardado', clave: oficial, valor: Number(validado.valor) });
}

// Restaura cada regla a su valor por defecto en una sola transacción.
async function resetearConfiguracion(req, res) {
  await db.transaccion(async (tx) => {
    for (const [clave, regla] of Object.entries(REGLAS)) {
      const valor = regla.entero ? String(regla.defecto) : regla.defecto.toFixed(1);
      await tx.prepare(GUARDAR_REGLA).run(clave, valor);
    }
  });
  await auditar(req, 'CONFIG_RESET', 'Valores por defecto restaurados');
  res.json({ mensaje: 'Configuración reseteada', valores: await obtenerReglas() });
}

module.exports = { obtenerConfiguracion, guardarConfiguracion, resetearConfiguracion };
