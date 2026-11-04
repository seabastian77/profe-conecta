// Administración del sistema: auditoría, parámetros académicos, períodos y acciones críticas.

const LOTE_EXPORTACION = 500;

const MAX_FILAS_EXPORTACION = 5000;

// Nombre, ícono y grupo de filtro de cada evento que registra el servidor.
const EVENTOS_AUDITORIA = {
  LOGIN: { icono: 'llave', texto: 'Inicio de sesión', grupo: 'inicio' },
  LOGOUT: { icono: 'salir', texto: 'Cierre de sesión', grupo: 'cierre' },
  LOGIN_FALLIDO: { icono: 'error-circulo', texto: 'Intento fallido', grupo: 'fallido' },
  LOGIN_BLOQUEADO: { icono: 'prohibido', texto: 'Cuenta bloqueada por intentos', grupo: 'fallido' },
  REGISTRO: { icono: 'usuario-mas', texto: 'Registro de cuenta', grupo: 'registro' },
  RECUPERACION_SOLICITADA: { icono: 'candado', texto: 'Recuperación de contraseña solicitada', grupo: 'registro' },
  CREAR_USUARIO: { icono: 'usuario-mas', texto: 'Usuario creado', grupo: 'usuarios' },
  EDITAR_USUARIO: { icono: 'usuario-ajustes', texto: 'Usuario editado', grupo: 'usuarios' },
  ELIMINAR_USUARIO: { icono: 'eliminar', texto: 'Usuario eliminado', grupo: 'usuarios' },
  ACTIVAR_USUARIO: { icono: 'activar', texto: 'Usuario activado', grupo: 'usuarios' },
  DESACTIVAR_USUARIO: { icono: 'desactivar', texto: 'Usuario desactivado', grupo: 'usuarios' },
  ASIGNACION_CREADA: { icono: 'enlace', texto: 'Asignación creada', grupo: 'tutorias' },
  ASIGNACION_ELIMINADA: { icono: 'eliminar', texto: 'Asignación eliminada', grupo: 'tutorias' },
  ASESORIA_PROGRAMADA: { icono: 'calendario-mas', texto: 'Asesoría programada', grupo: 'tutorias' },
  NOTIFICACION: { icono: 'enviar', texto: 'Notificación enviada', grupo: 'notificacion' },
  CONFIG: { icono: 'ajustes-finos', texto: 'Parámetro cambiado', grupo: 'sistema' },
  CONFIG_RESET: { icono: 'deshacer', texto: 'Configuración restaurada', grupo: 'sistema' },
  PERIODO_CREADO: { icono: 'calendario', texto: 'Período creado', grupo: 'sistema' },
  PERIODO_ACTIVADO: { icono: 'calendario-ok', texto: 'Período activado', grupo: 'sistema' },
  PERIODO_CERRADO: { icono: 'candado', texto: 'Período cerrado', grupo: 'sistema' },
  AUDITORIA_ARCHIVADA: { icono: 'archivo', texto: 'Auditoría archivada', grupo: 'sistema' },
};

const ESTADOS_PERIODO = {
  activo: { texto: 'Activo', insignia: 'ok' },
  proximo: { texto: 'Próximo', insignia: 'info' },
  cerrado: { texto: 'Cerrado', insignia: 'neutro' },
};

const CLAVES_CONFIG = {
  cfgUmbral: 'RN_PROMEDIO_MINIMO',
  cfgMaxEst: 'RN_MAX_ESTUDIANTES',
  cfgCancelacion: 'RN_HORAS_CANCELACION',
  cfgSesion: 'RN_MINUTOS_SESION',
};

const estadoAuditoria = { pagina: 1, porPagina: 25, total: 0, secuencia: 0 };
const estadoConfig = { periodos: [], periodoActivo: null, accionCritica: false };

registrarLimpieza(() => {
  Object.assign(estadoAuditoria, { pagina: 1, total: 0, secuencia: estadoAuditoria.secuencia + 1 });
  Object.assign(estadoConfig, { periodos: [], periodoActivo: null, accionCritica: false });
});

