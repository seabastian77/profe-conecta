// Administración de asesorías: programación de sesiones y asignaciones entre estudiantes y tutores.

// Prepara la fecha mínima y máxima del formulario y carga asignaciones y sesiones programadas.
function iniciarAsignaciones() {
  const fecha = document.getElementById('claseFecha');
  if (fecha) {
    fecha.min = fechaMananaISO();
    fecha.max = sumarDiasISO(hoyColombiaISO(), 730);
  }
  actualizarTextosReglas();
  return Promise.all([cargarTablaAsignaciones(), cargarClasesProgramadas()]);
}

// Deja vacío el formulario de asesoría.
function limpiarFormularioAsesoria() {
  const pagina = document.getElementById('pagina-admin-asignacion');
  ['claseDocente', 'claseEstudiante'].forEach((campo) => {
    cancelarBusquedaAdmin(campo);
    cerrarSugerencias(campo);
    document.getElementById(campo).value = '';
    document.getElementById(campo + 'Id').value = '';
  });
  ['claseFecha', 'claseHora', 'claseObservaciones'].forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('claseModalidad').value = 'Virtual';
  cargarMateriasDeDocente('claseAsignatura', '', 'Primero elige el docente');
  limpiarErrores(pagina);
}

// Muestra el error del servidor junto al campo de la asesoría que lo causó.
function mostrarErrorClase(err) {
  const texto = (err.mensaje || '').toLowerCase();
  const campo = texto.includes('materia') ? 'claseAsignatura'
    : texto.includes('docente no encontrado') || texto.includes('tutor ya tiene') ? 'claseDocente'
    : texto.includes('estudiante no encontrado') ? 'claseEstudiante'
    : texto.includes('ya tiene una sesión') || texto.includes('hora') ? 'claseHora'
    : texto.includes('fecha') ? 'claseFecha'
    : '';
  if (campo) {
    ponerError(campo, err.mensaje);
    enfocarPrimerError(document.getElementById('pagina-admin-asignacion'));
  } else {
    mostrarTostada(err.mensaje || 'No se pudo programar la asesoría', 'error');
  }
}

// Valida y envía la programación de una asesoría.
async function confirmarProgramarClase() {
  const pagina = document.getElementById('pagina-admin-asignacion');
  limpiarErrores(pagina);

  const docenteId = Number(valorDe('claseDocenteId')) || 0;
  const estudianteId = Number(valorDe('claseEstudianteId')) || 0;
  const asignatura = valorDe('claseAsignatura');
  const fecha = valorDe('claseFecha');
  const hora = valorDe('claseHora');

  if (!docenteId) ponerError('claseDocente', 'Busca y elige un docente de la lista');
  if (!estudianteId) ponerError('claseEstudiante', 'Busca y elige un estudiante de la lista');
  if (!asignatura) ponerError('claseAsignatura', 'Selecciona la materia');
  const problemaFecha = fecha ? problemaFechaSesion(fecha) : 'Selecciona la fecha';
  if (problemaFecha) ponerError('claseFecha', problemaFecha);
  if (!hora) ponerError('claseHora', 'Selecciona la hora');
  if (pagina.querySelector('.campo--invalido')) {
    enfocarPrimerError(pagina);
    return;
  }

  await conOcupado(document.getElementById('btnCrearAsesoria'), async () => {
    try {
      const resp = await llamarAPI('/admin/programar-clase', 'POST', {
        docente_id: docenteId,
        estudiante_id: estudianteId,
        asignatura,
        fecha,
        hora,
        modalidad: valorDe('claseModalidad') || 'Virtual',
        observaciones: valorDe('claseObservaciones'),
      });
      mostrarTostada(resp.mensaje || 'Asesoría programada', 'exito');
      limpiarFormularioAsesoria();
      await Promise.all([cargarClasesProgramadas(), cargarTablaAsignaciones()]);
    } catch (err) {
      mostrarErrorClase(err);
    }
  });
}

