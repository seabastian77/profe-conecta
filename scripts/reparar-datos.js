// Corrige los datos que impiden crear las protecciones de integridad. Sin --aplicar solo muestra el plan.
require('dotenv').config();
const path = require('path');
const { CARPETA_RESPALDOS, leerArgumentos, resolverUrl, describirDestino, conectar, correrScript } = require('./lib/comun');
const { planificarReparaciones, aplicarReparaciones } = require('./lib/reparaciones');

const LIMITE_POR_TIPO = 10;

const AYUDA = `
Uso: npm run db:reparar [-- opciones]

  (sin opciones)         Muestra lo que se cambiaría; no modifica nada
  --aplicar              Guarda una copia de seguridad automática y aplica el plan en una sola transacción
  --limpiar-documentos   Incluye vaciar documentos y cédulas repetidos en las cuentas más nuevas (queda constancia en auditoría)
  --sin-notificar        No avisa a las personas cuyas tutorías se cancelan
  --detalle              Lista todos los cambios planificados, no solo los primeros de cada tipo
  --url=postgresql://…   Base a reparar (por defecto DATABASE_URL; en Railway usa la URL pública)
  --carpeta=ruta         Dónde guardar la copia previa (por defecto la carpeta «respaldos»)

Nunca borra filas: las tutorías se marcan como canceladas y las asignaciones como removidas.
`;

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda || opciones.help) { console.log(AYUDA); return 0; }

  const ajustes = { limpiarDocumentos: Boolean(opciones['limpiar-documentos']), notificar: !opciones['sin-notificar'] };
  const url = resolverUrl(opciones);
  console.log(`🛠️  Reparación de datos de ${describirDestino(url)} ${opciones.aplicar ? '(se aplicará)' : '(solo simulación)'}`);

  const cliente = await conectar(url);
  try {
    const plan = await planificarReparaciones(cliente, ajustes);

    if (!plan.acciones.length) console.log('\n✅ No hay cambios automáticos pendientes.');
    else {
      console.log(`\nCambios planificados (${plan.acciones.length}):`);
      const mostradas = {};
      for (const a of plan.acciones) {
        mostradas[a.reparacion] = (mostradas[a.reparacion] || 0) + 1;
        if (opciones.detalle || mostradas[a.reparacion] <= LIMITE_POR_TIPO) console.log(`  • ${a.resumen}`);
      }
      for (const [tipo, total] of Object.entries(mostradas)) {
        if (!opciones.detalle && total > LIMITE_POR_TIPO) console.log(`  … y ${total - LIMITE_POR_TIPO} más de «${tipo}» (usa --detalle para verlos todos)`);
      }
    }

    if (plan.manuales.length) {
      console.log(`\n✋ Requieren una decisión tuya (${plan.manuales.length}), no se tocan:`);
      plan.manuales.forEach(m => console.log(`  • ${m.resumen}\n    → ${m.ayuda}`));
    }

    if (!opciones.aplicar) {
      if (plan.acciones.length) console.log('\nNo se modificó nada. Para aplicar el plan: npm run db:reparar -- --aplicar');
      return 0;
    }

    if (!plan.acciones.length) return 0;
    const carpeta = typeof opciones.carpeta === 'string' ? path.resolve(opciones.carpeta) : CARPETA_RESPALDOS;
    const resultado = await aplicarReparaciones(cliente, plan, { carpeta });
    console.log(`\n💾 Copia previa: ${path.relative(process.cwd(), resultado.respaldo.archivo)}`);
    console.log(`✅ Cambios aplicados: ${resultado.aplicadas}${resultado.omitidas ? ` (${resultado.omitidas} ya habían cambiado y se omitieron)` : ''}`);

    const { creados, omitidos } = resultado.endurecimiento;
    if (creados) console.log(`🛡️  Protecciones de integridad creadas ahora: ${creados}`);
    if (omitidos) console.log(`⚠️  Aún faltan ${omitidos} protección(es) por los casos manuales de arriba.`);

    const verificacion = await planificarReparaciones(cliente, ajustes);
    console.log(verificacion.acciones.length ? `⚠️  Quedan ${verificacion.acciones.length} cambio(s) por aplicar: vuelve a ejecutar.` : '🔎 Verificado: no quedan cambios automáticos pendientes.');
  } finally {
    await cliente.end();
  }
  return 0;
}

module.exports = { principal };
if (require.main === module) correrScript(principal);
