const { Pool } = require('pg');
const { esErrorDeConexion } = require('./errores');

// Cada conexión arranca en la hora de Colombia: con UTC, auditoría y notificaciones quedaban 5 horas adelante (DEF-12).
const ZONA_HORARIA = (process.env.ZONA_HORARIA || 'America/Bogota').replace(/[^A-Za-z_/+-]/g, '');

// Lee un entero positivo de una variable de entorno o usa el valor por defecto.
function entero(valor, defecto) {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : defecto;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  options: `-c TimeZone=${ZONA_HORARIA}`,
  max: entero(process.env.DB_POOL_MAX, 10),
  connectionTimeoutMillis: entero(process.env.DB_CONEXION_MS, 15000),
  statement_timeout: entero(process.env.DB_CONSULTA_MS, 30000),
  keepAlive: true
});

// Evita que un error en una conexión inactiva (por ejemplo, la base se reinicia) tumbe el proceso.
pool.on('error', (err) => {
  console.error('Conexión inactiva de PostgreSQL con error:', err.message);
});

// Convierte los ? del SQL en los marcadores $1, $2, $3 de PostgreSQL.
function convertir(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Arma la API estilo better-sqlite3 sobre cualquier ejecutor con query() (el pool o una transacción).
function crearApi(ejecutor) {
  return {
    prepare: (sql) => {
      const texto = convertir(sql);
      return {
        run: (...p) => ejecutor.query(texto, p.flat()),
        get: (...p) => ejecutor.query(texto, p.flat()).then(r => r.rows[0] || null),
        all: (...p) => ejecutor.query(texto, p.flat()).then(r => r.rows)
      };
    },
    query: (sql, params) => ejecutor.query(sql, params)
  };
}

// Ejecuta varias consultas como una sola unidad: si algo falla, no se guarda nada.
async function transaccion(fn) {
  const cliente = await pool.connect();
  let fallo;
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(crearApi(cliente));
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    fallo = err;
    try { await cliente.query('ROLLBACK'); } catch { /* la conexión ya se perdió */ }
    throw err;
  } finally {
    cliente.release(esErrorDeConexion(fallo) ? fallo : undefined);
  }
}

// Comprueba que la base responda en pocos segundos.
async function verificar(limiteMs = 3000) {
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => rechazar(new Error('La base no respondió a tiempo')), limiteMs);
  });
  try {
    await Promise.race([pool.query('SELECT 1'), limite]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

// Expone la API de consultas, las transacciones y el pool para los scripts de mantenimiento.
const db = {
  ...crearApi(pool),
  exec: (sql) => pool.query(sql),
  transaccion,
  verificar,
  cerrar: () => pool.end(),
  pool
};

module.exports = { db };
