// Crea una copia de seguridad de toda la base en un archivo comprimido y comprueba que se pueda leer completa.
require('dotenv').config();
const path = require('path');
const {
  CARPETA_RESPALDOS, leerArgumentos, resolverUrl, describirDestino, conectar, formatearBytes, correrScript
} = require('./lib/comun');
const { crearRespaldo, verificarRespaldo, rotarRespaldos } = require('./lib/respaldo');

const AYUDA = `
Uso: npm run db:respaldo [-- opciones]

  --url=postgresql://…   Base a copiar (por defecto DATABASE_URL; en Railway usa la URL pública)
  --carpeta=ruta         Dónde guardar el archivo (por defecto la carpeta «respaldos»)
  --etiqueta=nombre      Prefijo del archivo (por defecto «respaldo»)
  --conservar=N          Después de copiar, borra los respaldos más viejos con esa etiqueta y deja los N más recientes
`;

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda || opciones.help) { console.log(AYUDA); return 0; }

  const url = resolverUrl(opciones);
  const carpeta = typeof opciones.carpeta === 'string' ? path.resolve(opciones.carpeta) : CARPETA_RESPALDOS;
  const etiqueta = typeof opciones.etiqueta === 'string' ? opciones.etiqueta.replace(/[^a-z0-9_-]/gi, '') || 'respaldo' : 'respaldo';

  console.log(`💾 Respaldo de ${describirDestino(url)}`);
  const cliente = await conectar(url);
  try {
    const respaldo = await crearRespaldo(cliente, { carpeta, etiqueta });
    const verificado = await verificarRespaldo(respaldo.archivo);

    console.log(`✅ Copia verificada: ${path.relative(process.cwd(), respaldo.archivo) || respaldo.archivo} (${formatearBytes(verificado.bytes)})`);
    for (const t of respaldo.tablas) console.log(`   ${t.nombre.padEnd(26)} ${String(t.filas).padStart(7)} filas`);
    console.log(`   Total: ${respaldo.totalFilas} filas · huella ${respaldo.sha256.slice(0, 16)}…`);

    const conservar = parseInt(opciones.conservar, 10);
    if (Number.isFinite(conservar) && conservar > 0) {
      const borrados = rotarRespaldos(carpeta, etiqueta, conservar);
      if (borrados.length) console.log(`🧹 Se borraron ${borrados.length} respaldo(s) antiguos; quedan los ${conservar} más recientes.`);
    }
    console.log('\n🔒 El archivo contiene datos personales y hashes de contraseñas: guárdalo en un lugar privado y no lo subas a GitHub.');
  } finally {
    await cliente.end();
  }
  return 0;
}

module.exports = { principal };
if (require.main === module) correrScript(principal);
