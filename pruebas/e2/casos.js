'use strict';
// Suite del Entregable 2: los 34 casos con los datos y pasos de la guía de ejecución.
// Cada caso decide su estado comparando lo observado con lo que exige el requisito,
// no con lo que se sabía que iba a pasar.
const {
  fechaColombia, instanteColombia, lineaRed, abrirAplicacion, iniciarSesion,
  llenarRegistro, cerrarSesion, ir, consola, textoError, estadoTostada, programarTutoria
} = require('./apoyo');

const SEMILLA = '123456';
const APROBADO = 'Aprobado';
const FALLIDO = 'Fallido';
const BLOQUEADO = 'Bloqueado';

// Comandos que se pegan en la consola (F12), tal cual los trae la guía de ejecución.
const COMANDOS = {
  CP008: (correo) =>
`fetch("/api/auth/registro",{method:"POST",headers:{
  "Content-Type":"application/json"},
  body:JSON.stringify({nombres:"Intruso",apellidos:"Prueba",
  correo:"${correo}",contrasena:"Password123",
  rol:"admin"})}).then(r=>r.json()).then(console.log)`,
  CP018:
`fetch("/api/perfil/docente",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({cedula:"12345",facultad:"Ingenierías"})})
  .then(r=>r.json()).then(console.log)`,
  CP021:
`fetch("/api/tutorias",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({docente_id:999999,
  asignatura:"Cálculo Diferencial",modalidad:"Virtual",
  fecha:"2027-02-15",hora:"10:00"})}).then(r=>r.json()).then(console.log)`
};

// Formatea AAAA-MM-DD como DD/MM/AAAA, que es como lo muestra la aplicación.
const dma = (f) => f.split('-').reverse().join('/');

// Indica si una sección está activa.
const activa = async (p, pagina) => (await p.locator(`#pagina-${pagina}.activa`).count()) > 0;

// Busca la última respuesta de la API que coincide con el método y la ruta.
const ultima = (s, metodo, ruta) => [...s.red].reverse().find(r => r.metodo === metodo && r.ruta.startsWith(ruta));

// Lee el mensaje emergente después de la animación de entrada.
async function tostadaTrasAccion(p) {
  await p.waitForTimeout(500);
  return estadoTostada(p);
}

const describirTostada = (t) => t.existe
  ? `el elemento #tostada tiene el texto «${t.texto}» y las clases «${t.clases}», con opacidad calculada ${t.opacidad}`
  : 'no existe el elemento #tostada';

const tostadaVisible = (t, contiene) => t.existe && t.opacidad >= 0.9 && (!contiene || t.texto.includes(contiene));

// Registro de contraseña inválida: comparte la lógica de CP-001, CP-003 y CP-004.
function casoContrasenaInvalida(local, clave, regla) {
  return async (c, d) => {
    const s = await c.abrir();
    const p = s.pagina;
    await llenarRegistro(p, { nombres: 'Ana', apellidos: 'Pérez', correo: `${local}.${d.sufijo}@amigo.edu.co`, rol: 'estudiante', clave });
    const error = await textoError(p, 'errorRegContrasena');
    const envios = s.red.filter(r => r.ruta.startsWith('/api/auth/registro'));
    const sigue = await activa(p, 'crear-cuenta');
    await c.evidencia(s, `Contraseña «${clave}»: mensaje bajo la contraseña «${error || '(vacío)'}»`, [], '#regContrasena');
    const ok = regla.test(error) && envios.length === 0 && sigue;
    return {
      estado: ok ? APROBADO : FALLIDO,
      real: `Bajo la contraseña aparece «${error || '(nada)'}»; ${envios.length ? `se envió POST /api/auth/registro (${envios[0].estado})` : 'no se envía nada al servidor'} y ${sigue ? 'la página sigue en «Crear Cuenta»' : 'la página cambió'}.`
    };
  };
}

// Registro válido que debe llevar a «Completar perfil»: CP-002, CP-006 y CP-007.
function casoRegistroValido(datos, rolPerfil) {
  return async (c, d) => {
    const s = await c.abrir();
    const p = s.pagina;
    const correo = `${datos.local}.${d.sufijo}@amigo.edu.co`;
    await llenarRegistro(p, { ...datos, correo });
    const reg = ultima(s, 'POST', '/api/auth/registro');
    const enPerfil = await activa(p, 'completar-perfil');
    const formulario = await p.locator(rolPerfil === 'docente' ? '#perfilFormDocente' : '#perfilFormEstudiante').isVisible().catch(() => false);
    const token = await p.evaluate(() => Boolean(localStorage.getItem('cp.token')));
    await c.evidencia(s, `Registro de ${correo} (${datos.rol}, clave «${datos.clave}»)`, reg ? [lineaRed(reg)] : []);
    await cerrarSesion(p);
    const ok = reg && reg.estado === 201 && enPerfil && formulario && token;
    return {
      estado: ok ? APROBADO : FALLIDO,
      real: `POST /api/auth/registro → ${reg ? reg.estado : 'sin respuesta'}; ${enPerfil ? `pasa a «Completar perfil» con el formulario de ${rolPerfil}` : 'no pasa a «Completar perfil»'}${token ? ' y la sesión queda abierta (hay token)' : ''}. Se cerró sesión al terminar.`
    };
  };
}

