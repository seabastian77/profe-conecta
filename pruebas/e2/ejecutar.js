'use strict';
// Ejecuta la suite del Entregable 2 contra una instancia de ConectaProfe y deja,
// por cada caso, su estado, el resultado real, la evidencia y las llamadas a la API.
//
// Uso:
//   ADMIN_CORREO=... ADMIN_CONTRASENA=... node pruebas/e2/ejecutar.js --ciclo 1
//   opciones: --base http://localhost:3000  --perfil escritorio|movil  --casos CP-001,CP-013
//             --version 693358a  --salida pruebas/e2/resultados/ciclo-1  --sufijo c1
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CASOS } = require('./casos');
const { Caso, horaColombia, marcaColombia, prepararSalida } = require('./apoyo');

// Oculta contraseñas, tokens y fotos en base64 de los cuerpos que se guardan.
function redactar(texto) {
  if (!texto) return texto;
  return String(texto)
    .replace(/("contrasena"\s*:\s*)"[^"]*"/gi, '$1"[oculta]"')
    .replace(/("foto_base64"\s*:\s*)"[^"]*"/gi, '$1"[imagen]"')
    .replace(/("token"\s*:\s*)"[^"]*"/gi, '$1"[oculto]"');
}

function argumentos() {
  const a = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) a[v[i].replace(/^--/, '')] = v[i + 1];
  return a;
}

// Crea una imagen JPEG de exactamente 2,50 MB para CP-017.
async function prepararFoto(navegador, carpeta) {
  const ruta = path.join(carpeta, 'foto_2-5MB.jpg');
  const objetivo = Math.round(2.5 * 1024 * 1024);
  if (fs.existsSync(ruta) && fs.statSync(ruta).size === objetivo) {
    return { ruta, nombre: 'foto_2-5MB.jpg', bytes: objetivo };
  }
  fs.mkdirSync(carpeta, { recursive: true });
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  let lado = 1500;
  let buf;
  for (;;) {
    const b64 = await p.evaluate((lado) => {
      const c = document.createElement('canvas');
      c.width = lado; c.height = Math.round(lado * 0.75);
      const g = c.getContext('2d');
      const img = g.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const x = (i / 4) % c.width;
        img.data[i] = (x * 255 / c.width + Math.random() * 90) % 256;
        img.data[i + 1] = Math.random() * 255;
        img.data[i + 2] = 140 + Math.random() * 110;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }, lado);
    buf = Buffer.from(b64, 'base64');
    if (buf.length <= objetivo) break;
    lado = Math.round(lado * 0.92);
  }
  await ctx.close();
  // Rellena después del marcador de fin de imagen: los visores ignoran esos bytes.
  fs.writeFileSync(ruta, Buffer.concat([buf, Buffer.alloc(objetivo - buf.length)]));
  return { ruta, nombre: 'foto_2-5MB.jpg', bytes: objetivo };
}

(async () => {
  const a = argumentos();
  const ciclo = parseInt(a.ciclo || '1', 10);
  const baseUrl = (a.base || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const perfil = a.perfil || 'escritorio';
  const salida = path.resolve(a.salida || path.join(__dirname, 'resultados', `ciclo-${ciclo}`));
  const filtro = a.casos ? a.casos.split(',') : null;

  if (!process.env.ADMIN_CORREO || !process.env.ADMIN_CONTRASENA) {
    console.error('Faltan ADMIN_CORREO y ADMIN_CONTRASENA (cuenta de administrador de pruebas).');
    process.exit(1);
  }

  prepararSalida(salida);
  const navegador = await chromium.launch();
  const versionNavegador = `Chromium ${navegador.version()}`;
  const foto = await prepararFoto(navegador, path.join(__dirname, 'datos'));

  // La asesoría de CP-032 va hoy, dos horas después de la hora actual.
  const horaHoy = horaColombia(120) > horaColombia(0) ? horaColombia(120) : '23:59';

  const datos = {
    sufijo: a.sufijo || `c${ciclo}`,
    admin: { correo: process.env.ADMIN_CORREO, clave: process.env.ADMIN_CONTRASENA },
    foto,
    cuentaFoto: ciclo === 1 ? 'clondono@amigo.edu.co' : 'crios@amigo.edu.co',
    choqueDocente: ciclo === 1 ? '2027-03-10' : '2027-03-11',
    choqueEstudiante: ciclo === 1 ? '2027-04-01' : '2027-04-02',
    horaAsesoriaHoy: horaHoy
  };

  const entorno = { navegador, baseUrl, perfil, ciclo, salida, versionNavegador };
  const corrida = {
    ciclo,
    perfil,
    baseUrl,
    versionSistema: a.version || 'sin indicar',
    navegador: versionNavegador,
    sistemaOperativo: `${process.platform} ${require('os').release()}`,
    zonaHorariaNavegador: 'America/Bogota',
    inicio: marcaColombia(),
    casos: []
  };

  const lista = CASOS.filter(k => !filtro || filtro.includes(k.id));
  for (const def of lista) {
    const caso = new Caso(def, entorno);
    const t0 = Date.now();
    let resultado;
    try {
      resultado = await def.ejecutar(caso, datos);
    } catch (err) {
      // Un error del script no es un defecto del sistema: se deja como no ejecutado.
      resultado = { estado: 'No ejecutado', real: `El script falló antes de terminar: ${err.message.split('\n')[0]}` };
      const s = caso.sesiones[caso.sesiones.length - 1];
      if (s) await caso.evidencia(s, 'Estado de la pantalla cuando falló el script').catch(() => {});
    }
    const fila = {
      id: def.id,
      titulo: def.titulo,
      requisito: def.requisito,
      riesgo: def.riesgo,
      tecnica: def.tecnica,
      prioridad: def.prioridad,
      responsable: def.responsable,
      esperado: def.esperado,
      ciclo,
      entorno: `${versionNavegador} · ${perfil === 'movil' ? 'móvil 360 px' : 'escritorio 1366 px'} · ${corrida.versionSistema}`,
      fecha: marcaColombia(new Date(t0)),
      ejecutor: 'Script E2 (Playwright)',
      estado: resultado.estado,
      real: resultado.real,
      defecto: resultado.defecto || null,
      evidencias: caso.evidencias,
      red: caso.red().map(r => {
        // Oculta credenciales y datos binarios antes de guardar el cuerpo enviado.
        const limpio = redactar(r.enviado);
        return { ...r, enviado: limpio.length > 200 ? `${limpio.slice(0, 200)}… (${r.bytesEnviados} caracteres)` : limpio };
      }),
      dialogos: caso.dialogos(),
      erroresPagina: caso.sesiones.flatMap(s => s.errores),
      duracionSeg: Math.round((Date.now() - t0) / 100) / 10
    };
    corrida.casos.push(fila);
    await caso.cerrar();
    console.log(`${fila.id}  ${fila.estado.padEnd(12)} ${fila.defecto || ''}`);
  }

  corrida.fin = marcaColombia();
  await navegador.close();

  const archivo = path.join(salida, 'resultados.json');
  fs.writeFileSync(archivo, JSON.stringify(corrida, null, 2));
  const cuenta = corrida.casos.reduce((m, x) => ({ ...m, [x.estado]: (m[x.estado] || 0) + 1 }), {});
  console.log('\nResumen:', JSON.stringify(cuenta), '\nResultados en', archivo);
})();
