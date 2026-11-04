const { db } = require('./db');
const { CLAVES } = require('./bloqueos');
const {
  crearTablas, crearIndices, ajustarColumnas, corregirClavesForaneas, endurecerEsquema
} = require('./esquema');
const { sembrarAdminInicial, sembrarAsignaturas, sembrarUsuarios } = require('./semillas');

// Corre un paso opcional: si falla avisa y sigue, porque no debe impedir que la aplicación arranque.
async function pasoOpcional(nombre, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`⚠️  Paso opcional «${nombre}» falló: ${err.message}`);
  }
}

// Aplica todos los pasos de la migración sobre una conexión; cada paso es idempotente.
async function ejecutarMigracion(c) {
  await crearTablas(c);
  await crearIndices(c);
  await ajustarColumnas(c);

  // Purga de intentos viejos para que la tabla no crezca sin control.
  await c.query(`DELETE FROM intentos_login WHERE creado_en < NOW() - INTERVAL '1 day'`);

  await corregirClavesForaneas(c);
  await sembrarAdminInicial(c);

  // Inserta el periodo activo y la configuración de reglas de negocio.
  await c.query(`
    INSERT INTO periodos (id, nombre, inicio, fin, estado)
    VALUES (1, '2026-1', '2026-02-03', '2026-06-15', 'activo')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO configuracion (clave, valor) VALUES
      ('RN_PROMEDIO_MINIMO','3.0'),('RN_HORAS_CANCELACION','24'),('RN_MAX_ESTUDIANTES','15'),
      ('RN_MINUTOS_SESION','15')
    ON CONFLICT (clave) DO NOTHING;
  `);

  // El período 1 se inserta con id fijo y la secuencia no avanza: el siguiente período chocaba con él y daba error 500.
  await c.query(`
    SELECT setval(pg_get_serial_sequence('periodos', 'id'),
                  GREATEST((SELECT COALESCE(MAX(id), 0) FROM periodos), 1))
  `);

  await pasoOpcional('restricciones de integridad', () => endurecerEsquema(c));
  await pasoOpcional('catálogo de asignaturas', () => sembrarAsignaturas(c));
  await pasoOpcional('cuentas de ejemplo', () => sembrarUsuarios(c));

  console.log('✅ Tablas PostgreSQL creadas/verificadas');
}

// Migra bajo un bloqueo de aviso: dos instancias que arrancan a la vez (despliegue con solapamiento) esperan su turno.
async function migrar(pool = db.pool) {
  const c = await pool.connect();
  let fallo;
  try {
    await c.query('SELECT pg_advisory_lock($1, 0)', [CLAVES.MIGRACION]);
    await ejecutarMigracion(c);
  } catch (err) {
    fallo = err;
    throw err;
  } finally {
    if (!fallo) await c.query('SELECT pg_advisory_unlock($1, 0)', [CLAVES.MIGRACION]).catch(() => { /* la sesión ya terminó */ });
    c.release(fallo);
  }
}

module.exports = { migrar, ejecutarMigracion };

// Permite correr la migración directamente con node src/config/migrate.js.
if (require.main === module) {
  migrar()
    .then(async () => {
      console.log('✅ Migración completada');
      await db.cerrar();
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ La migración falló:', err.message);
      process.exit(1);
    });
}
