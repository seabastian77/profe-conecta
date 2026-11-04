// Restaura un respaldo creado con «npm run db:respaldo». Sin opciones solo restaura en una base vacía.
require('dotenv').config();
const path = require('path');
const { CARPETA_RESPALDOS, leerArgumentos, resolverUrl, describirDestino, conectar, formatearBytes, correrScript } = require('./lib/comun');
const { verificarRespaldo, restaurarRespaldo } = require('./lib/respaldo');

const AYUDA = `
Uso: npm run db:restaurar -- <archivo> [opciones]

  --solo-verificar       Comprueba que el respaldo esté entero y muestra su contenido; no toca ninguna base
  --url=postgresql://…   Base de destino (por defecto DATABASE_URL; en Railway usa la URL pública)
  --reemplazar           Permite restaurar sobre una base que ya tiene datos (los reemplaza)
  --confirmar            Obligatorio junto con --reemplazar; antes se guarda una copia automática de lo actual
  --carpeta=ruta         Dónde guardar esa copia automática (por defecto la carpeta «respaldos»)
`;

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const [archivo] = opciones._;
  if (opciones.ayuda || opciones.help || !archivo) { console.log(AYUDA); return archivo ? 0 : 2; }

  const ruta = path.resolve(archivo);
  const verificado = await verificarRespaldo(ruta);
  const { cabecera } = verificado;
  const total = cabecera.tablas.reduce((suma, t) => suma + t.filas, 0);

  console.log(`📦 Respaldo del ${cabecera.creado.slice(0, 19).replace('T', ' ')} UTC · base «${cabecera.base}» · ${formatearBytes(verificado.bytes)}`);
  console.log(`✅ El archivo está completo y su huella coincide (${total} filas en ${cabecera.tablas.length} tablas)`);
  if (opciones['solo-verificar']) {
    for (const t of cabecera.tablas) console.log(`   ${t.nombre.padEnd(26)} ${String(t.filas).padStart(7)} filas`);
    return 0;
  }

  const url = resolverUrl(opciones);
  console.log(`\n🎯 Destino: ${describirDestino(url)}`);

  if (opciones.reemplazar && !opciones.confirmar) {
    console.log('⛔ Falta --confirmar. Con --reemplazar se borran los datos actuales de esa base (antes se guarda una copia automática).');
    return 1;
  }

  const cliente = await conectar(url);
  try {
    const carpeta = typeof opciones.carpeta === 'string' ? path.resolve(opciones.carpeta) : CARPETA_RESPALDOS;
    const resultado = await restaurarRespaldo(cliente, ruta, { reemplazar: Boolean(opciones.reemplazar), carpeta });
    if (resultado.respaldoPrevio) {
      console.log(`💾 Copia previa de lo que había: ${path.relative(process.cwd(), resultado.respaldoPrevio.archivo)}`);
    }
    console.log(`✅ Restauración completa: ${resultado.totalFilas} filas en ${resultado.tablas.length} tablas`);
    const { creados, omitidos } = resultado.endurecimiento;
    if (omitidos) console.log(`⚠️  ${omitidos} protección(es) de integridad no se crearon por datos conflictivos: ejecuta «npm run db:diagnostico».`);
    else if (creados) console.log(`🛡️  Se aplicaron ${creados} protecciones de integridad.`);
    console.log('\n🔑 Recomendado: cambia JWT_SECRET en Railway después de restaurar. Así se cierran todas las sesiones abiertas y ningún token viejo apunta a un usuario distinto.');
  } finally {
    await cliente.end();
  }
  return 0;
}

module.exports = { principal };
if (require.main === module) correrScript(principal);
