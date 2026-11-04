// Audita la base sin modificarla: integridad, calidad de datos, seguridad, rendimiento y mantenimiento.
require('dotenv').config();
const { leerArgumentos, resolverUrl, describirDestino, conectar, correrScript } = require('./lib/comun');
const { COMPROBACIONES, ejecutarDiagnostico } = require('./lib/diagnostico');

const AYUDA = `
Uso: npm run db:diagnostico [-- opciones]

  --url=postgresql://…   Base a revisar (por defecto DATABASE_URL; en Railway usa la URL pública)
  --profundo             Además busca cuentas con contraseñas publicadas (tarda unos segundos)
  --json                 Imprime el resultado en JSON
  --sql                  Solo imprime las consultas, para pegarlas en la pestaña Query de Railway; no se conecta
  --sin-respaldo         No avisa por la falta de respaldos en la carpeta local

Sale con código 1 si encuentra problemas de integridad (nivel «error»).
`;

const ICONOS = { ok: '✅', info: 'ℹ️ ', aviso: '⚠️ ', error: '❌', omitida: '⏭️ ' };

function imprimirConsultas() {
  for (const c of COMPROBACIONES) {
    console.log(`-- [${c.area}] ${c.titulo}`);
    console.log(c.sql ? `${c.sql.trim().replace(/\s*;?$/, ';')}\n` : '-- (esta comprobación se calcula en el script)\n');
  }
}

function imprimir(resultados) {
  let areaActual = null;
  for (const r of resultados) {
    if (r.area !== areaActual) { areaActual = r.area; console.log(`\n${areaActual.toUpperCase()}`); }
    const conCasos = !r.informe && r.nivel !== 'ok' && r.nivel !== 'omitida';
    console.log(`  ${ICONOS[r.nivel]} ${r.titulo}${conCasos ? ` — ${r.total} caso(s)` : ''}`);
    if (r.falla) console.log(`       No se pudo comprobar: ${r.falla}`);
    if (r.informe) {
      r.muestra.forEach(f => console.log(`       ${Object.values(f).join(' · ')}`));
    } else if (conCasos) {
      r.muestra.forEach(f => console.log(`       ${JSON.stringify(f)}`));
      if (r.total > r.muestra.length) console.log(`       … y ${r.total - r.muestra.length} más`);
      if (r.ayuda && r.nivel !== 'info') console.log(`       → ${r.ayuda}`);
    }
  }
}

async function principal() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda || opciones.help) { console.log(AYUDA); return 0; }
  if (opciones.sql) { imprimirConsultas(); return 0; }

  const url = resolverUrl(opciones);
  const cliente = await conectar(url);
  try {
    const { resultados, resumen } = await ejecutarDiagnostico(cliente, { profundo: Boolean(opciones.profundo) });
    const filtrados = opciones['sin-respaldo'] ? resultados.filter(r => r.id !== 'respaldo-reciente') : resultados;

    if (opciones.json) {
      console.log(JSON.stringify({ base: describirDestino(url), resumen, resultados: filtrados }, null, 2));
    } else {
      console.log(`🔎 Diagnóstico de ${describirDestino(url)}`);
      imprimir(filtrados);
      console.log(`\nResumen: ${resumen.ok} correctas · ${resumen.info} informativas · ${resumen.aviso} avisos · ${resumen.error} errores`);
      if (resumen.error) console.log('Hay problemas de integridad. «npm run db:reparar» muestra qué se puede corregir sin perder información.');
    }
    return resumen.error ? 1 : 0;
  } finally {
    await cliente.end();
  }
}

module.exports = { principal };
if (require.main === module) correrScript(principal);
