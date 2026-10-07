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
const { iniciarSesion, marcaColombia, prepararSalida } = require('./apoyo');

const SEMILLA = '123456';

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
    esperado: 'El servidor debería rechazar el cambio (la tutoría está cancelada). En su lugar responde {mensaje: "Tutoría completada"} y la tutoría pasa a «completada»: DEFECTO.',
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
    esperado: 'El servidor debería rechazar la fecha y la hora inválidas. En su lugar responde 201 {mensaje: "Tutoría programada"}: DEFECTO.',
    async correr(p) {
      const docs = (await ejecutarFetch(p, 'GET', '/api/tutorias/docentes-disponibles', null, true)).body;
      const docente = docs[0].id;
      const r = await ejecutarFetch(p, 'POST', '/api/tutorias',
        { docente_id: docente, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: '2027-13-45', hora: '25:99' }, true);
      r.comandoReal = null;
      return r;
    },
    evaluar: (r) => ({ ok: r.status !== 201,
      real: `El servidor respondió ${r.status} ${fmt(r.body)}: acepta la fecha «2027-13-45» y la hora «25:99» sin validar que existan.` }),
  },
];

// Formatea un objeto de respuesta como lo imprime la consola.
function fmt(body) {
  if (body == null) return 'null';
  if (Array.isArray(body)) return `Array(${body.length})`;
  if (typeof body === 'object') {
    const partes = Object.entries(body).slice(0, 3).map(([k, v]) =>
      `${k}: ${typeof v === 'string' ? `'${v}'` : JSON.stringify(v)}`);
    return `{${partes.join(', ')}}`;
  }
  return String(body);
}

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

// Dibuja sobre la página una vista de la consola del navegador (F12) con el
// comando, el Promise pendiente, la línea del método con su código y la respuesta.
async function evidenciaConsola(p, { id, comando, metodo, ruta, status, statusText, body, base }) {
  const esError = status >= 400;
  await p.evaluate(({ id, comando, metodo, ruta, status, statusText, cuerpo, esError, base, host }) => {
    document.getElementById('__consolaE2')?.remove();
    const panel = document.createElement('div');
    panel.id = '__consolaE2';
    panel.setAttribute('style',
      'position:fixed;inset:0;z-index:2147483647;display:flex;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace');

    // Columna izquierda: la consola. Derecha: deja ver la app.
    const consola = document.createElement('div');
    consola.setAttribute('style',
      'width:63%;height:100%;background:#1e1e1f;color:#e8eaed;overflow:hidden;' +
      'border-right:2px solid #3c4043;display:flex;flex-direction:column');

    const barra = `<div style="background:#292a2d;color:#9aa0a6;font-size:12px;padding:7px 12px;border-bottom:1px solid #3c4043">
      <span style="color:#e8eaed;font-weight:600">Console</span> &nbsp; Elements &nbsp; Network &nbsp; Sources &nbsp;
      <span style="float:right">${host}</span></div>`;

    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Colorea las cadenas entre comillas del comando.
    const cmdColor = esc(comando).replace(/(&quot;|&#39;|")(.*?)(\1)/g, '<span style="color:#f28b82">$1$2$3</span>')
      .replace(/\b(fetch|method|headers|body|then)\b/g, '<span style="color:#8ab4f8">$1</span>');

    const circulo = esError
      ? '<span style="color:#f28b82;font-weight:700">⊘</span>'
      : '<span style="color:#81c995;font-weight:700">›</span>';
    const lineaRed = esError
      ? `<div style="background:#3a2323;color:#f28b82;padding:4px 12px;border-top:1px solid #3c4043;border-bottom:1px solid #3c4043">
           ⊘ <span style="text-decoration:underline">${metodo} ${base}${ruta}</span> <b>${status} (${statusText || ''})</b></div>`
      : `<div style="color:#9aa0a6;padding:4px 12px">${metodo} ${base}${ruta} <b style="color:#e8eaed">${status}</b></div>`;

    const cuerpoColor = cuerpo.replace(/([a-zA-Z_]+):/g, '<span style="color:#c58af9">$1</span>:')
      .replace(/('[^']*')/g, '<span style="color:#f28b82">$1</span>');

    consola.innerHTML = barra +
      `<div style="padding:10px 12px;font-size:13px;line-height:1.6;overflow:auto;flex:1">
        <div style="color:#8ab4f8">&gt;</div>
        <pre style="margin:0 0 6px 14px;white-space:pre-wrap;color:#e8eaed">${cmdColor}</pre>
        <div style="color:#9aa0a6;margin-left:14px">&lt; Promise {&lt;pending&gt;}</div>
        ${lineaRed}
        <div style="margin-left:14px;margin-top:6px">${circulo} ▶ <span>{ ${cuerpoColor} }</span></div>
        <div style="color:#8ab4f8;margin-top:8px">&gt;</div>
      </div>`;
    panel.appendChild(consola);
    // Franja de rótulo sobre la app (derecha).
    const rotulo = document.createElement('div');
    rotulo.setAttribute('style', 'flex:1;position:relative');
    rotulo.innerHTML = `<div style="position:absolute;bottom:10px;left:10px;right:10px;background:rgba(17,24,39,.9);
      color:#f9fafb;font-size:11px;padding:6px 9px;border-radius:6px;white-space:pre-wrap">${id} · consola F12 · ${host}</div>`;
    panel.appendChild(rotulo);
    document.documentElement.appendChild(panel);
  }, { id, comando, metodo, ruta, status, statusText, cuerpo: fmtPlano(body), esError, base,
       host: new URL(base).host });
}

// Igual que fmt pero sin llaves exteriores (para el cuerpo coloreado).
function fmtPlano(body) {
  const t = fmt(body);
  return t.startsWith('{') && t.endsWith('}') ? t.slice(1, -1).trim() : t;
}

(async () => {
  const args = {};
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i += 2) args[v[i].replace(/^--/, '')] = v[i + 1];
  const base = (args.base || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const salida = path.resolve(args.salida || path.join(__dirname, 'resultados', 'consola'));
  const filtro = args.casos ? args.casos.split(',') : null;

  prepararSalida(salida);
  const navegador = await chromium.launch();
  const versionNavegador = `Chromium ${navegador.version()}`;
  const corrida = { inicio: marcaColombia(), base, navegador: versionNavegador, pruebas: [] };

  for (const prueba of PRUEBAS.filter(x => !filtro || filtro.includes(x.id))) {
    const ctx = await navegador.newContext({ baseURL: base, timezoneId: 'America/Bogota', locale: 'es-CO', viewport: { width: 1366, height: 768 } });
    const p = await ctx.newPage();
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
      await evidenciaConsola(p, { id: prueba.id, comando: comandoMostrado, metodo: r.metodo || 'POST',
        ruta: r.ruta || '', status: r.status, statusText: r.statusText, body: r.body, base });
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
      httpStatus: r ? r.status : null,
    });
    console.log(`${prueba.id}  ${veredicto.ok ? 'OK' : (prueba.id.startsWith('DEF') ? 'DEFECTO' : 'FALLA')}  HTTP ${r ? r.status : '—'}`);
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