const CASOS = [
  {
    id: 'CP-001', titulo: 'Rechazo de contraseña con menos de 8 caracteres',
    requisito: 'R1', riesgo: 'R-04', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'El formulario no envía nada y muestra un mensaje que nombra la regla de los 8 caracteres (RF005).',
    ejecutar: casoContrasenaInvalida('ana', 'abc1234', /8/)
  },
  {
    id: 'CP-002', titulo: 'Aceptación de contraseña de exactamente 8 caracteres',
    requisito: 'R1', riesgo: 'R-04', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Crea la cuenta (HTTP 201) y pasa a «Completar perfil» del estudiante.',
    ejecutar: casoRegistroValido({ local: 'ana8', nombres: 'Ana', apellidos: 'Pérez', rol: 'estudiante', clave: 'abcd1234' }, 'estudiante')
  },
  {
    id: 'CP-003', titulo: 'Rechazo de contraseña sin números',
    requisito: 'R1', riesgo: 'R-04', tecnica: 'Particiones de equivalencia', prioridad: 'Media', responsable: 'Esteban Palencia',
    esperado: 'El formulario no envía nada y muestra «Debe incluir al menos un número».',
    ejecutar: casoContrasenaInvalida('ana3', 'contraseña', /número/)
  },
  {
    id: 'CP-004', titulo: 'Rechazo de contraseña sin letras',
    requisito: 'R1', riesgo: 'R-04', tecnica: 'Particiones de equivalencia', prioridad: 'Media', responsable: 'Esteban Palencia',
    esperado: 'El formulario no envía nada y muestra «Debe incluir al menos una letra».',
    ejecutar: casoContrasenaInvalida('ana4', '12345678', /letra/)
  },
  {
    id: 'CP-005', titulo: 'Rechazo de correo fuera del dominio institucional',
    requisito: 'R1', riesgo: 'R-06', tecnica: 'Particiones de equivalencia', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Rechaza el registro con el mensaje «Solo correos @amigo.edu.co».',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      await llenarRegistro(p, { nombres: 'Ana', apellidos: 'Pérez', correo: 'persona@gmail.com', rol: 'estudiante', clave: 'Password123' });
      const error = await textoError(p, 'errorRegCorreo');
      const envios = s.red.filter(r => r.ruta.startsWith('/api/auth/registro'));
      await c.evidencia(s, `Correo persona@gmail.com: mensaje bajo el correo «${error}»`, [], '#regCorreo');
      const ok = error.includes('Solo correos @amigo.edu.co') && envios.length === 0;
      return { estado: ok ? APROBADO : FALLIDO, real: `Bajo el correo aparece «${error}» y no se envía la petición de registro.` };
    }
  },
  {
    id: 'CP-006', titulo: 'Aceptación de correo del dominio institucional',
    requisito: 'R1', riesgo: 'R-06', tecnica: 'Particiones de equivalencia', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Crea la cuenta (HTTP 201), devuelve token y pasa a «Completar perfil» del docente.',
    ejecutar: casoRegistroValido({ local: 'docente', nombres: 'Laura', apellidos: 'Mejía', rol: 'docente', clave: 'Password123' }, 'docente')
  },
  {
    id: 'CP-007', titulo: 'Registro válido con todas las condiciones satisfechas',
    requisito: 'R1', riesgo: 'R-01', tecnica: 'Tabla de decisión', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Crea la cuenta (HTTP 201) y continúa al formulario de perfil.',
    ejecutar: casoRegistroValido({ local: 'valido', nombres: 'Mateo', apellidos: 'Rúa', rol: 'estudiante', clave: 'Password123' }, 'estudiante')
  },
  {
    id: 'CP-008', titulo: 'Rechazo de registro con rol de administrador',
    requisito: 'R1', riesgo: 'R-01', tecnica: 'Tabla de decisión', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'HTTP 400 con «Rol inválido»; no se crea la cuenta de administrador.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await abrirAplicacion(p);
      const correo = `admin.${d.sufijo}@amigo.edu.co`;
      const r = await consola(p, 'POST', '/api/auth/registro', { nombres: 'Intruso', apellidos: 'Prueba', correo, contrasena: 'Password123', rol: 'admin' });
      await c.evidenciaConsola(s, [{
        comando: COMANDOS.CP008(correo), metodo: 'POST', url: r.url,
        status: r.estado, statusText: r.statusText, body: r.datos
      }], 'Registro forzado con rol «admin» desde la consola, sin sesión');
      const ok = r.estado === 400 && r.datos && r.datos.error === 'Rol inválido';
      return { estado: ok ? APROBADO : FALLIDO, real: `La consola muestra ${JSON.stringify(r.datos)} y la pestaña Red el código ${r.estado}.` };
    }
  },
  {
    id: 'CP-009', titulo: 'Rechazo de registro con correo ya existente',
    requisito: 'R1', riesgo: 'R-09', tecnica: 'Tabla de decisión', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'HTTP 409 y el mensaje «Ya existe una cuenta con ese correo»; no se crea un duplicado.',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      await llenarRegistro(p, { nombres: 'Sebastián', apellidos: 'García', correo: 'sgarcia@amigo.edu.co', rol: 'estudiante', clave: 'Password123' });
      const error = await textoError(p, 'errorRegCorreo');
      const reg = ultima(s, 'POST', '/api/auth/registro');
      await c.evidencia(s, `Correo sgarcia@amigo.edu.co (ya existe): «${error}»`, reg ? [lineaRed(reg)] : [], '#regCorreo');
      const ok = reg && reg.estado === 409 && error.includes('Ya existe una cuenta con ese correo');
      return { estado: ok ? APROBADO : FALLIDO, real: `POST /api/auth/registro → ${reg ? reg.estado : '—'}; bajo el correo aparece «${error}».` };
    }
  },
  {
    id: 'CP-010', titulo: 'Inicio de sesión con credenciales correctas',
    requisito: 'R2', riesgo: 'R-05', tecnica: 'Particiones de equivalencia', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Autentica (HTTP 200), entrega token y muestra el panel del estudiante.',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      const estado = await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
      const enPanel = await activa(p, 'panel-estudiante');
      const saludo = (await p.locator('#estudianteSaludo').textContent().catch(() => '')).trim();
      await c.evidencia(s, `Login sgarcia@amigo.edu.co / 123456 → ${estado}`);
      const ok = estado === 200 && enPanel;
      return { estado: ok ? APROBADO : FALLIDO, real: `POST /api/auth/login → ${estado}; ${enPanel ? `entra a «Mi Panel» del estudiante con el saludo «Hola, ${saludo}»` : 'no entra al panel'}.` };
    }
  },
  {
    id: 'CP-011', titulo: 'Inicio de sesión con contraseña incorrecta',
    requisito: 'R2', riesgo: 'R-05 · R-10', tecnica: 'Particiones de equivalencia', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'HTTP 401 con el mensaje genérico «Correo o contraseña incorrectos».',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      const estado = await iniciarSesion(p, 'sgarcia@amigo.edu.co', 'claveErronea9');
      const error = await textoError(p, 'errorLoginCorreo');
      await c.evidencia(s, `Login con clave incorrecta → ${estado}: «${error}»`);
      const ok = estado === 401 && error === 'Correo o contraseña incorrectos';
      return { estado: ok ? APROBADO : FALLIDO, real: `POST /api/auth/login → ${estado}; bajo el correo aparece «${error}», sin decir si el correo existe.` };
    }
  },
  {
    id: 'CP-012', titulo: 'Un intento fallido no bloquea la cuenta',
    requisito: 'R2', riesgo: 'R-05', tecnica: 'Transición de estados', prioridad: 'Media', responsable: 'Esteban Palencia',
    esperado: 'HTTP 401 (no 429) y ningún aviso de bloqueo.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      const correo = `prueba.bloqueo.${d.sufijo}@amigo.edu.co`;
      await llenarRegistro(p, { nombres: 'Prueba', apellidos: 'Bloqueo', correo, rol: 'estudiante', clave: 'Bloqueo123' });
      await cerrarSesion(p);
      const estado = await iniciarSesion(p, correo, 'Incorrecta123');
      const error = await textoError(p, 'errorLoginCorreo');
      const aviso = await p.locator('#avisoBloqueo').isVisible();
      await c.evidencia(s, `Un intento fallido con ${correo} → ${estado}`);
      const ok = estado === 401 && !aviso && error.includes('incorrectos');
      return { estado: ok ? APROBADO : FALLIDO, real: `Preparación: se creó ${correo} y se cerró sesión. El intento con «Incorrecta123» respondió ${estado} con «${error}»; ${aviso ? 'aparece' : 'no aparece'} el aviso de bloqueo.` };
    }
  },
  {
    id: 'CP-013', titulo: 'Bloqueo después del tercer intento fallido',
    requisito: 'R2 · RRN01', riesgo: 'R-05', tecnica: 'Transición de estados', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'RRN01: tras 3 intentos incorrectos el acceso se bloquea 5 minutos; el cuarto intento se rechaza aunque la clave sea correcta.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      const correo = `prueba.bloqueo2.${d.sufijo}@amigo.edu.co`;
      await llenarRegistro(p, { nombres: 'Prueba', apellidos: 'Bloqueo', correo, rol: 'estudiante', clave: 'Bloqueo123' });
      await cerrarSesion(p);
      const estados = [];
      for (let i = 0; i < 3; i++) estados.push(await iniciarSesion(p, correo, 'Incorrecta123'));
      await c.evidencia(s, `Tercer intento fallido con ${correo}: ${estados.join(', ')}`);
      const cuarto = await iniciarSesion(p, correo, 'Bloqueo123');
      const enPanel = await activa(p, 'panel-estudiante');
      const aviso = await p.locator('#avisoBloqueo').isVisible();
      await c.evidencia(s, `Cuarto intento con la clave correcta → ${cuarto}${enPanel ? ' · entra al panel' : ''}`);
      const ok = !enPanel && (cuarto === 429 || aviso);
      return {
        estado: ok ? APROBADO : FALLIDO,
        defecto: ok ? null : 'DEF-04',
        real: `Los tres intentos con «Incorrecta123» respondieron ${estados.join(', ')}. El cuarto, con la clave correcta, respondió ${cuarto}${enPanel ? ' y abrió «Mi Panel»: no hubo bloqueo' : aviso ? ' y apareció el aviso de bloqueo' : ''}.`
      };
    }
  },
  {
    id: 'CP-014', titulo: 'Ingreso con Google usando cuenta institucional verificada',
    requisito: 'R3', riesgo: 'R-06', tecnica: 'Pruebas por pares', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'Crea o vincula la cuenta y abre sesión con rol estudiante.',
    ejecutar: casoGoogle('institucional')
  },
  {
    id: 'CP-015', titulo: 'Rechazo de Google con cuenta fuera del dominio',
    requisito: 'R3', riesgo: 'R-06', tecnica: 'Pruebas por pares', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'No abre sesión y vuelve al inicio con el error de dominio.',
    ejecutar: casoGoogle('externa')
  },
  {
    id: 'CP-016', titulo: 'Guardar perfil de estudiante con datos válidos',
    requisito: 'R4', riesgo: 'R-07', tecnica: 'Particiones de equivalencia', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'Guarda el perfil y muestra en pantalla «Perfil guardado».',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      const correo = `perfil.${d.sufijo}@amigo.edu.co`;
      await llenarRegistro(p, { nombres: 'Valeria', apellidos: 'Zapata', correo, rol: 'estudiante', clave: 'Password123' });
      await p.waitForSelector('#perfilFormEstudiante', { state: 'visible' });
      await p.fill('#estDocumento', '1098765432');
      await p.selectOption('#estPrograma', 'Ingeniería de Sistemas');
      await p.selectOption('#estSemestre', '5');
      await p.fill('#estTelefono', '3001234567');
      const resp = p.waitForResponse(r => r.url().includes('/api/perfil/estudiante'));
      await p.click('#formularioPerfilEstudiante button[type="submit"]');
      const r = await resp;
      const t = await tostadaTrasAccion(p);
      const enPanel = await activa(p, 'panel-estudiante');
      await c.evidencia(s, `Perfil guardado → ${r.status()}. ${describirTostada(t)}`, [lineaRed(ultima(s, 'POST', '/api/perfil/estudiante'))]);
      const ok = r.status() === 200 && tostadaVisible(t, 'Perfil guardado');
      return {
        estado: ok ? APROBADO : FALLIDO,
        defecto: ok ? null : 'DEF-13',
        real: `POST /api/perfil/estudiante → ${r.status()}; ${enPanel ? 'pasa a «Mi Panel»' : 'no cambia de página'}. ${ok ? 'El mensaje se ve' : 'En pantalla no se ve ningún mensaje'}: ${describirTostada(t)}.`
      };
    }
  },
  {
    id: 'CP-017', titulo: 'Rechazo de foto de perfil mayor a 2 MB',
    requisito: 'R4 · RF036', riesgo: 'R-03', tecnica: 'Análisis de valores límite', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'Rechaza la imagen e informa que el tamaño máximo permitido es 2 MB.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.cuentaFoto, SEMILLA);
      await ir(p, 'mi-perfil');
      const espera = p.waitForResponse(r => r.url().includes('/api/perfil/foto'), { timeout: 8000 }).catch(() => null);
      await p.setInputFiles('#perfilFotoInput', d.foto.ruta);
      const r = await espera;
      await p.waitForTimeout(600);
      const t = await estadoTostada(p);
      const visibleFoto = await p.locator('#perfilFotoImg').isVisible().catch(() => false);
      const envio = ultima(s, 'POST', '/api/perfil/foto');
      const kb = envio ? Math.round(envio.bytesEnviados * 3 / 4 / 1024) : 0;
      const errorCampo = await p.evaluate(() => [...document.querySelectorAll('.campo__mensaje-error, .error-foto')].map(e => e.textContent.trim()).filter(Boolean).join(' | '));
      await c.evidencia(s, `Archivo ${d.foto.nombre} (${d.foto.bytes} bytes) → ${r ? r.status() : 'no se envió'}`, envio ? [lineaRed({ ...envio, respuesta: envio.respuesta })] : [], '#perfilHeroNombre');
      const rechazada = !r || r.status() === 400 || r.status() === 413;
      const avisa = /2\s?MB/i.test((t.texto || '') + ' ' + errorCampo) && (t.opacidad >= 0.9 || errorCampo);
      const ok = rechazada && avisa;
      return {
        estado: ok ? APROBADO : FALLIDO,
        defecto: ok ? null : 'DEF-03',
        real: r
          ? `La interfaz envió la foto: POST /api/perfil/foto → ${r.status()} ${envio ? envio.respuesta : ''}. Lo enviado pesa unos ${kb} KB (la original pesa ${(d.foto.bytes / 1048576).toFixed(2)} MB): se redujo antes de enviarla. La foto ${visibleFoto ? 'aparece' : 'no aparece'} en el perfil y no se muestra ningún aviso del límite de 2 MB (${describirTostada(t)}).`
          : `No se envió nada al servidor. Mensaje mostrado: «${errorCampo || t.texto || '(ninguno)'}» (${describirTostada(t)}).`
      };
    }
  },
  {
    id: 'CP-018', titulo: 'Un estudiante no puede guardar un perfil de docente',
    requisito: 'R4', riesgo: 'R-02', tecnica: 'Funcional negativa (control de acceso)', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'HTTP 403 y no se crea ningún perfil de docente.',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
      const r = await consola(p, 'POST', '/api/perfil/docente', { cedula: '12345', facultad: 'Ingenierías' });
      await c.evidenciaConsola(s, [{
        comando: COMANDOS.CP018, metodo: 'POST', url: r.url,
        status: r.estado, statusText: r.statusText, body: r.datos
      }], 'Sesión de sgarcia@amigo.edu.co (estudiante)');
      const ok = r.estado === 403;
      return { estado: ok ? APROBADO : FALLIDO, real: `Respuesta ${r.estado} ${JSON.stringify(r.datos)}.` };
    }
  },
  {
    id: 'CP-019', titulo: 'Rechazo de tutoría con fecha del mismo día',
    requisito: 'R5 · RRN06', riesgo: 'R-03', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'Rechaza la programación: la fecha debe ser a partir de mañana.',
    ejecutar: casoFechaInvalida(0, '23:00')
  },
  {
    id: 'CP-020', titulo: 'Rechazo de tutoría con fecha pasada',
    requisito: 'R5 · RF021', riesgo: 'R-03', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'El formulario no envía nada y muestra «La fecha debe ser a partir de mañana (RN06)».',
    ejecutar: casoFechaInvalida(-1, '10:00')
  },
  {
    id: 'CP-021', titulo: 'Rechazo de tutoría con docente inexistente',
    requisito: 'R5', riesgo: 'R-03', tecnica: 'Funcional negativa', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'HTTP 404 «Docente no encontrado o inactivo» sin error 500; el sistema sigue arriba.',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
      const r = await consola(p, 'POST', '/api/tutorias', { docente_id: 999999, asignatura: 'Cálculo Diferencial', modalidad: 'Virtual', fecha: '2027-02-15', hora: '10:00' });
      await c.evidenciaConsola(s, [{
        comando: COMANDOS.CP021, metodo: 'POST', url: r.url,
        status: r.estado, statusText: r.statusText, body: r.datos
      }], 'Sesión de sgarcia@amigo.edu.co (estudiante)');
      await p.reload();
      await p.waitForSelector('#splash', { state: 'hidden' }).catch(() => {});
      await p.waitForTimeout(1200);
      const sigue = await activa(p, 'panel-estudiante');
      await c.evidencia(s, `docente_id 999999 → ${r.estado}; después de recargar ${sigue ? 'el panel carga normal' : 'el panel no carga'}`, s.red.filter(x => x.metodo === 'POST' && x.ruta === '/api/tutorias').map(lineaRed));
      const ok = r.estado === 404 && sigue;
      return { estado: ok ? APROBADO : FALLIDO, real: `Respuesta ${r.estado} ${JSON.stringify(r.datos)}; al recargar, la página carga normal y el servidor sigue arriba.` };
    }
  },
  {
    id: 'CP-022', titulo: 'Rechazo de tutoría por choque de horario del docente',
    requisito: 'R5', riesgo: 'R-03', tecnica: 'Tabla de decisión', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'HTTP 409 «El docente ya tiene una tutoría a esa hora» y no se crea la segunda tutoría.',
    ejecutar: async (c, d) => {
      const prep = await c.abrir();
      await iniciarSesion(prep.pagina, 'sgarcia@amigo.edu.co', SEMILLA);
      const primera = await programarTutoria(prep.pagina, { tutor: 'Carlos Peña Ochoa', fecha: d.choqueDocente, hora: '10:00' });
      await cerrarSesion(prep.pagina);

      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'crios@amigo.edu.co', SEMILLA);
      const segunda = await programarTutoria(p, { tutor: 'Carlos Peña Ochoa', fecha: d.choqueDocente, hora: '10:00' });
      const t = await estadoTostada(p);
      await ir(p, 'panel-estudiante').catch(() => {});
      const tarjetas = await p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: dma(d.choqueDocente) }).count();
      await c.evidencia(s, `crios programa con Carlos Peña el ${dma(d.choqueDocente)} 10:00 → ${segunda.estado}`, s.red.filter(x => x.metodo === 'POST' && x.ruta === '/api/tutorias').map(lineaRed), '#estListaTutorias');
      const ok = primera.estado === 201 && segunda.estado === 409 && tarjetas === 0;
      return {
        estado: ok ? APROBADO : FALLIDO,
        real: `Preparación: sgarcia programó con Carlos Peña Ochoa el ${dma(d.choqueDocente)} a las 10:00 (${primera.estado}). Con crios, la misma franja respondió ${segunda.estado} ${JSON.stringify(segunda.cuerpo)} y en el panel no aparece una tutoría nueva. En pantalla no sale ningún mensaje (${describirTostada(t)}).`
      };
    }
  },
  {
    id: 'CP-023', titulo: 'Ciclo de vida de la tutoría: de pendiente a cancelada',
    requisito: 'R6', riesgo: 'R-11', tecnica: 'Transición de estados', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'La tutoría pasa a «Cancelada» y deja de permitir acciones.',
    ejecutar: async (c) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'jperez@amigo.edu.co', SEMILLA);
      const fecha = fechaColombia(5);
      const prog = await programarTutoria(p, { tutor: 'Diego Herrera Zapata', fecha, hora: '15:00' });
      await ir(p, 'panel-estudiante');
      const tarjeta = p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: dma(fecha) }).filter({ hasText: 'Diego' }).first();
      await tarjeta.locator('button:has-text("Cancelar")').click();
      await p.waitForResponse(r => r.url().includes('/cancelar')).catch(() => null);
      await p.waitForTimeout(1200);
      const final = p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: dma(fecha) }).filter({ hasText: 'Diego' }).first();
      const estadoTxt = (await final.locator('.tarjeta-tutoria__estado').textContent()).trim();
      const botones = await final.locator('button').count();
      const cancel = ultima(s, 'PATCH', '/api/tutorias/');
      await c.evidencia(s, `Tutoría del ${dma(fecha)} 15:00 con Diego Herrera → «${estadoTxt}»`, cancel ? [lineaRed(cancel)] : [], final);
      const ok = prog.estado === 201 && cancel && cancel.estado === 200 && estadoTxt === 'Cancelada' && botones === 0;
      return { estado: ok ? APROBADO : FALLIDO, real: `Se programó para el ${dma(fecha)} a las 15:00 (${prog.estado}). Al cancelar: PATCH → ${cancel ? cancel.estado : '—'}; la tarjeta pasa a «${estadoTxt}» y ${botones ? 'conserva botones' : 'ya no tiene botón «Cancelar»'}.` };
    }
  },
  {
    id: 'CP-024', titulo: 'Rechazo de cancelación con menos de 24 h de antelación',
    requisito: 'R6', riesgo: 'R-11', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'Rechaza la cancelación e indica en pantalla que se requieren 24 h de antelación.',
    ejecutar: casoCancelacion('Juan Salazar Bedoya', 12)
  },
  {
    id: 'CP-025', titulo: 'Cancelación permitida con 24 h o más de antelación',
    requisito: 'R6', riesgo: 'R-11', tecnica: 'Análisis de valores límite', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'Con 24 h o más de margen, cancela la tutoría.',
    ejecutar: casoCancelacion('Laura Vargas Suárez', 26)
  },
  {
    id: 'CP-026', titulo: 'Cierre de tutoría vencida por el docente (marcar realizada)',
    requisito: 'R6', riesgo: 'R-11', tecnica: 'Transición de estados', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'La tutoría vencida pasa a «Completada».',
    ejecutar: async (c) => {
      const prep = await c.abrir();
      await iniciarSesion(prep.pagina, 'jperez@amigo.edu.co', SEMILLA);
      const manana = fechaColombia(1);
      const prog = await programarTutoria(prep.pagina, { tutor: 'María González Ramos', fecha: manana, hora: '07:00' });
      await cerrarSesion(prep.pagina);

      // La tutoría tiene que estar vencida: se adelanta el reloj del navegador al día siguiente.
      const siguiente = Date.parse(`${manana}T08:00:00-05:00`);
      const s = await c.abrir({ reloj: siguiente });
      const p = s.pagina;
      await iniciarSesion(p, 'mgonzalez@amigo.edu.co', SEMILLA);
      const tarjeta = p.locator('#docListaTutorias .tarjeta-tutoria', { hasText: dma(manana) }).filter({ hasText: 'Juan' }).first();
      const boton = tarjeta.locator('button:has-text("Marcar realizada")');
      const tieneBoton = await boton.count();
      if (tieneBoton) {
        await boton.click();
        await p.waitForResponse(r => r.url().includes('/realizada')).catch(() => null);
        await p.waitForTimeout(1200);
      }
      const final = p.locator('#docListaTutorias .tarjeta-tutoria', { hasText: dma(manana) }).filter({ hasText: 'Juan' }).first();
      const estadoTxt = (await final.locator('.tarjeta-tutoria__estado').textContent().catch(() => '')).trim();
      const marca = ultima(s, 'PATCH', '/api/tutorias/');
      await c.evidencia(s, `Docente mgonzalez, reloj en ${manana} 08:00 → «${estadoTxt}»`, marca ? [lineaRed(marca)] : [], final);
      const ok = prog.estado === 201 && marca && marca.estado === 200 && estadoTxt === 'Completada';
      return { estado: ok ? APROBADO : FALLIDO, real: `Preparación: jperez programó con María González Ramos el ${dma(manana)} a las 07:00 (${prog.estado}). Con el reloj del navegador en ese día a las 08:00, la docente ve «Marcar realizada»; al confirmar, PATCH → ${marca ? marca.estado : '—'} y la tarjeta pasa a «${estadoTxt}».` };
    }
  },
  {
    id: 'CP-027', titulo: 'Creación de usuario por el administrador con contraseña válida',
    requisito: 'R7', riesgo: 'R-04', tecnica: 'Particiones de equivalencia', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'Crea el usuario, devuelve su identificador y aparece en la tabla.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-usuarios');
      const correo = `laura.gomez.${d.sufijo}@amigo.edu.co`;
      await p.click('button:has-text("+ Nuevo Usuario")');
      await p.fill('#nuNombres', 'Laura');
      await p.fill('#nuApellidos', 'Gómez');
      await p.fill('#nuCorreo', correo);
      await p.selectOption('#nuRol', 'estudiante');
      await p.fill('#nuContra', 'Password123');
      const resp = p.waitForResponse(r => r.url().endsWith('/api/admin/usuarios') && r.request().method() === 'POST');
      await p.click('#modalNuevoUsuario button:has-text("Crear Usuario")');
      const r = await resp;
      await p.waitForTimeout(1200);
      const fila = await p.locator('#cuerpoTablaUsuarios tr', { hasText: correo }).count();
      await c.evidencia(s, `Nuevo usuario ${correo} → ${r.status()}`, [lineaRed(ultima(s, 'POST', '/api/admin/usuarios'))], p.locator('#cuerpoTablaUsuarios tr', { hasText: correo }).first());
      const ok = r.ok() && fila > 0;
      return { estado: ok ? APROBADO : FALLIDO, real: `POST /api/admin/usuarios → ${r.status()} ${ultima(s, 'POST', '/api/admin/usuarios').respuesta}; ${fila ? 'la fila aparece en la tabla' : 'la fila no aparece'}.` };
    }
  },
  {
    id: 'CP-028', titulo: 'Rechazo al editar un usuario con un correo ya usado por otro',
    requisito: 'R7', riesgo: 'R-09', tecnica: 'Tabla de decisión', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'HTTP 409 «Ya existe otro usuario con ese correo» y no aplica el cambio.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-usuarios');
      const correo = `laura.gomez.${d.sufijo}@amigo.edu.co`;
      await p.locator('#cuerpoTablaUsuarios tr', { hasText: correo }).locator('.btn-accion--editar').click();
      await p.waitForSelector('#modalEditarUsuario');
      await p.fill('#euCorreo', 'avargas@amigo.edu.co');
      const resp = p.waitForResponse(r => r.url().includes('/api/admin/usuarios/') && r.request().method() === 'PUT');
      await p.click('#modalEditarUsuario button:has-text("Guardar cambios")');
      const r = await resp;
      await p.waitForTimeout(800);
      const dialogo = s.dialogos.map(x => x.mensaje).join(' | ');
      await c.evidencia(s, `Ventana del navegador: «${dialogo}»`, [lineaRed(ultima(s, 'PUT', '/api/admin/usuarios/'))]);
      await p.evaluate(() => document.getElementById('modalEditarUsuario')?.remove());
      await ir(p, 'panel-admin');
      await ir(p, 'admin-usuarios');
      const sigue = await p.locator('#cuerpoTablaUsuarios tr', { hasText: correo }).count();
      const ok = r.status() === 409 && dialogo.includes('Ya existe otro usuario con ese correo') && sigue > 0;
      return { estado: ok ? APROBADO : FALLIDO, real: `PUT → ${r.status()}; la ventana del navegador dice «${dialogo}» y, al recargar la tabla, el correo sigue siendo ${correo}.` };
    }
  },
  {
    id: 'CP-029', titulo: 'La auditoría registra el evento con fecha válida',
    requisito: 'R8', riesgo: 'R-08', tecnica: 'Análisis de valores límite', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'El evento aparece con fecha y hora legibles (no «NaN») y con el tipo correcto.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      const antes = Date.now();
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      const real = instanteColombia(antes);
      await ir(p, 'admin-auditoria');
      await p.waitForSelector('#pagina-admin-auditoria .tabla-datos tbody tr td');
      const celdas = await p.locator('#pagina-admin-auditoria .tabla-datos tbody tr').first().locator('td').allTextContents();
      const [fechaMostrada, usuario, evento] = celdas.map(x => x.trim());
      await c.evidencia(s, `Primera fila: ${fechaMostrada} · ${usuario} · ${evento}. Hora real del login: ${dma(real.fecha)} ${real.hora}`, [], '#pagina-admin-auditoria .tabla-datos');
      const legible = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(fechaMostrada);
      const tipo = /login/i.test(evento) && usuario === d.admin.correo;
      const horaMostrada = fechaMostrada.slice(11, 16);
      const desfase = legible ? Math.round((Date.parse(`2000-01-01T${horaMostrada}:00Z`) - Date.parse(`2000-01-01T${real.hora}:00Z`)) / 3600000) : null;
      const ok = legible && tipo;
      return {
        estado: ok ? APROBADO : FALLIDO,
        defecto: desfase ? 'DEF-12' : null,
        real: `La primera fila es «${fechaMostrada} · ${usuario} · ${evento}»: fecha legible y tipo correcto. El inicio de sesión se hizo a las ${real.hora} (hora de Colombia) y la tabla muestra ${horaMostrada}${desfase ? `: ${desfase} horas de diferencia` : ''}.`
      };
    }
  },
  {
    id: 'CP-030', titulo: 'Envío de notificación a un grupo de usuarios',
    requisito: 'R8', riesgo: 'R-08', tecnica: 'Particiones de equivalencia', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'Informa el número de usuarios notificados y registra el envío en el historial.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-notificaciones');
      await p.selectOption('#notifDestinatario', { label: 'Todos los estudiantes en alerta' });
      await p.selectOption('#notifTipo', { index: 1 });
      await p.fill('#notifAsunto', 'Recordatorio');
      await p.fill('#notifMensaje', 'Programe su tutoría');
      const resp = p.waitForResponse(r => r.url().endsWith('/api/admin/notificaciones') && r.request().method() === 'POST');
      await p.click('[onclick="enviarNotificacion()"]');
      const r = await resp;
      await p.waitForTimeout(1200);
      const fila = (await p.locator('#pagina-admin-notificaciones .tabla-datos tbody tr').first().innerText()).replace(/\s+/g, ' ').trim();
      await c.evidencia(s, `Notificación a «Todos los estudiantes en alerta» → ${r.status()}`, [lineaRed(ultima(s, 'POST', '/api/admin/notificaciones'))], '#pagina-admin-notificaciones .tabla-datos');
      const ok = r.ok() && /Todos los estudiantes en alerta \(\d+\)/.test(fila) && /Enviado/.test(fila);
      return { estado: ok ? APROBADO : FALLIDO, real: `POST → ${r.status()} ${ultima(s, 'POST', '/api/admin/notificaciones').respuesta}. La primera fila del historial es «${fila}».` };
    }
  },
  {
    id: 'CP-031', titulo: 'Filtro de la tabla de usuarios (combinaciones por pares)',
    requisito: 'R7 · RF049', riesgo: 'R-02', tecnica: 'Pruebas por pares', prioridad: 'Media', responsable: 'Sebastián González González',
    esperado: 'En cada combinación la tabla muestra solo los usuarios que cumplen los tres criterios y el contador coincide con las filas visibles.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-usuarios');
      // Preparación: Valentina Osorio queda inactiva durante el caso.
      const filaVal = p.locator('#cuerpoTablaUsuarios tr', { hasText: 'vosorio@amigo.edu.co' });
      await filaVal.locator('.btn-accion--toggle').click();
      await p.waitForResponse(r => r.url().includes('/estado')).catch(() => null);
      await p.waitForTimeout(700);

      const todos = (await consola(p, 'GET', '/api/admin/usuarios')).datos;
      const combinaciones = [
        { rol: 'Estudiante', etiquetaRol: 'Estudiantes', estado: 'Activo', etiquetaEstado: 'Activos', texto: '' },
        { rol: 'Docente', etiquetaRol: 'Docentes', estado: 'Inactivo', etiquetaEstado: 'Inactivos', texto: 'Peña' },
        { rol: 'Admin', etiquetaRol: 'Administradores', estado: 'Activo', etiquetaEstado: 'Activos', texto: 'zzz' }
      ];
      const resultados = [];
      for (const k of combinaciones) {
        await p.fill('#buscarUsuario', k.texto);
        await p.selectOption('#filtroRolUsuarios', k.rol);
        await p.selectOption('#filtroEstadoUsuarios', k.estado);
        await p.evaluate(() => filtrarTablaUsuarios());
        await p.waitForTimeout(300);
        const visibles = await p.$$eval('#cuerpoTablaUsuarios tr', filas => filas
          .filter(f => f.style.display !== 'none')
          .map(f => (f.children[1] ? f.children[1].textContent.trim() : '')));
        const contador = (await p.locator('#conteoUsuarios').textContent()).trim();
        const t = k.texto.toLowerCase();
        const esperados = todos.filter(u =>
          u.rol === k.rol.toLowerCase() &&
          (k.estado === 'Activo' ? Number(u.activo) === 1 : Number(u.activo) === 0) &&
          (!t || `${u.nombres} ${u.apellidos} ${u.correo}`.toLowerCase().includes(t))
        ).map(u => u.correo);
        const sobran = visibles.filter(x => !esperados.includes(x));
        const faltan = esperados.filter(x => !visibles.includes(x));
        const numContador = parseInt((contador.match(/\d+/) || ['-1'])[0], 10);
        resultados.push({ k, visibles, esperados, sobran, faltan, contador, cuadra: numContador === visibles.length });
        await c.evidencia(s, `${k.etiquetaRol} + ${k.etiquetaEstado} + «${k.texto}»: ${visibles.length} visibles, ${esperados.length} esperados. ${sobran.length ? 'Sobran: ' + sobran.join(', ') + '. ' : ''}${faltan.length ? 'Faltan: ' + faltan.join(', ') + '.' : ''}`);
      }
      // Deja a Valentina Osorio activa otra vez.
      await consola(p, 'PATCH', `/api/admin/usuarios/${todos.find(u => u.correo === 'vosorio@amigo.edu.co').id}/estado`, { activo: true });

      const ok = resultados.every(x => !x.sobran.length && !x.faltan.length && x.cuadra);
      const texto = resultados.map(x => `${x.k.etiquetaRol} + ${x.k.etiquetaEstado} + «${x.k.texto}»: ${x.visibles.length} filas visibles de ${x.esperados.length} esperadas${x.sobran.length ? `; sobran ${x.sobran.join(', ')}` : ''}${x.faltan.length ? `; faltan ${x.faltan.join(', ')}` : ''}; contador «${x.contador}»`).join('. ');
      return { estado: ok ? APROBADO : FALLIDO, defecto: ok ? null : 'DEF-11', real: `Preparación: se desactivó a Valentina Osorio. ${texto}. Al final se reactivó la cuenta.` };
    }
  },
  {
    id: 'CP-032', titulo: 'El administrador no programa asesorías para hoy',
    requisito: 'R5 · RRN06', riesgo: 'R-03', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Esteban Palencia',
    esperado: 'RRN06: no se puede programar para el mismo día; el sistema rechaza la asesoría.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, d.admin.correo, d.admin.clave);
      await ir(p, 'admin-asignacion');
      await p.fill('#claseDocente', 'Sandra');
      await p.locator('#claseDocenteResults .busqueda-item', { hasText: 'Sandra Ríos Montoya' }).click();
      await p.fill('#claseEstudiante', 'Camilo');
      await p.locator('#claseEstudianteResults .busqueda-item', { hasText: 'Camilo Ríos Zapata' }).click();
      await p.waitForFunction(() => document.querySelectorAll('#claseAsignatura option').length > 1);
      await p.evaluate(() => { const x = document.getElementById('claseAsignatura'); x.value = [...x.options].find(o => o.value).value; });
      const hoy = fechaColombia(0);
      const hora = d.horaAsesoriaHoy;
      await p.fill('#claseFecha', hoy);
      await p.fill('#claseHora', hora);
      await p.selectOption('#claseModalidad', 'Virtual');
      const resp = p.waitForResponse(r => r.url().includes('/api/admin/programar-clase'), { timeout: 5000 }).catch(() => null);
      await p.click('[onclick="confirmarProgramarClase()"]');
      const r = await resp;
      await p.waitForTimeout(1500);
      const filas = await p.locator('#cuerpoClasesProgramadas tr', { hasText: dma(hoy) }).count();
      await c.evidencia(s, `Asesoría Sandra Ríos + Camilo Ríos, ${dma(hoy)} ${hora} → ${r ? r.status() : 'no se envió'}`, r ? [lineaRed(ultima(s, 'POST', '/api/admin/programar-clase'))] : [], '#cuerpoClasesProgramadas');
      const creada = r && r.ok();
      return {
        estado: creada ? FALLIDO : APROBADO,
        defecto: creada ? 'DEF-02' : null,
        real: creada
          ? `La asesoría con fecha de hoy (${dma(hoy)} ${hora}) se crea: POST → ${r.status()} ${ultima(s, 'POST', '/api/admin/programar-clase').respuesta}. ${filas ? 'Aparece en «Sesiones Programadas».' : ''}`
          : `No se crea: ${r ? `POST → ${r.status()} ${ultima(s, 'POST', '/api/admin/programar-clase').respuesta}` : 'el formulario no envía nada'}.`
      };
    }
  },
  {
    id: 'CP-033', titulo: 'Un estudiante no queda con dos tutorías a la misma hora',
    requisito: 'R5', riesgo: 'R-03', tecnica: 'Funcional negativa', prioridad: 'Media', responsable: 'Esteban Palencia',
    esperado: 'R5 valida el horario de los participantes: rechaza la segunda tutoría.',
    ejecutar: async (c, d) => {
      const s = await c.abrir();
      const p = s.pagina;
      await iniciarSesion(p, 'avargas@amigo.edu.co', SEMILLA);
      const f = d.choqueEstudiante;
      const a = await programarTutoria(p, { tutor: 'Andrés López Castillo', modalidad: 'Virtual', fecha: f, hora: '09:00' });
      const b = await programarTutoria(p, { tutor: 'Sandra Ríos Montoya', modalidad: 'Presencial', fecha: f, hora: '09:00' });
      await ir(p, 'panel-estudiante');
      const misma = await p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: `${dma(f)} · ⏰ 09:00` }).count();
      await c.evidencia(s, `Dos tutorías el ${dma(f)} 09:00: ${a.estado} y ${b.estado}; tarjetas a esa hora: ${misma}`, s.red.filter(x => x.metodo === 'POST' && x.ruta === '/api/tutorias').map(lineaRed), '#estListaTutorias');
      const ok = a.estado === 201 && b.estado !== 201 && misma === 1;
      return { estado: ok ? APROBADO : FALLIDO, defecto: ok ? null : 'DEF-09', real: `Primera (Andrés López Castillo): ${a.estado}. Segunda (Sandra Ríos Montoya, misma fecha y hora): ${b.estado}${b.cuerpo ? ' ' + JSON.stringify(b.cuerpo) : ''}. En «Mis Tutorías Programadas» hay ${misma} tarjeta(s) el ${dma(f)} a las 09:00.` };
    }
  },
  {
    id: 'CP-034', titulo: 'La sesión expira tras 15 minutos sin actividad',
    requisito: 'RNF02', riesgo: '— (no estaba en la matriz)', tecnica: 'Análisis de valores límite', prioridad: 'Alta', responsable: 'Sebastián González González',
    esperado: 'RNF02: a los 15 minutos de inactividad la sesión expira y el sistema lleva al inicio de sesión.',
    ejecutar: async (c) => {
      const s = await c.abrir({ reloj: Date.now() });
      const p = s.pagina;
      await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
      await c.evidencia(s, 'Inicio: sesión de sgarcia abierta');
      // Dieciséis minutos sin tocar teclado ni ratón, con el reloj del navegador.
      await p.clock.fastForward('16:00');
      await p.waitForTimeout(800);
      const aLos16 = { panel: await activa(p, 'panel-estudiante'), token: await p.evaluate(() => Boolean(localStorage.getItem('cp.token'))) };
      await c.evidencia(s, `16 min sin actividad: ${aLos16.panel ? 'sigue en el panel' : 'ya no está en el panel'}; token ${aLos16.token ? 'presente' : 'borrado'}`);
      await ir(p, 'programar-tutoria').catch(() => {});
      const programar = await activa(p, 'programar-tutoria');
      await p.reload();
      await p.waitForSelector('#splash', { state: 'hidden' }).catch(() => {});
      await p.waitForTimeout(1500);
      const trasRecargar = { login: await activa(p, 'inicio-sesion'), panel: await activa(p, 'panel-estudiante') };
      await c.evidencia(s, `Después de «Programar Tutoría» y recargar: ${trasRecargar.login ? 'inicio de sesión' : trasRecargar.panel ? 'panel con la sesión activa' : 'otra página'}`);
      const ok = !aLos16.token && !aLos16.panel;
      return {
        estado: ok ? APROBADO : FALLIDO,
        defecto: ok ? null : 'DEF-01',
        real: ok
          ? 'A los 16 minutos sin actividad la sesión ya estaba cerrada y la aplicación mostraba el inicio de sesión.'
          : `A los 16 minutos sin actividad la sesión sigue abierta (token ${aLos16.token ? 'presente' : 'borrado'}). «Programar Tutoría» ${programar ? 'abre normalmente' : 'no abre'} y, al recargar, la aplicación ${trasRecargar.panel ? 'vuelve al panel con la sesión activa' : trasRecargar.login ? 'muestra el inicio de sesión' : 'muestra otra página'}. El tiempo se simuló adelantando el reloj del navegador.`
      };
    }
  }
];

