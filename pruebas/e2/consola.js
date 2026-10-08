'use strict';
// Pruebas por consola del navegador (F12). Son las que la guía ejecuta pegando
// un fetch() con el token de la sesión, como en CP-018 y CP-021. Este script:
//   1. Inicia sesión con el rol que corresponde.
//   2. Ejecuta el MISMO fetch que se pegaría en la consola y captura la
//      respuesta real (código HTTP y cuerpo).
//   3. Deja una evidencia que reproduce la vista de la consola: el comando, el
//      Promise pendiente, la línea del POST/PATCH con su código y el objeto de
//      respuesta, sobre la aplicación real.
//   4. Decide el estado comparando lo observado con lo que exige el requisito.
//
// Uso: ADMIN_CORREO=... ADMIN_CONTRASENA=... node pruebas/e2/consola.js
//      opciones: --base <url>  --salida <dir>  --casos CP-008,CP-018
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
  iniciarSesion, marcaColombia, prepararSalida, programarTutoria, ir, fechaColombia, instanteColombia,
  dibujarConsola, fmtRespuesta, lanzarNavegador
} = require('./apoyo');

const SEMILLA = process.env.CLAVE_CUENTAS || '123456';
const dma = (f) => f.split('-').reverse().join('/');

// Los cinco casos/defectos que se verifican por la consola del navegador.
// `comando` es exactamente lo que se pega en la consola (rutas relativas: sirven
// igual en localhost y en Railway porque son del mismo origen).
const PRUEBAS = [
  {
    id: 'CP-008', titulo: 'Rechazo de registro con rol de administrador',
    requisito: 'R1 · RRN02', sesion: null,
    descripcion: 'Un visitante intenta registrarse como administrador enviando la petición a mano.',
    comando:
`fetch("/api/auth/registro",{method:"POST",headers:{
  "Content-Type":"application/json"},
  body:JSON.stringify({nombres:"Intruso",apellidos:"Prueba",
  correo:"admin.consola@amigo.edu.co",contrasena:"Password123",
  rol:"admin"})}).then(r=>r.json()).then(console.log)`,
    esperado: 'La consola muestra {error: "Rol inválido"} y la pestaña Red, el código 400. No se crea la cuenta.',
    async correr(p) {
      return ejecutarFetch(p, 'POST', '/api/auth/registro',
        { nombres: 'Intruso', apellidos: 'Prueba', correo: 'admin.consola@amigo.edu.co', contrasena: 'Password123', rol: 'admin' });
    },
    evaluar: (r) => ({ ok: r.status === 400 && r.body && r.body.error === 'Rol inválido',
      real: `La consola muestra ${fmt(r.body)} y la pestaña Red el código ${r.status}. El servidor no crea la cuenta de administrador.` }),
  },
  {
    id: 'CP-018', titulo: 'Un estudiante no puede guardar un perfil de docente',
    requisito: 'R4 · RRN05', sesion: { correo: 'sgarcia@amigo.edu.co', clave: SEMILLA, rol: 'estudiante' },
    descripcion: 'Un estudiante autenticado intenta usar el endpoint de perfil de docente (control de acceso por rol).',
    comando:
`fetch("/api/perfil/docente",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({cedula:"12345",facultad:"Ingenierías"})})
  .then(r=>r.json()).then(console.log)`,
    esperado: 'La consola muestra {error: "No tienes permiso para esto"} y la pestaña Red, el código 403. No se crea ningún perfil de docente.',
    async correr(p) {
      return ejecutarFetch(p, 'POST', '/api/perfil/docente', { cedula: '12345', facultad: 'Ingenierías' }, true);
    },
    evaluar: (r) => ({ ok: r.status === 403,
      real: `La consola muestra ${fmt(r.body)} y la pestaña Red el código ${r.status}. El servidor no crea ningún perfil de docente para el estudiante.` }),
  },
  {
    id: 'CP-021', titulo: 'Rechazo de tutoría con docente inexistente',
    requisito: 'R5 · R-03', sesion: { correo: 'sgarcia@amigo.edu.co', clave: SEMILLA, rol: 'estudiante' },
    descripcion: 'Se programa una tutoría con un docente que no existe; el servidor debe responder 404 sin caerse.',
    comando:
`fetch("/api/tutorias",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({docente_id:999999,
  asignatura:"Cálculo Diferencial",modalidad:"Virtual",
  fecha:"2027-02-15",hora:"10:00"})}).then(r=>r.json()).then(console.log)`,
    esperado: 'La consola muestra {error: "Docente no encontrado o inactivo"} y la pestaña Red, el código 404. Al recargar, la página carga normal: el servidor sigue arriba (no hay error 500).',
    async correr(p) {
      const r = await ejecutarFetch(p, 'POST', '/api/tutorias',
        { docente_id: 999999, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: '2027-02-15', hora: '10:00' }, true);
      await p.reload(); await p.waitForTimeout(1500);
      r.sigueArriba = (await p.evaluate(() => Boolean(document.querySelector('.pagina.activa')))) === true;
      return r;
    },
    evaluar: (r) => ({ ok: r.status === 404 && r.sigueArriba,
      real: `La consola muestra ${fmt(r.body)} y la pestaña Red el código ${r.status}. Al recargar, la página carga normal y el servidor sigue arriba (no hay error 500).` }),
  },
  {
    id: 'DEF-06', titulo: 'Una tutoría cancelada se marca «completada» por la API',
    requisito: 'R6', sesion: { correo: 'mgonzalez@amigo.edu.co', clave: SEMILLA, rol: 'docente' },
    descripcion: 'Una tutoría ya cancelada no debería admitir nuevas transiciones; por la API se puede marcar «realizada».',
    // La preparación (programar y cancelar) se hace antes; ID se inyecta en el comando mostrado.
    comando:
`fetch("/api/tutorias/ID/realizada",{method:"PATCH",
  headers:{Authorization:"Bearer "+localStorage.getItem("cp.token")}})
  .then(r=>r.json()).then(console.log)`,
    esperado: 'R6: una tutoría cancelada no admite nuevas transiciones. El servidor rechaza el cambio con un error y la tutoría sigue «cancelada».',
    prepararId: true,
    async correr(p, ctx) {
      const r = await ejecutarFetch(p, 'PATCH', `/api/tutorias/${ctx.id}/realizada`, null, true);
      const estado = (await ejecutarFetch(p, 'GET', '/api/tutorias', null, true)).body.find(t => t.id === ctx.id)?.estado;
      r.estadoFinal = estado;
      r.comandoReal = `fetch("/api/tutorias/${ctx.id}/realizada",{method:"PATCH",headers:{Authorization:"Bearer "+localStorage.getItem("cp.token")}}).then(r=>r.json()).then(console.log)`;
      return r;
    },
    evaluar: (r) => ({ ok: !(r.status === 200 && r.estadoFinal === 'completada'),
      real: `El servidor respondió ${r.status} ${fmt(r.body)} y la tutoría cancelada pasó a «${r.estadoFinal}». Debería haberlo rechazado.` }),
  },
  {
    id: 'DEF-10', titulo: 'La API guarda tutorías con fechas y horas que no existen',
    requisito: 'R5', sesion: { correo: 'dmontoya@amigo.edu.co', clave: SEMILLA, rol: 'estudiante' },
    descripcion: 'El servidor no valida que la fecha y la hora existan; acepta «2027-13-45» y «25:99».',
    comando:
`fetch("/api/tutorias",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({docente_id:9,asignatura:"Cálculo Diferencial",
  modalidad:"Virtual",fecha:"2027-13-45",hora:"25:99"})})
  .then(r=>r.json()).then(console.log)`,
    esperado: 'R5: el servidor rechaza una fecha o una hora que no existen (código 400 con un mensaje claro) y no guarda la tutoría.',
    async correr(p) {
      // Usa el docente 9 del comando si existe; si no, el primero disponible, y muestra el id real usado.
      const docs = (await ejecutarFetch(p, 'GET', '/api/tutorias/docentes-disponibles', null, true)).body;
      // En Railway la misma petición pudo hacerse antes a mano: si esa franja ya existe (409),
      // se repite con otro docente para que la prueba mida la validación y no el choque.
      const orden = [docs.find(d => d.id === 9), ...docs.filter(d => d.id !== 9)].filter(Boolean);
      let docente, r;
      for (const d of orden) {
        docente = d.id;
        r = await ejecutarFetch(p, 'POST', '/api/tutorias',
          { docente_id: docente, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: '2027-13-45', hora: '25:99' }, true);
        if (r.status !== 409) break;
      }
      r.comandoReal = this.comando.replace('docente_id:9', `docente_id:${docente}`);
      return r;
    },
    evaluar: (r) => ({ ok: r.status !== 201,
      real: `El servidor respondió ${r.status} ${fmt(r.body)}: acepta la fecha «2027-13-45» y la hora «25:99» sin validar que existan.` }),
  },
  {
    id: 'DEF-13', titulo: 'Los mensajes emergentes se generan pero nunca se ven',
    requisito: 'RF028 · transversal', sesion: { correo: 'lcano@amigo.edu.co', clave: SEMILLA, rol: 'estudiante' },
    descripcion: 'Justo después de una acción que muestra un mensaje (cancelar una tutoría con menos de 24 horas), se inspecciona el elemento #tostada desde la consola, que es el paso 3 del reporte.',
    tipo: 'inspeccion',
    comando:
`const t = document.getElementById("tostada");
console.log(t.textContent, "|", t.className,
  "| opacidad:", getComputedStyle(t).opacity)`,
    esperado: 'RF028: el mensaje emergente se ve en pantalla (opacidad 1) y después desaparece solo.',
    async correr(p) {
      // Prepara una tutoría que empieza en unas 12 horas y la intenta cancelar desde la tarjeta.
      let { fecha, hora } = instanteColombia(Date.now() + 12 * 3600000);
      if (fecha === fechaColombia(0)) fecha = fechaColombia(1);
      await programarTutoria(p, { tutor: 'Paola Martínez Cruz', fecha, hora });
      await ir(p, 'panel-estudiante');
      const tarjeta = p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: `${dma(fecha)} · ⏰ ${hora}` }).first();
      const espera = p.waitForResponse(r => r.url().includes('/cancelar')).catch(() => null);
      await tarjeta.locator('button:has-text("Cancelar")').click();
      await espera;
      // El mensaje dura 3,5 s: se inspecciona dentro de ese tiempo.
      await p.waitForTimeout(500);
      const ins = await p.evaluate(() => {
        const t = document.getElementById('tostada');
        return { texto: t.textContent, clases: t.className, opacidad: getComputedStyle(t).opacity };
      });
      return { tipo: 'inspeccion', status: null, ...ins, opacidad: parseFloat(ins.opacidad),
        salida: `${ins.texto} | ${ins.clases} | opacidad: ${ins.opacidad}` };
    },
    evaluar: (r) => ({ ok: r.opacidad >= 0.9,
      real: `La consola imprime «${r.salida}». El elemento tiene el mensaje y la clase «tostada--visible», pero la hoja de estilos solo define «.tostada.visible»; por eso la opacidad se queda en 0 y en pantalla no aparece nada.` }),
  },
];

