require("dotenv").config();
const app = require("./app");
const { migrar } = require("./config/migrate");
const { db } = require("./config/db");

const PORT = process.env.PORT || 3000;
const INTENTOS_MAX = 10;
const ESPERA_CIERRE_MS = 10000;
const HORA_MS = 60 * 60 * 1000;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Reintenta la conexión a la base con espera creciente hasta que responda.
async function esperarBase() {
  for (let intento = 1; intento <= INTENTOS_MAX; intento++) {
    try {
      await db.pool.query('SELECT 1');
      console.log(`✅ PostgreSQL respondió (intento ${intento})`);
      return;
    } catch (err) {
      if (intento === INTENTOS_MAX) throw err;
      const espera = Math.min(1000 * intento, 5000);
      console.log(`⏳ La base no responde (intento ${intento}/${INTENTOS_MAX}): ${err.code || err.message}. Reintento en ${espera / 1000}s…`);
      await esperar(espera);
    }
  }
}

// Traduce el fallo de conexión a un mensaje accionable en el log.
function explicarFallo(err) {
  const codigo = err?.code || err?.errors?.[0]?.code;

  console.error('\n❌ No se pudo conectar a PostgreSQL.\n');

  if (!process.env.DATABASE_URL) {
    console.error('   DATABASE_URL no está definida.');
    console.error('   En Railway: pestaña Variables del servicio → agrega');
    console.error('   DATABASE_URL con el valor de referencia ${{Postgres.DATABASE_URL}}\n');
  } else if (codigo === 'ECONNREFUSED' || codigo === 'ETIMEDOUT') {
    console.error(`   La dirección responde pero rechaza la conexión (${codigo}).`);
    console.error('   Revisa que:');
    console.error('   1. El servicio de PostgreSQL exista y esté encendido en el proyecto.');
    console.error('   2. DATABASE_URL sea una REFERENCIA (${{Postgres.DATABASE_URL}}),');
    console.error('      no una URL copiada y pegada a mano: cuando Railway recrea la');
    console.error('      base, el host cambia y la copia pegada queda apuntando al vacío.');
    console.error('   3. Ambos servicios estén en el mismo proyecto y entorno.\n');
  } else if (codigo === 'ENOTFOUND') {
    console.error('   No se resolvió el nombre del host de la base de datos.');
    console.error('   Suele ser un DATABASE_URL con el host mal escrito.\n');
  } else if (codigo === '28P01') {
    console.error('   Usuario o contraseña incorrectos en DATABASE_URL.\n');
  }

  console.error('   Detalle técnico:', err?.message || err);
}

// Cierra el servidor y el pool de conexiones de forma ordenada al recibir una señal de apagado.
function apagar(servidor, senal) {
  console.log(`\n${senal} recibida: cerrando el servidor…`);
  const forzado = setTimeout(() => {
    console.error('Cierre forzado: las conexiones no terminaron a tiempo');
    process.exit(1);
  }, ESPERA_CIERRE_MS);
  forzado.unref();

  servidor.close(async () => {
    try { await db.cerrar(); } catch { /* el pool ya estaba cerrado */ }
    process.exit(0);
  });
  servidor.closeIdleConnections?.();
}

// Borra cada hora los intentos de login de más de un día para que la tabla no crezca sin control.
function programarLimpiezaDeIntentos() {
  const limpiar = () => db.pool
    .query("DELETE FROM intentos_login WHERE creado_en < NOW() - INTERVAL '1 day'")
    .catch((err) => console.warn('No se pudo limpiar intentos_login:', err.message));
  setInterval(limpiar, HORA_MS).unref();
}

process.on('unhandledRejection', (motivo) => {
  console.error('Promesa rechazada sin manejar:', motivo instanceof Error ? motivo.message : motivo);
});

process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada, el proceso se reinicia:', err);
  process.exit(1);
});

// Espera la base, corre la migración y levanta el servidor.
(async () => {
  try {
    await esperarBase();
    await migrar();

    const servidor = app.listen(PORT, () => {
      console.log(`\n🚀 ConectaProfe corriendo en puerto ${PORT}`);
    });

    // El proxy de Railway reutiliza conexiones: el servidor debe esperar más que él para no cortarlas.
    servidor.keepAliveTimeout = 65000;
    servidor.headersTimeout = 66000;

    programarLimpiezaDeIntentos();
    process.on('SIGTERM', () => apagar(servidor, 'SIGTERM'));
    process.on('SIGINT', () => apagar(servidor, 'SIGINT'));
  } catch (err) {
    explicarFallo(err);
    process.exit(1);
  }
})();
