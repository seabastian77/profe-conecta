'use strict';
// Funciones de apoyo para ejecutar los casos del Entregable 2 en un navegador real.
const fs = require('fs');
const path = require('path');

const ZONA = 'America/Bogota';
// Colombia no tiene horario de verano: la diferencia con UTC es siempre de 5 horas.
const DESFASE_COLOMBIA_MS = -5 * 3600 * 1000;

// Devuelve la fecha AAAA-MM-DD de Colombia, desplazada en días.
function fechaColombia(desplazamientoDias = 0, base = Date.now()) {
  const d = new Date(base + DESFASE_COLOMBIA_MS);
  d.setUTCDate(d.getUTCDate() + desplazamientoDias);
  return d.toISOString().slice(0, 10);
}

// Devuelve la hora HH:MM de Colombia, desplazada en minutos.
function horaColombia(desplazamientoMinutos = 0, base = Date.now()) {
  return new Date(base + DESFASE_COLOMBIA_MS + desplazamientoMinutos * 60000).toISOString().slice(11, 16);
}

// Devuelve fecha y hora de Colombia a partir de un instante, como {fecha, hora}.
function instanteColombia(ms) {
  const iso = new Date(ms + DESFASE_COLOMBIA_MS).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

// Formatea un instante en hora de Colombia, para la evidencia y el registro.
function marcaColombia(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(fecha);
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Crea el contexto del caso: una ventana limpia por cada sesión que abre el caso.
class Caso {
  constructor(definicion, entorno) {
    this.def = definicion;
    this.entorno = entorno;
    this.sesiones = [];
    this.evidencias = [];
    this.descripciones = {};
    this.notas = [];
    this.consecutivo = 0;
  }

  // Abre una ventana nueva, opcionalmente con el reloj del navegador fijado.
  async abrir(opciones = {}) {
    const { navegador, baseUrl, perfil } = this.entorno;
    const dispositivo = perfil === 'movil'
      ? { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: 1366, height: 768 } };

    const contexto = await navegador.newContext({ baseURL: baseUrl, timezoneId: ZONA, locale: 'es-CO', ...dispositivo });
    if (opciones.reloj) await contexto.clock.install({ time: opciones.reloj });

    const pagina = await contexto.newPage();
    const sesion = { contexto, pagina, red: [], dialogos: [], errores: [], reloj: Boolean(opciones.reloj) };

    // Acepta los cuadros de confirmación y guarda su texto, como haría quien ejecuta.
    pagina.on('dialog', async (d) => {
      sesion.dialogos.push({ tipo: d.type(), mensaje: d.message(), hora: marcaColombia() });
      await d.accept().catch(() => {});
    });

    // Equivale a la pestaña Red: registra cada llamada a la API con su respuesta.
    pagina.on('response', async (r) => {
      const url = new URL(r.url());
      if (!url.pathname.startsWith('/api/')) return;
      const req = r.request();
      let cuerpo = '';
      try { cuerpo = await r.text(); } catch { /* respuesta sin cuerpo */ }
      const enviado = req.postData() || '';
      sesion.red.push({
        metodo: req.method(),
        ruta: url.pathname + url.search,
        estado: r.status(),
        respuesta: cuerpo.slice(0, 500),
        enviado: enviado.slice(0, 300),
        bytesEnviados: enviado.length,
        hora: marcaColombia()
      });
    });

    pagina.on('pageerror', (e) => sesion.errores.push(e.message));
    this.sesiones.push(sesion);
    return sesion;
  }

  // Marca la pantalla con el caso, la URL y la hora, y guarda la captura.
  // `enfoque` (selector CSS o Locator) lleva a la vista el elemento que prueba
  // el resultado, para que la captura muestre el efecto y no solo la cabecera.
  async evidencia(sesion, descripcion, extra, enfoque) {
    this.consecutivo += 1;
    const n = String(this.consecutivo).padStart(2, '0');
    const nombre = `EV-${this.def.id.replace('-', '')}-C${this.entorno.ciclo}-${n}.png`;
    const ruta = path.join(this.entorno.salida, 'evidencias', nombre);
    const p = sesion.pagina;

    if (enfoque) {
      if (typeof enfoque === 'string') {
        await p.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, enfoque).catch(() => {});
      } else {
        await enfoque.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
      }
      await p.waitForTimeout(500);
    }

    await p.evaluate(({ caso, ciclo, version, perfil, simulado, texto, lineas }) => {
      const quitar = (id) => document.getElementById(id)?.remove();
      quitar('__selloE2'); quitar('__redE2');

      const sello = document.createElement('div');
      sello.id = '__selloE2';
      const ahora = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date());
      sello.textContent = `${caso} · ciclo ${ciclo} · ${location.href}\n` +
        `${ahora} hora de Colombia${simulado ? ' (reloj del navegador simulado)' : ''} · ${version} · ${perfil}\n${texto}`;
      sello.setAttribute('style', 'position:fixed;left:8px;bottom:8px;z-index:2147483646;max-width:58%;' +
        'background:rgba(17,24,39,.9);color:#f9fafb;font:11px/1.4 ui-monospace,monospace;padding:6px 9px;' +
        'border-radius:6px;pointer-events:none;white-space:pre-wrap');
      document.documentElement.appendChild(sello);

      if (lineas && lineas.length) {
        const red = document.createElement('div');
        red.id = '__redE2';
        red.textContent = 'Red / consola (respuesta del servidor)\n' + lineas.join('\n');
        red.setAttribute('style', 'position:fixed;right:8px;top:8px;z-index:2147483647;max-width:46%;max-height:70%;' +
          'overflow:hidden;background:rgba(255,255,255,.97);color:#111827;border:2px solid #0f766e;' +
          'font:11px/1.4 ui-monospace,monospace;padding:7px 9px;border-radius:6px;pointer-events:none;' +
          'white-space:pre-wrap;word-break:break-all;box-shadow:0 4px 14px rgba(0,0,0,.25)');
        document.documentElement.appendChild(red);
      }
    }, {
      caso: this.def.id,
      ciclo: this.entorno.ciclo,
      version: this.entorno.versionNavegador,
      perfil: this.entorno.perfil === 'movil' ? 'móvil 360 px' : 'escritorio 1366 px',
      simulado: sesion.reloj,
      texto: descripcion,
      lineas: extra || []
    });

    await p.screenshot({ path: ruta });
    await p.evaluate(() => { document.getElementById('__selloE2')?.remove(); document.getElementById('__redE2')?.remove(); });
    this.evidencias.push(nombre);
    this.descripciones[nombre] = descripcion;
    return nombre;
  }

  // Captura con el aspecto de la consola del navegador (F12): el comando que se
  // pegó y lo que respondió. `entradas` es una lista de {comando, metodo, url,
  // status, statusText, body} o {comando, salidaLog} para una inspección.
  async evidenciaConsola(sesion, entradas, descripcion) {
    this.consecutivo += 1;
    const n = String(this.consecutivo).padStart(2, '0');
    const nombre = `EV-${this.def.id.replace('-', '')}-C${this.entorno.ciclo}-${n}.png`;
    const ruta = path.join(this.entorno.salida, 'evidencias', nombre);
    const host = new URL(this.entorno.baseUrl).host;
    const rotulo = `${this.def.id} · ciclo ${this.entorno.ciclo} · consola F12 · ${host}\n` +
      `{AHORA} hora de Colombia · ${this.entorno.versionNavegador}` + (descripcion ? `\n${descripcion}` : '');
    await dibujarConsola(sesion.pagina, { entradas, rotulo, host });
    await sesion.pagina.screenshot({ path: ruta });
    await sesion.pagina.evaluate(() => document.getElementById('__consolaE2')?.remove());
    this.evidencias.push(nombre);
    this.descripciones[nombre] = `Consola F12: ${descripcion || 'comando y respuesta del servidor'}`;
    return nombre;
  }

  nota(texto) { this.notas.push(texto); }

  async cerrar() {
    for (const s of this.sesiones) await s.contexto.close().catch(() => {});
  }

  red() { return this.sesiones.flatMap(s => s.red); }
  dialogos() { return this.sesiones.flatMap(s => s.dialogos); }
}

