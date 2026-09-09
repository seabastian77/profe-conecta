const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Convierte los ? del SQL en los marcadores $1, $2, $3 de PostgreSQL.
function convertir(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Expone una API estilo better-sqlite3 sobre el pool async de PostgreSQL.
const db = {
  prepare: (sql) => ({
    run:  (...p) => pool.query(convertir(sql), p.flat()),
    get:  (...p) => pool.query(convertir(sql), p.flat()).then(r => r.rows[0] || null),
    all:  (...p) => pool.query(convertir(sql), p.flat()).then(r => r.rows),
  }),
  exec:  (sql)  => pool.query(sql),
  pool
};

pool.query('SELECT 1').then(() => console.log('✅ PostgreSQL conectado')).catch(e => console.error('❌ PostgreSQL error:', e.message));

module.exports = { db };