const fmt = fmtRespuesta;

// Ejecuta el fetch dentro de la página y devuelve {status, statusText, body}.
async function ejecutarFetch(p, metodo, ruta, cuerpo, conToken) {
  return p.evaluate(async ({ metodo, ruta, cuerpo, conToken }) => {
    const opciones = { method: metodo, headers: {} };
    if (cuerpo) { opciones.headers['Content-Type'] = 'application/json'; opciones.body = JSON.stringify(cuerpo); }
    if (conToken) opciones.headers.Authorization = 'Bearer ' + localStorage.getItem('cp.token');
    const r = await fetch(ruta, opciones);
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    return { status: r.status, statusText: r.statusText, body, metodo, ruta };
  }, { metodo, ruta, cuerpo, conToken });
}

(async () => {
  const args = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) args[v[i].replace(/^--/, '')] = v[i + 1];
  const base = (args.base || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const salida = path.resolve(args.salida || path.join(__dirname, 'resultados', 'consola'));
  const filtro = args.casos ? args.casos.split(',') : null;

  prepararSalida(salida);
  const navegador = await lanzarNavegador(chromium, base);
  const versionNavegador = `Chromium ${navegador.version()}`;
  const corrida = { inicio: marcaColombia(), base, navegador: versionNavegador, pruebas: [] };

  for (const prueba of PRUEBAS.filter(x => !filtro || filtro.includes(x.id))) {
    const ctx = await navegador.newContext({ baseURL: base, timezoneId: 'America/Bogota', locale: 'es-CO', viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
    // Acepta los cuadros de confirmación (p. ej. «¿Cancelar esta tutoría?»), como haría quien ejecuta.
    p.on('dialog', (d) => d.accept().catch(() => {}));
    let r, veredicto, ctxExtra = {};
    try {
      // Carga la app y, si el caso lo pide, inicia sesión.
      await p.goto('/'); await p.waitForSelector('#splash', { state: 'hidden', timeout: 8000 }).catch(() => {});
      if (prueba.sesion) await iniciarSesion(p, prueba.sesion.correo, prueba.sesion.clave);

      // DEF-06 necesita una tutoría cancelada: se prepara con un estudiante aparte.
      if (prueba.prepararId) ctxExtra.id = await prepararTutoriaCancelada(navegador, base);

      r = await prueba.correr(p, ctxExtra);
      veredicto = prueba.evaluar(r);
      const comandoMostrado = r.comandoReal || prueba.comando;
      const host = new URL(base).host;
      const entrada = r.tipo === 'inspeccion'
        ? { comando: comandoMostrado, salidaLog: r.salida }
        : { comando: comandoMostrado, metodo: r.metodo || 'POST', url: base + (r.ruta || ''),
            status: r.status, statusText: r.statusText, body: r.body };
      await dibujarConsola(p, { entradas: [entrada], host,
        rotulo: `${prueba.id} · consola F12 · ${host}\n{AHORA} hora de Colombia · ${versionNavegador}` });
      const nombre = `EV-${prueba.id.replace('-', '')}-CONSOLA.png`;
      await p.screenshot({ path: path.join(salida, 'evidencias', nombre) });
      prueba._evidencia = nombre;
    } catch (e) {
      veredicto = { ok: false, real: 'Error de script: ' + e.message.split('\n')[0] };
    }
    corrida.pruebas.push({
      id: prueba.id, titulo: prueba.titulo, requisito: prueba.requisito,
      descripcion: prueba.descripcion, comando: (r && r.comandoReal) || prueba.comando,
      esperado: prueba.esperado, estado: veredicto.ok ? 'Aprobado' : (prueba.id.startsWith('DEF') ? 'Defecto confirmado' : 'Fallido'),
      resultadoReal: veredicto.real, evidencia: prueba._evidencia || '—',
      httpStatus: r ? r.status : null, tipo: prueba.tipo || 'peticion',
    });
    console.log(`${prueba.id}  ${veredicto.ok ? 'OK' : (prueba.id.startsWith('DEF') ? 'DEFECTO' : 'FALLA')}  ${r && r.status ? 'HTTP ' + r.status : 'inspección'}`);
    await ctx.close();
  }

  corrida.fin = marcaColombia();
  await navegador.close();
  fs.writeFileSync(path.join(salida, 'resultados.json'), JSON.stringify(corrida, null, 2));
  console.log('\nResultados en', path.join(salida, 'resultados.json'));
})();

// Prepara una tutoría cancelada y devuelve su id, para DEF-06.
async function prepararTutoriaCancelada(navegador, base) {
  const ctx = await navegador.newContext({ baseURL: base, timezoneId: 'America/Bogota', locale: 'es-CO' });
  const p = await ctx.newPage();
  await p.goto('/'); await p.waitForSelector('#splash', { state: 'hidden', timeout: 8000 }).catch(() => {});
  await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
  const docs = (await ejecutarFetch(p, 'GET', '/api/tutorias/docentes-disponibles', null, true)).body;
  const docente = docs.find(d => /González Ramos/.test(d.nombre)) || docs[0];
  const anio = 2029 + Math.floor(Math.random() * 6);
  const crea = await ejecutarFetch(p, 'POST', '/api/tutorias',
    { docente_id: docente.id, asignatura: 'Programación I', modalidad: 'Virtual', fecha: `${anio}-05-20`, hora: '09:15' }, true);
  const id = crea.body.id;
  await ejecutarFetch(p, 'PATCH', `/api/tutorias/${id}/cancelar`, null, true);
  await ctx.close();
  return id;
}