// Resume una llamada de red en una línea legible para la evidencia.
function lineaRed(r) {
  return `${r.metodo} ${r.ruta} → ${r.estado} ${r.respuesta.slice(0, 160)}`;
}

// Abre la aplicación y espera a que termine la pantalla de bienvenida.
async function abrirAplicacion(p, ruta = '/') {
  await p.goto(ruta);
  await p.waitForSelector('#splash', { state: 'hidden', timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(400);
}

// Inicia sesión por el formulario y devuelve el código HTTP de la respuesta.
async function iniciarSesion(p, correo, clave) {
  await abrirAplicacion(p);
  await p.waitForSelector('#loginCorreo', { state: 'visible' });
  await p.fill('#loginCorreo', correo);
  await p.fill('#loginContrasena', clave);
  const respuesta = p.waitForResponse(r => r.url().includes('/api/auth/login'));
  await p.click('#btnLogin');
  const r = await respuesta;
  await p.waitForTimeout(900);
  return r.status();
}

// Llena el formulario de registro y lo envía.
async function llenarRegistro(p, d) {
  await abrirAplicacion(p);
  await p.click('a:has-text("Regístrate aquí")');
  await p.waitForSelector('#pagina-crear-cuenta.activa');
  await p.fill('#regNombres', d.nombres);
  await p.fill('#regApellidos', d.apellidos);
  await p.fill('#regCorreo', d.correo);
  await p.selectOption('#regRol', d.rol);
  await p.fill('#regContrasena', d.clave);
  await p.fill('#regContrasena2', d.clave2 ?? d.clave);
  // La casilla real está oculta tras una caja dibujada: se marca pulsando la etiqueta.
  if (d.terminos !== false) await p.locator('label.recordar', { has: p.locator('#regTerminos') }).click();
  await p.click('#formularioRegistro button[type="submit"]');
  await p.waitForTimeout(1200);
}

// Cierra la sesión como lo hace el botón del menú lateral.
async function cerrarSesion(p) {
  await p.evaluate(() => typeof cerrarSesion === 'function' && cerrarSesion());
  await p.waitForTimeout(400);
}

// Navega a una sección: pulsa el enlace visible o, si está oculto en móvil, usa el mismo destino.
async function ir(p, pagina) {
  const selector = `[onclick="irAPagina('${pagina}')"]`;
  const visibles = await p.locator(selector).filter({ visible: true }).count();
  if (visibles > 0) await p.locator(selector).filter({ visible: true }).first().click();
  else await p.evaluate((n) => irAPagina(n), pagina);
  await p.waitForSelector(`#pagina-${pagina}.activa`);
  await p.waitForTimeout(900);
}

// Hace una petición desde la consola del navegador con el token de la sesión, como en la guía.
async function consola(p, metodo, ruta, cuerpo) {
  return p.evaluate(async ({ metodo, ruta, cuerpo }) => {
    const opciones = { method: metodo, headers: { 'Content-Type': 'application/json' } };
    const token = localStorage.getItem('cp.token');
    if (token) opciones.headers.Authorization = 'Bearer ' + token;
    if (cuerpo) opciones.body = JSON.stringify(cuerpo);
    const r = await fetch(ruta, opciones);
    let datos = null;
    try { datos = await r.json(); } catch { /* sin JSON */ }
    return { estado: r.status, statusText: r.statusText, url: r.url, datos };
  }, { metodo, ruta, cuerpo });
}

// Formatea un objeto de respuesta como lo imprime la consola del navegador.
function fmtRespuesta(body) {
  if (body == null) return 'null';
  if (Array.isArray(body)) return `Array(${body.length})`;
  if (typeof body === 'object') {
    const partes = Object.entries(body).slice(0, 3).map(([k, v]) =>
      `${k}: ${typeof v === 'string' ? `'${v}'` : JSON.stringify(v)}`);
    return `{${partes.join(', ')}}`;
  }
  return String(body);
}

// Dibuja sobre la página una consola de F12 (columna izquierda) dejando ver la
// aplicación a la derecha. Cada entrada muestra el comando pegado y, según el
// caso, la línea de la petición con su código y el objeto que imprime, o la
// salida de console.log en una inspección.
async function dibujarConsola(p, { entradas, rotulo, host }) {
  const preparadas = entradas.map(e => {
    const t = e.salidaLog ? '' : fmtRespuesta(e.body);
    return {
      comando: e.comando,
      metodo: e.metodo || '',
      url: e.url || '',
      status: e.status == null ? null : e.status,
      statusText: e.statusText || '',
      cuerpo: t.startsWith('{') && t.endsWith('}') ? t.slice(1, -1).trim() : t,
      salidaLog: e.salidaLog || null
    };
  });
  await p.evaluate(({ entradas, rotulo, host }) => {
    document.getElementById('__consolaE2')?.remove();
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const colorComando = (c) => esc(c)
      .replace(/(")(.*?)(")/g, '<span style="color:#f28b82">$1$2$3</span>')
      .replace(/\b(fetch|method|headers|body|then|const|console)\b/g, '<span style="color:#8ab4f8">$1</span>');
    const colorCuerpo = (c) => esc(c)
      .replace(/([a-zA-Z_]+):/g, '<span style="color:#c58af9">$1</span>:')
      .replace(/('[^']*')/g, '<span style="color:#f28b82">$1</span>');

    const bloques = entradas.map((e) => {
      let resultado;
      if (e.salidaLog) {
        resultado = `<div style="margin-left:14px;margin-top:4px;color:#e8eaed;white-space:pre-wrap">${esc(e.salidaLog)
          .replace(/(opacidad: )([\d.]+)/, '$1<b style="color:#f28b82">$2</b>')}</div>
          <div style="color:#9aa0a6;margin-left:14px">&lt; undefined</div>`;
      } else {
        const error = e.status >= 400;
        const linea = error
          ? `<div style="background:#3a2323;color:#f28b82;padding:4px 12px;margin:2px -12px;border-top:1px solid #4a2c2c;border-bottom:1px solid #4a2c2c">
              ⊘ <span style="text-decoration:underline">${esc(e.metodo)} ${esc(e.url)}</span> <b>${e.status} (${esc(e.statusText)})</b></div>`
          : `<div style="color:#9aa0a6;padding:4px 0">${esc(e.metodo)} ${esc(e.url)} <b style="color:#e8eaed">${e.status}</b></div>`;
        const marca = error ? '<span style="color:#f28b82;font-weight:700">⊘</span>' : '<span style="color:#81c995">›</span>';
        resultado = `<div style="color:#9aa0a6;margin-left:14px">&lt; Promise {&lt;pending&gt;}</div>${linea}
          <div style="margin-left:14px;margin-top:4px">${marca} ▶ { ${colorCuerpo(e.cuerpo)} }</div>`;
      }
      return `<div style="color:#8ab4f8;margin-top:6px">&gt;</div>
        <pre style="margin:0 0 4px 14px;white-space:pre-wrap;color:#e8eaed;font:inherit">${colorComando(e.comando)}</pre>${resultado}`;
    }).join('');

    const ahora = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date());

    const panel = document.createElement('div');
    panel.id = '__consolaE2';
    panel.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;display:flex;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace');
    panel.innerHTML =
      `<div style="width:63%;height:100%;background:#1e1e1f;color:#e8eaed;overflow:hidden;border-right:2px solid #3c4043;display:flex;flex-direction:column">
         <div style="background:#292a2d;color:#9aa0a6;font-size:12px;padding:7px 12px;border-bottom:1px solid #3c4043">
           <span style="color:#e8eaed;font-weight:600;border-bottom:2px solid #8ab4f8;padding-bottom:5px">Console</span>
           &nbsp; Elements &nbsp; Network &nbsp; Sources <span style="float:right">${esc(host)}</span></div>
         <div style="padding:4px 12px 10px;font-size:13px;line-height:1.55;overflow:hidden;flex:1">${bloques}
           <div style="color:#8ab4f8;margin-top:8px">&gt;</div></div>
       </div>
       <div style="flex:1;position:relative">
         <div style="position:absolute;bottom:10px;left:10px;right:10px;background:rgba(17,24,39,.92);color:#f9fafb;
           font-size:11px;line-height:1.4;padding:6px 9px;border-radius:6px;white-space:pre-wrap">${esc(rotulo).replace('{AHORA}', ahora)}</div>
       </div>`;
    document.documentElement.appendChild(panel);
  }, { entradas: preparadas, rotulo, host });
}

// Lee el texto de un mensaje de error de campo.
async function textoError(p, id) {
  return (await p.locator('#' + id).textContent().catch(() => '') || '').trim();
}

// Mide si el mensaje emergente se ve: texto, clases y opacidad calculada.
async function estadoTostada(p) {
  return p.evaluate(() => {
    const t = document.getElementById('tostada');
    if (!t) return { existe: false };
    const estilo = getComputedStyle(t);
    return { existe: true, texto: t.textContent, clases: t.className, opacidad: parseFloat(estilo.opacity) };
  });
}

// Programa una tutoría desde el formulario del estudiante.
async function programarTutoria(p, d) {
  await ir(p, 'programar-tutoria');
  await p.waitForFunction(() => document.querySelectorAll('#tutTutor option').length > 1);
  await p.waitForFunction(() => document.querySelectorAll('#tutAsignatura option').length > 1);
  const valorTutor = await p.evaluate((nombre) => {
    const op = [...document.querySelectorAll('#tutTutor option')].find(o => o.textContent.startsWith(nombre));
    return op ? op.value : '';
  }, d.tutor);
  if (!valorTutor) throw new Error('No aparece el tutor ' + d.tutor);
  await p.selectOption('#tutTutor', valorTutor);
  if (d.asignatura) await p.selectOption('#tutAsignatura', d.asignatura);
  else await p.evaluate(() => {
    const s = document.getElementById('tutAsignatura');
    s.value = [...s.options].find(o => o.value).value;
  });
  await p.selectOption('#tutModalidad', d.modalidad || 'Virtual');
  await p.fill('#tutFecha', d.fecha);
  await p.fill('#tutHora', d.hora);
  if (d.observaciones) await p.fill('#tutObservaciones', d.observaciones);
  const asignatura = await p.inputValue('#tutAsignatura');
  const respuesta = p.waitForResponse(r => r.url().endsWith('/api/tutorias') && r.request().method() === 'POST', { timeout: 4000 }).catch(() => null);
  await p.click('#formularioTutoria button[type="submit"]');
  const r = await respuesta;
  await p.waitForTimeout(900);
  let cuerpo = null;
  if (r) { try { cuerpo = await r.json(); } catch { /* sin JSON */ } }
  return { estado: r ? r.status() : null, cuerpo, asignatura };
}

// Asegura que la carpeta de salida exista.
function prepararSalida(dir) {
  fs.mkdirSync(path.join(dir, 'evidencias'), { recursive: true });
}

module.exports = {
  ZONA, Caso, esperar, fechaColombia, horaColombia, instanteColombia, marcaColombia,
  lineaRed, abrirAplicacion, iniciarSesion, llenarRegistro, cerrarSesion, ir, consola,
  textoError, estadoTostada, programarTutoria, prepararSalida, dibujarConsola, fmtRespuesta
};