// CP-014 y CP-015: necesitan una cuenta real de Google, que un script no puede usar.
function casoGoogle(tipo) {
  return async (c) => {
    const s = await c.abrir();
    const p = s.pagina;
    await abrirAplicacion(p);
    const estado = await consola(p, 'GET', '/api/auth/google/estado');
    const disponible = Boolean(estado.datos && estado.datos.disponible);
    let destino = '';
    if (!disponible) {
      await p.click('button:has-text("Continuar con Google")');
      await p.waitForTimeout(1200);
      destino = `${p.url()} → ${(await p.locator('body').innerText()).slice(0, 120)}`;
    }
    await c.evidencia(s, `GET /api/auth/google/estado → ${JSON.stringify(estado.datos)}${destino ? ' · ' + destino : ''}`);
    return {
      estado: BLOQUEADO,
      real: disponible
        ? `Google está configurado, pero el caso necesita autenticarse con una cuenta ${tipo === 'institucional' ? '@amigo.edu.co' : '@gmail.com'} real y verificada; un script no puede hacerlo sin credenciales de una persona. Queda para ejecución manual.`
        : `El entorno no tiene credenciales de Google OAuth: /api/auth/google/estado responde ${JSON.stringify(estado.datos)} y «Continuar con Google» lleva a ${destino}. Bloqueado por el entorno, no por el sistema; se ejecuta a mano en Railway con una cuenta ${tipo === 'institucional' ? 'institucional' : 'de Gmail'}.`
    };
  };
}

