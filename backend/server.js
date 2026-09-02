require("dotenv").config();
const app = require("./src/app");
const { migrar } = require("./src/config/migrate");
const { db } = require("./src/config/db");

const PORT = process.env.PORT || 3000;

// ── Espera a que la base de datos responda ──────────────
//
// Por qué existe esto: la red privada de Railway tarda un momento en quedar
// lista cuando arranca el contenedor. La versión anterior intentaba migrar de
// inmediato y, si la base todavía no respondía, hacía process.exit(1). El
// contenedor moría, Railway lo reintentaba, y otra vez lo mismo — un retraso
// de dos segundos se convertía en un despliegue fallido.
//
// Ahora se reintenta con espera creciente antes de rendirse.

const INTENTOS_MAX = 10;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function esperarBase() {
  for (let intento = 1; intento <= INTENTOS_MAX; intento++) {
    try {
      await db.pool.query('SELECT 1');
      console.log(`✅ PostgreSQL respondió (intento ${intento})`);
      return;
    } catch (err) {
      if (intento === INTENTOS_MAX) throw err;
      const espera = Math.min(1000 * intento, 5000); // 1s, 2s, 3s… tope 5s
      console.log(`⏳ La base no responde (intento ${intento}/${INTENTOS_MAX}): ${err.code || err.message}. Reintento en ${espera / 1000}s…`);
      await esperar(espera);
    }
  }
}

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

(async () => {
  try {
    await esperarBase();
    await migrar();

    app.listen(PORT, () => {
      console.log(`\n🚀 ConectaProfe corriendo en puerto ${PORT}`);
    });
  } catch (err) {
    explicarFallo(err);
    process.exit(1);
  }
})();