// Devuelve el nombre legible de un evento de auditoría.
function textoEvento(evento) {
  const conocido = EVENTOS_AUDITORIA[evento];
  if (conocido) return conocido.texto;
  const texto = String(evento || '').replace(/_/g, ' ').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Devuelve el resultado que se muestra de un evento: rechazado, archivado o registrado.
function resultadoAuditoria(evento) {
  if (evento.evento === 'LOGIN_FALLIDO' || evento.evento === 'LOGIN_BLOQUEADO') return { texto: 'Rechazado', insignia: 'error' };
  if (Number(evento.archivada) === 1) return { texto: 'Archivado', insignia: 'neutro' };
  return { texto: 'Registrado', insignia: 'ok' };
}

// Arma los filtros de la auditoría que se ven en pantalla, sin la paginación.
function consultaAuditoria() {
  const consulta = new URLSearchParams();
  const grupo = valorDe('filtroAuditTipo');
  const fecha = valorDe('filtroAuditFecha');
  const archivados = document.getElementById('filtroAuditArchivados');
  if (grupo) consulta.set('grupo', grupo);
  if (fecha) consulta.set('fecha', fecha);
  if (archivados && archivados.checked) consulta.set('archivadas', '1');
  return consulta;
}

// Devuelve la fila de un evento de auditoría.
function detalleAuditoria(evento) {
  const detalle = String(evento.detalle || '').trim();
  if (!detalle || detalle.toLowerCase() === textoEvento(evento.evento).toLowerCase()) return '';
  return '<span class="evento__detalle">' + escaparHtml(detalle) + '</span>';
}
function filaAuditoria(evento) {
  const conocido = EVENTOS_AUDITORIA[evento.evento];
  const resultado = resultadoAuditoria(evento);
  return '<tr>' +
    celda('Fecha y hora', formatearFechaHora(evento.creada_en), 'celda-principal no-parte') +
    celda('Usuario', escaparHtml(evento.correo_usuario || '—')) +
    celda('Evento', '<div class="evento-bloque"><span class="evento">' + icono(conocido ? conocido.icono : 'registro') + escaparHtml(textoEvento(evento.evento)) + '</span>' + detalleAuditoria(evento) + '</div>', 'texto-libre') +
    celda('IP', escaparHtml(evento.ip || '—'), 'col-secundaria') +
    celda('Resultado', '<span class="insignia insignia--' + resultado.insignia + '">' + resultado.texto + '</span>') + '</tr>';
}

// Carga la página actual de la auditoría con los filtros del servidor.
async function cargarAuditoria(reiniciar) {
  const cuerpo = document.getElementById('cuerpoAuditoria');
  if (!cuerpo || !sesion.activa) return;
  if (reiniciar === true) estadoAuditoria.pagina = 1;

  const generacion = generacionAdmin;
  const turno = ++estadoAuditoria.secuencia;
  const consulta = consultaAuditoria();
  const hayFiltros = consulta.has('grupo') || consulta.has('fecha');
  consulta.set('limite', estadoAuditoria.porPagina);
  consulta.set('pagina', estadoAuditoria.pagina);

  try {
    const { datos, total } = await llamarAPIConTotal('/admin/auditoria?' + consulta);
    if (turno !== estadoAuditoria.secuencia || generacion !== generacionAdmin) return;

    estadoAuditoria.total = total;
    const paginas = Math.max(1, Math.ceil(total / estadoAuditoria.porPagina));
    if (estadoAuditoria.pagina > paginas) {
      estadoAuditoria.pagina = paginas;
      cargarAuditoria();
      return;
    }
    cuerpo.innerHTML = datos.length
      ? datos.map(filaAuditoria).join('')
      : filaMensaje(5, hayFiltros ? 'Ningún evento coincide con el filtro' : 'Todavía no hay eventos registrados');
    pintarPaginacion(estadoAuditoria, { conteo: 'conteoAuditoria', pagina: 'auditoriaPagina', anterior: 'auditoriaAnterior', siguiente: 'auditoriaSiguiente' }, ['evento', 'eventos']);
  } catch (err) {
    if (turno !== estadoAuditoria.secuencia || generacion !== generacionAdmin) return;
    cuerpo.innerHTML = filaError(5, err.mensaje, 'cargarAuditoria()');
    ponerTexto('conteoAuditoria', 'No se pudo cargar la auditoría');
  }
}

// Vuelve a la primera página cuando cambia un filtro de la auditoría.
function filtrarAuditoria() {
  estadoAuditoria.pagina = 1;
  cargarAuditoria();
}

// Avanza o retrocede una página en la auditoría.
function cambiarPaginaAuditoria(salto) {
  estadoAuditoria.pagina = Math.max(1, estadoAuditoria.pagina + salto);
  cargarAuditoria();
}

// Descarga como CSV los eventos que coinciden con los filtros, hasta un máximo de filas.
async function exportarLogAuditoria() {
  await conOcupado(document.getElementById('btnExportarAuditoria'), async () => {
    const generacion = generacionAdmin;
    const eventos = [];
    let total = 0;
    try {
      for (let pagina = 1; eventos.length < MAX_FILAS_EXPORTACION; pagina++) {
        const consulta = consultaAuditoria();
        consulta.set('limite', LOTE_EXPORTACION);
        consulta.set('pagina', pagina);
        const lote = await llamarAPIConTotal('/admin/auditoria?' + consulta);
        total = lote.total;
        eventos.push(...lote.datos);
        if (lote.datos.length < LOTE_EXPORTACION || eventos.length >= total) break;
      }
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo exportar el registro', 'error');
      return;
    }
    if (generacion !== generacionAdmin) return;
    if (!eventos.length) {
      mostrarTostada('No hay eventos para exportar con esos filtros', 'advertencia');
      return;
    }

    const exportados = eventos.slice(0, MAX_FILAS_EXPORTACION);
    const filas = [['Fecha y hora', 'Usuario', 'Evento', 'Detalle', 'IP', 'Resultado']].concat(exportados.map((e) =>
      [formatearFechaHora(e.creada_en), e.correo_usuario || '—', textoEvento(e.evento), e.detalle || '', e.ip || '', resultadoAuditoria(e).texto]));
    descargarArchivo('log-auditoria-' + hoyColombiaISO() + '.csv', armarCSV(filas), 'text/csv;charset=utf-8');
    if (total > exportados.length) {
      mostrarTostada('Se exportaron los ' + miles(exportados.length) + ' eventos más recientes de ' + miles(total) + '. Acota la fecha para ver el resto.', 'advertencia');
    } else {
      mostrarTostada('Registro exportado: ' + conteoTexto(exportados.length, 'evento', 'eventos'), 'exito');
    }
  });
}

// Carga los parámetros académicos y los períodos.
function iniciarConfiguracion() {
  return Promise.all([cargarConfiguracion(), cargarPeriodos()]);
}

// Carga los parámetros con las claves RN_* que usan las reglas.
async function cargarConfiguracion() {
  const generacion = generacionAdmin;
  try {
    const cfg = await llamarAPI('/admin/configuracion', 'GET');
    if (generacion !== generacionAdmin) return;
    const poner = (id, valor) => {
      const campo = document.getElementById(id);
      if (campo && valor !== undefined && valor !== null) campo.value = valor;
    };
    poner('cfgUmbral', Number(cfg.RN_PROMEDIO_MINIMO).toFixed(1));
    poner('cfgMaxEst', cfg.RN_MAX_ESTUDIANTES);
    poner('cfgCancelacion', cfg.RN_HORAS_CANCELACION);
    poner('cfgSesion', cfg.RN_MINUTOS_SESION);
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo cargar la configuración', 'error');
  }
}

// Devuelve el problema de un parámetro según los límites del propio campo, o una cadena vacía.
function problemaConfig(campo) {
  const validez = campo.validity;
  if (validez.valueMissing || validez.badInput) return 'Escribe un número';
  if (validez.rangeUnderflow || validez.rangeOverflow) return 'Debe estar entre ' + Number(campo.min) + ' y ' + Number(campo.max);
  if (validez.stepMismatch) return campo.step === '0.1' ? 'Usa un solo decimal' : 'Debe ser un número entero';
  return '';
}

// Guarda un parámetro con la clave que leen las reglas del servidor.
async function guardarConfig(idInput, nombre, boton) {
  const campo = document.getElementById(idInput);
  const clave = CLAVES_CONFIG[idInput];
  if (!campo || !clave) return;

  quitarError(idInput);
  const problema = problemaConfig(campo);
  if (problema) {
    ponerError(idInput, problema);
    mostrarTostada(nombre + ': ' + problema.charAt(0).toLowerCase() + problema.slice(1), 'error');
    campo.focus();
    return;
  }
  await conOcupado(boton, async () => {
    try {
      const resp = await llamarAPI('/admin/configuracion', 'POST', { clave, valor: campo.value });
      campo.value = idInput === 'cfgUmbral' ? Number(resp.valor).toFixed(1) : resp.valor;
      mostrarTostada(nombre + ' actualizado a ' + (idInput === 'cfgUmbral' ? numeroCO(resp.valor, 1) : resp.valor), 'exito');
      cargarReglas();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo guardar el parámetro', 'error');
    }
  });
}

// Lista los períodos académicos con su estado y el botón para activar los próximos.
async function cargarPeriodos() {
  const generacion = generacionAdmin;
  const contenedor = document.getElementById('listaPeriodos');
  if (!contenedor) return;
  try {
    const periodos = await llamarAPI('/admin/periodos', 'GET');
    if (generacion !== generacionAdmin) return;
    estadoConfig.periodos = periodos;
    estadoConfig.periodoActivo = periodos.find((p) => p.estado === 'activo') || null;

    const botonCerrar = document.getElementById('btnCerrarPeriodo');
    if (botonCerrar) {
      botonCerrar.disabled = !estadoConfig.periodoActivo;
      botonCerrar.textContent = estadoConfig.periodoActivo ? 'Cerrar período ' + estadoConfig.periodoActivo.nombre : 'Sin período activo';
    }
    const hayActivo = Boolean(estadoConfig.periodoActivo);
    contenedor.innerHTML = periodos.length
      ? periodos.map((p) => {
        const estado = ESTADOS_PERIODO[p.estado] || { texto: p.estado, insignia: 'neutro' };
        const activar = p.estado === 'proximo'
          ? '<button type="button" class="btn btn--s" data-admin="activar-periodo" data-id="' + Number(p.id) + '" data-nombre="' + escaparHtml(p.nombre) + '"' +
            (hayActivo ? ' disabled title="Cierra primero el período activo"' : '') + '>Activar</button>'
          : '';
        return '<div class="periodo"><div class="periodo__datos"><p class="periodo__nombre">Período ' + escaparHtml(p.nombre) + '</p>' +
          '<p class="periodo__fechas">' + fechaCorta(p.inicio) + ' — ' + fechaCorta(p.fin) + '</p></div>' +
          '<span class="insignia insignia--' + estado.insignia + '">' + estado.texto + '</span>' + activar + '</div>';
      }).join('')
      : estadoVacio({ icono: 'calendario', titulo: 'Aún no hay períodos', texto: 'Crea el primero para empezar a generar reportes.', compacto: true });
  } catch (err) {
    if (generacion === generacionAdmin) contenedor.innerHTML = estadoError(err.mensaje, 'cargarPeriodos()');
  }
}

// Activa un período próximo después de pedir confirmación.
async function activarPeriodo(id, nombre, boton) {
  const acepta = await confirmarAccion({
    titulo: '¿Activar el período ' + nombre + '?',
    texto: 'Será el período activo de los reportes y de los indicadores del panel.',
    confirmar: 'Activar período',
    tipo: 'info',
    icono: 'calendario-ok',
  });
  if (!acepta) return;
  await conOcupado(boton, async () => {
    try {
      const resp = await llamarAPI('/admin/periodos/' + id + '/activar', 'PATCH');
      mostrarTostada(resp.mensaje || 'Período activado', 'exito');
      await cargarPeriodos();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo activar el período', 'error');
    }
  });
}

// Sugiere el nombre del siguiente período que todavía no existe.
function siguientePeriodoSugerido() {
  const existentes = new Set(estadoConfig.periodos.map((p) => String(p.nombre).toLowerCase()));
  const hoy = hoyColombiaISO();
  let semestre = Number(hoy.slice(5, 7)) <= 6 ? 2 : 1;
  let anio = Number(hoy.slice(0, 4)) + (semestre === 1 ? 1 : 0);
  for (let intentos = 0; intentos < 8 && existentes.has(anio + '-' + semestre); intentos++) {
    if (semestre === 1) {
      semestre = 2;
    } else {
      semestre = 1;
      anio += 1;
    }
  }
  return anio + '-' + semestre;
}

// Abre la ventana para crear un período académico con un nombre sugerido.
function crearNuevoPeriodo() {
  const formulario = document.getElementById('formularioPeriodo');
  if (!formulario) return;
  formulario.reset();
  limpiarErrores(formulario);
  document.getElementById('npNombre').value = siguientePeriodoSugerido();
  abrirDialogo('dialogoPeriodo');
  document.getElementById('npNombre').focus();
}

// Muestra el error del servidor junto al campo del período que lo causó.
function mostrarErrorPeriodo(err) {
  const texto = (err.mensaje || '').toLowerCase();
  const campo = texto.includes('ya existe') ? 'npNombre' : texto.includes('se cruzan') ? 'npInicio' : texto.includes('nombre') ? 'npNombre' : '';
  if (campo) {
    ponerError(campo, err.mensaje);
    enfocarPrimerError(document.getElementById('formularioPeriodo'));
  } else {
    mostrarTostada(err.mensaje || 'No se pudo crear el período', 'error');
  }
}

// Valida y envía el formulario de un nuevo período.
async function guardarNuevoPeriodo(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const nombre = valorDe('npNombre');
  const inicio = valorDe('npInicio');
  const fin = valorDe('npFin');
  if (!nombre) ponerError('npNombre', 'Escribe el nombre del período');
  else if (!textoSinSimbolos(nombre)) ponerError('npNombre', 'El nombre no admite los símbolos < > " ` \\');
  if (!inicio) ponerError('npInicio', 'Selecciona la fecha de inicio');
  if (!fin) ponerError('npFin', 'Selecciona la fecha de cierre');
  else if (inicio && inicio >= fin) ponerError('npFin', 'Debe ser posterior a la fecha de inicio');
  if (formulario.querySelector('.campo--invalido')) {
    enfocarPrimerError(formulario);
    return;
  }

  await conOcupado(document.getElementById('btnGuardarPeriodo'), async () => {
    try {
      await llamarAPI('/admin/periodos', 'POST', { nombre, inicio, fin });
      cerrarDialogo('dialogoPeriodo');
      mostrarTostada('Período ' + nombre + ' creado', 'exito');
      await cargarPeriodos();
    } catch (err) {
      mostrarErrorPeriodo(err);
    }
  });
}

// Texto, tono y ejecución de cada acción crítica de la configuración.
function accionCritica(clave) {
  const periodo = estadoConfig.periodoActivo;
  const acciones = {
    'cerrar-periodo': periodo && {
      titulo: '¿Cerrar el período ' + periodo.nombre + '?',
      texto: 'Dejará de ser el período activo de los reportes y no se vuelve a abrir. Las tutorías registradas se conservan. Después puedes activar un período próximo.',
      confirmar: 'Cerrar período',
      tipo: 'peligro',
      icono: 'candado',
      ejecutar: async () => {
        const resp = await llamarAPI('/admin/periodos/' + periodo.id + '/cerrar', 'PATCH');
        await cargarPeriodos();
        mostrarTostada(resp.mensaje || 'Período cerrado', 'exito');
      },
    },
    'archivar-auditoria': {
      titulo: '¿Archivar la auditoría antigua?',
      texto: 'Los registros con más de 90 días salen del listado principal. No se borran: los consultas con «Ver archivados» en Auditoría.',
      confirmar: 'Archivar',
      tipo: 'info',
      icono: 'archivo',
      ejecutar: async () => {
        const resp = await llamarAPI('/admin/auditoria/archivar', 'POST', {});
        mostrarTostada(resp.mensaje, resp.archivados ? 'exito' : 'info');
      },
    },
    'restablecer-configuracion': {
      titulo: '¿Restablecer la configuración?',
      texto: 'Los parámetros vuelven a sus valores por defecto: umbral de alerta 3,0, máximo de 15 estudiantes por tutor, 24 horas para cancelar y 15 minutos de inactividad.',
      confirmar: 'Restablecer',
      tipo: 'peligro',
      icono: 'deshacer',
      ejecutar: async () => {
        await llamarAPI('/admin/configuracion/reset', 'POST', {});
        await cargarConfiguracion();
        cargarReglas();
        mostrarTostada('Configuración restablecida a los valores por defecto', 'exito');
      },
    },
  };
  return acciones[clave] || null;
}

// Pide confirmación y ejecuta una acción crítica; ignora un segundo clic mientras la primera sigue en curso.
async function confirmarAccionCritica(clave) {
  if (estadoConfig.accionCritica) return;
  const accion = accionCritica(clave);
  if (!accion) {
    mostrarTostada('No hay un período activo para cerrar', 'advertencia');
    return;
  }
  const acepta = await confirmarAccion(accion);
  if (!acepta) return;

  estadoConfig.accionCritica = true;
  try {
    await accion.ejecutar();
  } catch (err) {
    mostrarTostada(err.mensaje || 'No se pudo completar la acción', 'error');
  } finally {
    estadoConfig.accionCritica = false;
  }
}

// Atiende por delegación el botón de activar períodos, porque las páginas se restablecen al cerrar sesión.
document.addEventListener('click', (e) => {
  const boton = e.target.closest('#listaPeriodos [data-admin="activar-periodo"]');
  if (boton && !boton.disabled) activarPeriodo(Number(boton.dataset.id), boton.dataset.nombre, boton);
});