// Devuelve la fila de una asignación activa con su botón para quitarla.
function filaAsignacion(a) {
  const estudiante = escaparHtml(a.nombre_estudiante);
  return '<tr>' +
    celda('Estudiante', '<span class="persona"><span class="persona__datos"><span class="persona__nombre">' + estudiante + '</span>' +
      (a.programa ? '<span class="persona__detalle">' + escaparHtml(a.programa) + '</span>' : '') + '</span></span>', 'celda-principal') +
    celda('Tutor', escaparHtml(a.nombre_docente)) +
    celda('Estado', '<span class="insignia insignia--ok">Activa</span>') +
    celda('', '<button type="button" class="btn btn--fantasma-peligro btn--s btn--icono" data-admin="quitar-asignacion" data-id="' + Number(a.id) +
      '" data-nombre="' + estudiante + '" aria-label="Quitar la asignación de ' + estudiante + '" title="Quitar asignación">' + icono('eliminar', 's') + '</button>', 'acciones') +
    '</tr>';
}

// Carga la tabla de asignaciones activas entre estudiantes y tutores.
async function cargarTablaAsignaciones() {
  const generacion = generacionAdmin;
  const cuerpo = document.getElementById('cuerpoTablaAsignaciones');
  if (!cuerpo) return;
  try {
    const { datos, total } = await llamarAPIConTotal('/admin/asignaciones');
    if (generacion !== generacionAdmin) return;
    ponerTexto('conteoAsignaciones', miles(total) + (total === 1 ? ' activa' : ' activas'));
    cuerpo.innerHTML = datos.length
      ? datos.map(filaAsignacion).join('')
      : filaMensaje(4, 'Todavía no hay asignaciones: se crean al programar una asesoría');
  } catch (err) {
    if (generacion === generacionAdmin) cuerpo.innerHTML = filaError(4, err.mensaje, 'cargarTablaAsignaciones()');
  }
}

// Quita una asignación activa después de pedir confirmación.
async function quitarAsignacion(id, nombre, boton) {
  const acepta = await confirmarAccion({
    titulo: '¿Quitar la asignación?',
    texto: 'Se quita el vínculo de ' + nombre + ' con su tutor. Las tutorías ya programadas no se cancelan.',
    confirmar: 'Quitar asignación',
    tipo: 'peligro',
    icono: 'eliminar',
  });
  if (!acepta) return;
  await conOcupado(boton, async () => {
    try {
      await llamarAPI('/admin/asignaciones/' + id, 'DELETE');
      mostrarTostada('Asignación de ' + nombre + ' eliminada', 'info');
      await cargarTablaAsignaciones();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo quitar la asignación', 'error');
    }
  });
}

// Carga las sesiones que el administrador programó, las más recientes primero.
async function cargarClasesProgramadas() {
  const generacion = generacionAdmin;
  const cuerpo = document.getElementById('cuerpoClasesProgramadas');
  if (!cuerpo) return;
  try {
    const { datos, total } = await llamarAPIConTotal('/admin/clases-programadas');
    if (generacion !== generacionAdmin) return;
    const filas = datos.map((c) => '<tr>' +
      celda('Materia', escaparHtml(c.asignatura || '—'), 'celda-principal') +
      celda('Docente', escaparHtml(c.nombre_docente || '—')) +
      celda('Estudiante', escaparHtml(c.nombre_estudiante || '—')) +
      celda('Fecha', formatearFecha(c.fecha)) +
      celda('Hora', escaparHtml(String(c.hora || '—').slice(0, 5))) + '</tr>').join('');
    cuerpo.innerHTML = datos.length
      ? filas + (total > datos.length ? filaMensaje(5, 'Se muestran las ' + datos.length + ' más recientes de ' + miles(total)) : '')
      : filaMensaje(5, 'Todavía no hay sesiones programadas');
  } catch (err) {
    if (generacion === generacionAdmin) cuerpo.innerHTML = filaError(5, err.mensaje, 'cargarClasesProgramadas()');
  }
}

// Atiende por delegación el botón de quitar asignaciones, porque las páginas se restablecen al cerrar sesión.
document.addEventListener('click', (e) => {
  const boton = e.target.closest('#cuerpoTablaAsignaciones [data-admin="quitar-asignacion"]');
  if (boton && !boton.disabled) quitarAsignacion(Number(boton.dataset.id), boton.dataset.nombre, boton);
});
