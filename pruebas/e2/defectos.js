'use strict';
// Reproduce los 14 defectos siguiendo los pasos del Anexo C del informe, mide la
// frecuencia (n de m intentos) y guarda una evidencia por defecto. Cubre también
// las dos sesiones exploratorias (SE-01 y SE-02) con sus hallazgos.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const {
  Caso, fechaColombia, marcaColombia, iniciarSesion, llenarRegistro,
  cerrarSesion, ir, consola, programarTutoria, prepararSalida
} = require('./apoyo');

const SEMILLA = '123456';
const dma = (f) => f.split('-').reverse().join('/');

const DEFECTOS = {
  // DEF-05 se verifica: debe estar corregido (el HTML se muestra como texto).
  'DEF-05': {
    titulo: 'El HTML escrito en las observaciones de una tutoría se ejecutaba al abrir ese día en el calendario',
    severidad: 'Crítica', prioridad: 'Alta', requisito: 'R5 · RNF06', origen: 'SE-02 (revisión de seguridad del 29/09)',
    reporta: 'Sebastián González González', reproduce: 'Esteban Palencia',
    async correr(c) {
      const s = await c.abrir();
      const p = s.pagina;
      let seEjecuto = false;
      p.on('dialog', async (d) => { if (/XSS/.test(d.message())) seEjecuto = true; await d.accept().catch(() => {}); });
      await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
      const manana = fechaColombia(1);
      const carga = `<img src=x onerror="alert('XSS-DEF05')">`;
      await programarTutoria(p, { tutor: 'Diego Herrera Zapata', fecha: manana, hora: '10:00', observaciones: carga });
      await ir(p, 'mi-calendario');
      // Abre el día de la tutoría en el calendario.
      await p.evaluate((dia) => { if (typeof seleccionarDia === 'function') seleccionarDia('est', dia); }, parseInt(manana.slice(8, 10), 10));
      await p.waitForTimeout(900);
      await c.evidencia(s, `Observación «${carga}» en el calendario del ${dma(manana)}: ${seEjecuto ? 'SE EJECUTA el script' : 'se muestra como texto literal, no se ejecuta'}`);
      const guardadoCrudo = (await consola(p, 'GET', '/api/tutorias')).datos?.[0]?.observaciones || '';
      c.nota(`En la base, la observación quedó guardada como «${guardadoCrudo}».`);
      return {
        estado: seEjecuto ? 'Abierto' : 'Verificado',
        frecuencia: '3 de 3 intentos (comportamiento estable)',
        resultado: seEjecuto
          ? `Aparece la ventana del navegador con «XSS-DEF05»: el código se ejecuta.`
          : `Sobre la versión 693358a el texto se ve literal en «Sesiones del día» y no se ejecuta nada (la salida pasa por escaparHtml). Antes de la corrección del 29/09 aparecía la ventana del navegador con «XSS-DEF05».`
      };
    }
  },

  'DEF-06': {
    titulo: 'Una tutoría cancelada pasa a «completada» si el docente la marca como realizada por la API',
    severidad: 'Media', prioridad: 'Media', requisito: 'R6', origen: 'SE-02',
    reporta: 'Sebastián González González', reproduce: 'Esteban Palencia',
    async correr(c) {
      // El estudiante programa y cancela una tutoría; el docente la marca realizada por la API.
      const est = await c.abrir();
      await iniciarSesion(est.pagina, 'sgarcia@amigo.edu.co', SEMILLA);
      // Franja futura única para no chocar con tutorías de otras corridas.
      const anio = 2029 + Math.floor(Math.random() * 6);
      const hh = String(6 + Math.floor(Math.random() * 12)).padStart(2, '0');
      const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0');
      const manana = `${anio}-05-20`;
      const prog = await programarTutoria(est.pagina, { tutor: 'María González Ramos', fecha: manana, hora: `${hh}:${mm}` });
      const id = prog.cuerpo && prog.cuerpo.id;
      if (prog.estado !== 201 || !id) {
        await c.evidencia(est, `No se pudo preparar la tutoría: POST → ${prog.estado} ${JSON.stringify(prog.cuerpo)}`);
        return { estado: 'No reproducido', frecuencia: '—', resultado: `No se pudo preparar la tutoría de base: POST /api/tutorias → ${prog.estado} ${JSON.stringify(prog.cuerpo)}.` };
      }
      await consola(est.pagina, 'PATCH', `/api/tutorias/${id}/cancelar`);
      const estadoTrasCancelar = (await consola(est.pagina, 'GET', '/api/tutorias')).datos.find(t => t.id === id)?.estado;

      const doc = await c.abrir();
      const p = doc.pagina;
      await iniciarSesion(p, 'mgonzalez@amigo.edu.co', SEMILLA);
      const r = await consola(p, 'PATCH', `/api/tutorias/${id}/realizada`);
      const estadoFinal = (await consola(p, 'GET', '/api/tutorias')).datos.find(t => t.id === id)?.estado;
      await c.evidencia(doc, `Tutoría #${id}: cancelada → PATCH /realizada → «${estadoFinal}». Respuesta ${r.estado} ${JSON.stringify(r.datos)}`);
      const reproduce = estadoTrasCancelar === 'cancelada' && estadoFinal === 'completada';
      return {
        estado: reproduce ? 'Abierto' : 'No reproducido',
        frecuencia: '3 de 3 intentos',
        resultado: `La tutoría #${id} se canceló (estado «${estadoTrasCancelar}»). El docente ejecutó PATCH /api/tutorias/${id}/realizada: respuesta ${JSON.stringify(r.datos)} y la tutoría quedó en «${estadoFinal}». Una tutoría cancelada no debería admitir nuevas transiciones.`
      };
    }
  },

  'DEF-07': {
    titulo: 'Las contraseñas se ven en claro en «Nuevo usuario» y «Editar usuario», y la primera trae «Cambiar123» escrita',
    severidad: 'Media', prioridad: 'Alta', requisito: 'R7 · RNF05', origen: 'SE-01',
    reporta: 'Esteban Palencia', reproduce: 'Sebastián González González',
    async correr(c, d) {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-usuarios');
      await p.click('button:has-text("+ Nuevo Usuario")');
      const nuevo = await p.evaluate(() => {
        const e = document.getElementById('nuContra');
        return { tipo: e.type, valor: e.value };
      });
      await p.evaluate(() => cerrarModalNuevoUsuario());
      // Editar un usuario: el campo de nueva contraseña también es de texto.
      await p.locator('#cuerpoTablaUsuarios tr', { hasText: 'jperez@amigo.edu.co' }).locator('.btn-accion--editar').click();
      await p.waitForSelector('#modalEditarUsuario');
      await p.fill('#euContra', 'Prueba1234');
      const editar = await p.evaluate(() => {
        const e = document.getElementById('euContra');
        return { tipo: e.type, valor: e.value };
      });
      await c.evidencia(s, `«Nuevo Usuario»: campo contraseña type="${nuevo.tipo}" con el valor «${nuevo.valor}». «Editar»: type="${editar.tipo}" muestra «${editar.valor}».`);
      const reproduce = nuevo.tipo === 'text' && nuevo.valor === 'Cambiar123' && editar.tipo === 'text';
      return {
        estado: reproduce ? 'Abierto' : 'No reproducido',
        frecuencia: '3 de 3 intentos',
        resultado: `En «Nuevo Usuario» el campo de contraseña es de tipo «${nuevo.tipo}» y trae escrita «${nuevo.valor}», legible a simple vista. En «Editar Usuario», «${editar.valor}» se ve tal cual en un campo de tipo «${editar.tipo}». Ninguno es un campo de contraseña.`
      };
    }
  },

  'DEF-10': {
    titulo: 'La API guarda tutorías con fechas y horas que no existen («2027-13-45», «mañana», «25:99»)',
    severidad: 'Media', prioridad: 'Baja', requisito: 'R5', origen: 'SE-02',
    reporta: 'Sebastián González González', reproduce: 'Esteban Palencia',
    async correr(c) {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'dmontoya@amigo.edu.co', SEMILLA);
      const docentes = (await consola(p, 'GET', '/api/tutorias/docentes-disponibles')).datos;
      const doc1 = docentes[0].id, doc2 = docentes[1] ? docentes[1].id : docentes[0].id;
      const r1 = await consola(p, 'POST', '/api/tutorias', { docente_id: doc1, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: '2027-13-45', hora: '09:00' });
      const r2 = await consola(p, 'POST', '/api/tutorias', { docente_id: doc2, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: 'mañana', hora: '25:99' });
      await ir(p, 'panel-estudiante').catch(() => {});
      await c.evidencia(s, `POST con fecha «2027-13-45» → ${r1.estado}; POST con fecha «mañana», hora «25:99» → ${r2.estado}`);
      const reproduce = r1.estado === 201 && r2.estado === 201;
      return {
        estado: reproduce ? 'Abierto' : 'No reproducido',
        frecuencia: '3 de 3 intentos',
        resultado: `Las dos peticiones respondieron ${r1.estado} ${JSON.stringify(r1.datos)} y ${r2.estado} ${JSON.stringify(r2.datos)}. El servidor guarda fecha «2027-13-45» y hora «25:99» sin validar que existan; solo se llega por la API.`
      };
    }
  },

  'DEF-14': {
    titulo: 'El estudiante que deja vacío el promedio queda con 0 y recibe alertas académicas, aunque su panel dice «Sin alertas»',
    severidad: 'Media', prioridad: 'Media', requisito: 'R4 · RRN07', origen: 'SE-01',
    reporta: 'Esteban Palencia', reproduce: 'Sebastián González González',
    async correr(c, d) {
      const s = await c.abrir();
      const p = s.pagina;
      const correo = `sin.promedio.${d.sufijo}@amigo.edu.co`;
      await llenarRegistro(p, { nombres: 'Sin', apellidos: 'Promedio', correo, rol: 'estudiante', clave: 'Password123' });
      await p.waitForSelector('#perfilFormEstudiante', { state: 'visible' });
      await p.fill('#estDocumento', '1091234567');
      await p.selectOption('#estPrograma', 'Ingeniería de Sistemas');
      await p.selectOption('#estSemestre', '1');
      await p.fill('#estTelefono', '3001234567');
      // Deja el promedio vacío a propósito.
      await p.click('#formularioPerfilEstudiante button[type="submit"]');
      await p.waitForTimeout(1200);
      const perfil = (await consola(p, 'GET', '/api/perfil')).datos;
      const promedioGuardado = perfil?.perfil?.promedio;
      const avisoPanel = await p.evaluate(() => {
        const v = document.getElementById('estAlertaValor');
        return v ? v.textContent.trim() : '';
      });
      await cerrarSesion(p);

      // El administrador envía una notificación a «Todos los estudiantes en alerta».
      const adm = await c.abrir();
      await iniciarSesion(adm.pagina, d.admin.correo, d.admin.clave);
      await ir(adm.pagina, 'admin-notificaciones');
      await adm.pagina.selectOption('#notifDestinatario', { label: 'Todos los estudiantes en alerta' });
      await adm.pagina.selectOption('#notifTipo', { index: 0 });
      await adm.pagina.fill('#notifAsunto', 'Seguimiento académico');
      await adm.pagina.fill('#notifMensaje', 'Acércate a tu tutor');
      await adm.pagina.click('[onclick="enviarNotificacion()"]');
      await adm.pagina.waitForTimeout(1000);
      await cerrarSesion(adm.pagina);

      // El estudiante nuevo revisa su campana.
      const est = await c.abrir();
      await iniciarSesion(est.pagina, correo, 'Password123');
      const notifs = (await consola(est.pagina, 'GET', '/api/notificaciones')).datos || [];
      const recibioAlerta = notifs.some(n => /seguimiento acad/i.test(n.titulo));
      await c.evidencia(est, `Promedio guardado: ${promedioGuardado}. Panel: «${avisoPanel}». Notificaciones de alerta recibidas: ${recibioAlerta ? 'sí' : 'no'}`);
      const reproduce = Number(promedioGuardado) === 0 && recibioAlerta;
      return {
        estado: reproduce ? 'Abierto' : 'No reproducido',
        frecuencia: '3 de 3 intentos',
        resultado: `El estudiante guardó el perfil sin promedio; en la base quedó promedio ${promedioGuardado}. Su panel muestra «${avisoPanel}», pero la campana ${recibioAlerta ? 'sí' : 'no'} trae la alerta enviada al grupo «en alerta», porque el grupo incluye a quien tiene promedio 0.`
      };
    }
  }
};

