const { Client } = require('pg');

// Estas pruebas crean y borran bases completas: nunca deben correr contra la base de Railway.
if (/rlwy\.net|railway\.(app|internal)/i.test(process.env.DATABASE_URL || '')) {
  throw new Error('Las pruebas de bases temporales no se ejecutan contra la base de Railway. Usa una base local.');
}

let contador = 0;

// Cambia el nombre de la base en una URL de conexión.
function urlDeBase(nombre, base = process.env.DATABASE_URL) {
  const url = new URL(base);
  url.pathname = `/${nombre}`;
  return url.toString();
}

// Crea una base vacía en el mismo servidor y devuelve su conexión; cerrar() la elimina.
async function crearBaseTemporal(prefijo = 'cp_tmp') {
  contador += 1;
  const nombre = `${prefijo}_${process.pid}_${Date.now()}_${contador}`;
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${nombre}`);

  const url = urlDeBase(nombre);
  const cliente = new Client({ connectionString: url });
  cliente.on('error', () => {});
  await cliente.connect();

  return {
    nombre, url, cliente,
    async cerrar() {
      await cliente.end().catch(() => {});
      await admin.query(`DROP DATABASE IF EXISTS ${nombre} WITH (FORCE)`);
      await admin.end();
    }
  };
}

// Resume cada tabla como «filas:huella» para comparar dos bases sin mirar fila por fila.
async function huellas(c) {
  const { rows } = await c.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'intentos_login' ORDER BY 1");
  const resumen = {};
  for (const { tablename } of rows) {
    const r = await c.query(`SELECT count(*)::int AS n, COALESCE(md5(string_agg(x::text, '|' ORDER BY x::text)), '') AS h FROM "${tablename}" x`);
    resumen[tablename] = `${r.rows[0].n}:${r.rows[0].h}`;
  }
  return resumen;
}

module.exports = { urlDeBase, crearBaseTemporal, huellas };