// CP-019 y CP-020: fecha de hoy o de ayer desde el formulario del estudiante.
function casoFechaInvalida(dias, hora) {
  return async (c) => {
    const s = await c.abrir();
    const p = s.pagina;
    await iniciarSesion(p, 'sgarcia@amigo.edu.co', SEMILLA);
    const fecha = fechaColombia(dias);
    const r = await programarTutoria(p, { tutor: 'Andrés López Castillo', modalidad: 'Virtual', fecha, hora });
    const error = await textoError(p, 'errorTutFecha');
    await c.evidencia(s, `Fecha ${dma(fecha)} ${hora}: «${error}»`, [], '#tutFecha');
    const ok = r.estado === null && /a partir de mañana/.test(error);
    return { estado: ok ? APROBADO : FALLIDO, real: `Con la fecha ${dma(fecha)} y la hora ${hora}, bajo la fecha aparece «${error}» y ${r.estado === null ? 'no se envía nada al servidor' : `se envió la petición (${r.estado})`}.` };
  };
}

// CP-024 y CP-025: cancelar con un margen dado de horas.
function casoCancelacion(tutor, margenHoras) {
  return async (c) => {
    const s = await c.abrir();
    const p = s.pagina;
    await iniciarSesion(p, 'jperez@amigo.edu.co', SEMILLA);
    const objetivo = Date.now() + margenHoras * 3600000;
    let { fecha, hora } = instanteColombia(objetivo);
    // El formulario solo deja programar desde mañana: si el margen cae hoy, se usa mañana a la misma hora.
    if (fecha === fechaColombia(0)) fecha = fechaColombia(1);
    const prog = await programarTutoria(p, { tutor, fecha, hora });
    await ir(p, 'panel-estudiante');
    const tarjeta = p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: `${dma(fecha)} · ⏰ ${hora}` }).first();
    const margenReal = (Date.parse(`${fecha}T${hora}:00-05:00`) - Date.now()) / 3600000;
    await tarjeta.locator('button:has-text("Cancelar")').click();
    const resp = await p.waitForResponse(r => r.url().includes('/cancelar')).catch(() => null);
    const t = await tostadaTrasAccion(p);
    await p.waitForTimeout(800);
    const estadoTxt = (await p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: `${dma(fecha)} · ⏰ ${hora}` }).first().locator('.tarjeta-tutoria__estado').textContent()).trim();
    const cancel = ultima(s, 'PATCH', '/api/tutorias/');
    await c.evidencia(s, `Tutoría ${dma(fecha)} ${hora} con ${tutor} (margen real ${margenReal.toFixed(1)} h) → PATCH ${resp ? resp.status() : '—'} · «${estadoTxt}». ${describirTostada(t)}`, cancel ? [lineaRed(cancel)] : [], p.locator('#estListaTutorias .tarjeta-tutoria', { hasText: `${dma(fecha)} · ⏰ ${hora}` }).first());

    const base = `Preparación: tutoría con ${tutor} el ${dma(fecha)} a las ${hora} (${prog.estado}); al pulsar «Cancelar» faltaban ${margenReal.toFixed(1)} h reales. PATCH → ${cancel ? `${cancel.estado} ${cancel.respuesta}` : '—'}; la tarjeta queda «${estadoTxt}». En pantalla: ${describirTostada(t)}.`;
    if (margenHoras < 24) {
      const rechazada = cancel && cancel.estado === 400 && estadoTxt !== 'Cancelada';
      const visible = tostadaVisible(t, '24');
      const ok = rechazada && visible;
      return { estado: ok ? APROBADO : FALLIDO, defecto: ok ? null : (rechazada ? 'DEF-13' : 'DEF-08'), real: base };
    }
    const ok = cancel && cancel.estado === 200 && estadoTxt === 'Cancelada';
    return { estado: ok ? APROBADO : FALLIDO, defecto: ok ? null : 'DEF-08', real: base };
  };
}

module.exports = { CASOS, APROBADO, FALLIDO, BLOQUEADO };