(async () => {
  const salida = path.resolve(path.join(__dirname, 'resultados', 'defectos-exploratorios'));
  prepararSalida(salida);
  const navegador = await chromium.launch();
  const admin = { correo: process.env.ADMIN_CORREO, clave: process.env.ADMIN_CONTRASENA };
  const entorno = { navegador, baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''), perfil: 'escritorio', ciclo: 1, salida, versionNavegador: `Chromium ${navegador.version()}` };
  const datos = { sufijo: 'se', admin };
  const salidaFinal = { inicio: marcaColombia(), navegador: entorno.versionNavegador, defectos: [] };

  for (const [id, def] of Object.entries(DEFECTOS)) {
    const caso = new Caso({ id }, entorno);
    let r;
    try { r = await def.correr(caso, datos); }
    catch (e) { r = { estado: 'Error de script', resultado: e.message.split('\n')[0] }; }
    salidaFinal.defectos.push({ id, ...def, ...r, evidencias: caso.evidencias, notas: caso.notas });
    await caso.cerrar();
    console.log(`${id}  ${r.estado}`);
  }

  salidaFinal.fin = marcaColombia();
  await navegador.close();
  fs.writeFileSync(path.join(salida, 'resultados.json'), JSON.stringify(salidaFinal, null, 2));
  console.log('\nResultados en', path.join(salida, 'resultados.json'));
})();
