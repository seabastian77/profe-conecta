// Administración de usuarios: listado con filtros del servidor, creación, edición, estado y eliminación.

const CORREO_VALIDO = /^[^\s@<>"'`\\]+@[^\s@<>"'`\\]+\.[^\s@<>"'`\\]+$/;

const estadoUsuarios = { pagina: 1, porPagina: 20, total: 0, q: '', rol: '', estado: '', secuencia: 0, cargados: new Map() };

registrarLimpieza(() => {
  Object.assign(estadoUsuarios, { pagina: 1, total: 0, q: '', rol: '', estado: '', secuencia: estadoUsuarios.secuencia + 1, cargados: new Map() });
});

// Lee los filtros de la lista de usuarios desde la pantalla.
function leerFiltrosUsuarios() {
  estadoUsuarios.q = valorDe('buscarUsuario').slice(0, 80);
  estadoUsuarios.rol = valorDe('filtroRolUsuarios');
  estadoUsuarios.estado = valorDe('filtroEstadoUsuarios');
}

// Devuelve la fila de un usuario con sus botones de editar, activar o desactivar y eliminar.
function filaUsuario(usuario) {
  const id = Number(usuario.id);
  const nombre = escaparHtml(nombreUsuario(usuario));
  const activo = Number(usuario.activo) === 1;
  const esYo = id === Number(sesion.id);
  const esAdmin = usuario.rol === 'admin';

  const botonEstado = '<button type="button" class="btn btn--fantasma btn--s btn--icono" data-admin="estado" data-id="' + id + '"' +
    (esYo ? ' disabled' : '') + ' aria-label="' + (activo ? 'Desactivar' : 'Activar') + ' a ' + nombre + '" title="' +
    (esYo ? 'No puedes desactivar tu propia cuenta' : activo ? 'Desactivar cuenta' : 'Activar cuenta') + '">' + icono(activo ? 'desactivar' : 'activar', 's') + '</button>';
  const botonEliminar = '<button type="button" class="btn btn--fantasma-peligro btn--s btn--icono" data-admin="eliminar" data-id="' + id + '"' +
    (esAdmin ? ' disabled' : '') + ' aria-label="Eliminar a ' + nombre + '" title="' +
    (esAdmin ? 'Las cuentas de administrador no se eliminan' : 'Eliminar cuenta') + '">' + icono('eliminar', 's') + '</button>';
  const botonEditar = '<button type="button" class="btn btn--fantasma btn--s btn--icono" data-admin="editar" data-id="' + id + '" aria-label="Editar a ' + nombre + '" title="Editar datos">' +
    icono('editar', 's') + '</button>';

  return '<tr>' +
    celda('Usuario', personaUsuario(usuario, usuario.correo), 'celda-principal') +
    celda('Rol', escaparHtml(ETIQUETAS_ROL[usuario.rol] || usuario.rol)) +
    celda('Programa o facultad', escaparHtml(programaUsuario(usuario)), 'col-terciaria') +
    celda('Estado', insigniaUsuario(usuario)) +
    celda('Registro', fechaRegistro(usuario.creado_en), 'col-secundaria') +
    celda('', botonEditar + botonEstado + botonEliminar, 'acciones') + '</tr>';
}

// Carga la página actual de usuarios con los filtros y la búsqueda que hace el servidor.
async function cargarTablaUsuarios() {
  const cuerpo = document.getElementById('cuerpoTablaUsuarios');
  if (!cuerpo || !sesion.activa) return;
  leerFiltrosUsuarios();

  const generacion = generacionAdmin;
  const turno = ++estadoUsuarios.secuencia;
  const { pagina, porPagina, q, rol, estado } = estadoUsuarios;
  const consulta = new URLSearchParams({ limite: porPagina, pagina });
  if (q) consulta.set('q', q);
  if (rol) consulta.set('rol', rol);
  if (estado) consulta.set('estado', estado);

  try {
    const { datos, total } = await llamarAPIConTotal('/admin/usuarios?' + consulta);
    if (turno !== estadoUsuarios.secuencia || generacion !== generacionAdmin) return;

    estadoUsuarios.total = total;
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    if (pagina > paginas) {
      estadoUsuarios.pagina = paginas;
      cargarTablaUsuarios();
      return;
    }
    estadoUsuarios.cargados = new Map(datos.map((u) => [Number(u.id), u]));
    const hayFiltros = Boolean(q || rol || estado);
    cuerpo.innerHTML = datos.length
      ? datos.map(filaUsuario).join('')
      : filaMensaje(6, hayFiltros ? 'Ningún usuario coincide con la búsqueda' : 'Aún no hay usuarios registrados');
    pintarPaginacion(estadoUsuarios, { conteo: 'conteoUsuarios', pagina: 'usuariosPagina', anterior: 'usuariosAnterior', siguiente: 'usuariosSiguiente' }, ['usuario', 'usuarios']);
  } catch (err) {
    if (turno !== estadoUsuarios.secuencia || generacion !== generacionAdmin) return;
    cuerpo.innerHTML = filaError(6, err.mensaje, 'cargarTablaUsuarios()');
    ponerTexto('conteoUsuarios', 'No se pudo cargar el listado');
  }
}

const consultarUsuariosConRetraso = debounce(() => cargarTablaUsuarios(), 300);

// Aplica los filtros: los selectores consultan de inmediato y el cuadro de búsqueda espera a que se deje de escribir.
function filtrarTablaUsuarios(inmediato) {
  estadoUsuarios.pagina = 1;
  if (inmediato === true) cargarTablaUsuarios();
  else consultarUsuariosConRetraso();
}

// Avanza o retrocede una página en la lista de usuarios.
function cambiarPaginaUsuarios(salto) {
  estadoUsuarios.pagina = Math.max(1, estadoUsuarios.pagina + salto);
  cargarTablaUsuarios();
}

// Recarga la lista de usuarios y, si se está viendo el panel, también sus indicadores.
function refrescarUsuarios() {
  cargarTablaUsuarios();
  const panel = document.getElementById('pagina-panel-admin');
  if (panel && panel.classList.contains('activa')) cargarPanelAdmin();
}

// Prepara la ventana de usuario para crear uno nuevo o para editar el indicado.
function prepararDialogoUsuario(usuario) {
  const formulario = document.getElementById('formularioUsuario');
  if (!formulario) return;
  formulario.reset();
  limpiarErrores(formulario);

  const edicion = Boolean(usuario);
  const esYo = edicion && Number(usuario.id) === Number(sesion.id);
  document.getElementById('usuId').value = edicion ? usuario.id : '';
  document.getElementById('usuarioTitulo').textContent = edicion ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('usuarioDescripcion').textContent = edicion
    ? 'La contraseña solo cambia si escribes una nueva.'
    : 'La cuenta queda activa de inmediato.';
  document.getElementById('btnGuardarUsuario').textContent = edicion ? 'Guardar cambios' : 'Crear usuario';
  document.getElementById('usuContrasenaEtiqueta').textContent = edicion ? 'Nueva contraseña (opcional)' : 'Contraseña';
  document.getElementById('usuContrasena').placeholder = edicion ? 'Déjala vacía para no cambiarla' : 'Mínimo 8, con letras y números';

  if (edicion) {
    document.getElementById('usuNombres').value = usuario.nombres || '';
    document.getElementById('usuApellidos').value = usuario.apellidos || '';
    document.getElementById('usuCorreo').value = usuario.correo || '';
    document.getElementById('usuRol').value = usuario.rol || '';
    document.getElementById('usuPromedio').value = Number(usuario.promedio) > 0 ? String(Number(usuario.promedio)) : '';
  }
  document.getElementById('usuRol').disabled = esYo;
  document.getElementById('usuRol').title = esYo ? 'No puedes quitarte a ti mismo el rol de administrador' : '';
  alCambiarRolUsuario();
}

// Muestra el campo de promedio solo al editar a un estudiante.
function alCambiarRolUsuario() {
  const edita = Boolean(document.getElementById('usuId').value);
  const esEstudiante = document.getElementById('usuRol').value === 'estudiante';
  document.getElementById('usuPromedioCampo').classList.toggle('oculto', !(edita && esEstudiante));
}

// Abre la ventana para crear un usuario.
function abrirModalNuevoUsuario() {
  prepararDialogoUsuario(null);
  abrirDialogo('dialogoUsuario');
  document.getElementById('usuNombres').focus();
}

// Abre la ventana para editar un usuario ya cargado.
function abrirEditorUsuario(usuario) {
  prepararDialogoUsuario(usuario);
  abrirDialogo('dialogoUsuario');
  document.getElementById('usuNombres').focus();
}

// Muestra el error del servidor junto al campo que lo causó, o como mensaje si no corresponde a ninguno.
function mostrarErrorUsuario(err) {
  const texto = (err.mensaje || '').toLowerCase();
  const campo = err.status === 409 || texto.includes('correo') ? 'usuCorreo'
    : texto.includes('contraseña') ? 'usuContrasena'
    : texto.includes('promedio') ? 'usuPromedio'
    : texto.includes('nombres') ? 'usuNombres'
    : texto.includes('rol') ? 'usuRol'
    : '';
  if (campo) {
    ponerError(campo, err.mensaje);
    enfocarPrimerError(document.getElementById('formularioUsuario'));
  } else {
    mostrarTostada(err.mensaje || 'No se pudo guardar el usuario', 'error');
  }
}

// Valida y envía el formulario de creación o edición de un usuario.
async function guardarUsuario(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  limpiarErrores(formulario);

  const id = Number(document.getElementById('usuId').value) || 0;
  const datos = {
    nombres: valorDe('usuNombres'),
    apellidos: valorDe('usuApellidos'),
    correo: valorDe('usuCorreo').toLowerCase(),
    rol: valorDe('usuRol'),
  };
  const contrasena = document.getElementById('usuContrasena').value;
  const promedioVisible = !document.getElementById('usuPromedioCampo').classList.contains('oculto');
  const promedio = valorDe('usuPromedio');

  if (!datos.nombres) ponerError('usuNombres', 'Escribe los nombres');
  else if (!NOMBRE_PERSONA_VALIDO.test(datos.nombres)) ponerError('usuNombres', MENSAJE_NOMBRE_PERSONA);
  if (!datos.apellidos) ponerError('usuApellidos', 'Escribe los apellidos');
  else if (!NOMBRE_PERSONA_VALIDO.test(datos.apellidos)) ponerError('usuApellidos', MENSAJE_NOMBRE_PERSONA);
  if (!datos.correo) ponerError('usuCorreo', 'Escribe el correo');
  else if (datos.correo.length > 120 || !CORREO_VALIDO.test(datos.correo)) ponerError('usuCorreo', 'Escribe un correo válido');
  if (!datos.rol) ponerError('usuRol', 'Selecciona el rol');
  if (!id || contrasena) {
    const problema = problemaContrasena(contrasena);
    if (problema) ponerError('usuContrasena', problema);
  }
  if (promedioVisible && promedio !== '' && !(Number(promedio) >= 0 && Number(promedio) <= 5)) {
    ponerError('usuPromedio', 'El promedio debe estar entre 0 y 5');
  }
  if (formulario.querySelector('.campo--invalido')) {
    enfocarPrimerError(formulario);
    return;
  }

  const cuerpo = { ...datos };
  if (contrasena) cuerpo.contrasena = contrasena;
  if (id && promedioVisible) cuerpo.promedio = promedio === '' ? null : Number(promedio);

  await conOcupado(document.getElementById('btnGuardarUsuario'), async () => {
    try {
      if (id) await llamarAPI('/admin/usuarios/' + id, 'PUT', cuerpo);
      else await llamarAPI('/admin/usuarios', 'POST', cuerpo);
      cerrarDialogo('dialogoUsuario');
      mostrarTostada(id ? 'Cambios guardados' : 'Usuario ' + datos.nombres + ' ' + datos.apellidos + ' creado', 'exito');
      if (!id) estadoUsuarios.pagina = 1;
      refrescarUsuarios();
    } catch (err) {
      mostrarErrorUsuario(err);
    }
  });
}

// Activa o desactiva una cuenta; desactivarla pide confirmación.
async function cambiarEstadoUsuario(usuario, boton) {
  const activar = !Number(usuario.activo);
  const nombre = nombreUsuario(usuario);
  if (!activar) {
    const acepta = await confirmarAccion({
      titulo: '¿Desactivar la cuenta?',
      texto: nombre + ' no podrá iniciar sesión hasta que la actives de nuevo. Sus datos se conservan.',
      confirmar: 'Desactivar',
      tipo: 'peligro',
      icono: 'desactivar',
    });
    if (!acepta) return;
  }
  await conOcupado(boton, async () => {
    try {
      await llamarAPI('/admin/usuarios/' + usuario.id + '/estado', 'PATCH', { activo: activar });
      mostrarTostada('La cuenta de ' + nombre + (activar ? ' quedó activa' : ' quedó desactivada'), activar ? 'exito' : 'info');
      refrescarUsuarios();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo cambiar el estado de la cuenta', 'error');
    }
  });
}

// Elimina una cuenta de forma permanente después de pedir confirmación.
async function eliminarUsuario(usuario, boton) {
  const nombre = nombreUsuario(usuario);
  const acepta = await confirmarAccion({
    titulo: '¿Eliminar a ' + nombre + '?',
    texto: 'Se borran su cuenta, su perfil, sus tutorías y sus notificaciones. Esta acción no se puede deshacer.',
    confirmar: 'Eliminar',
    tipo: 'peligro',
    icono: 'eliminar',
  });
  if (!acepta) return;
  await conOcupado(boton, async () => {
    try {
      const resp = await llamarAPI('/admin/usuarios/' + usuario.id, 'DELETE');
      mostrarTostada(resp.mensaje || 'Usuario eliminado', 'exito');
      refrescarUsuarios();
    } catch (err) {
      mostrarTostada(err.mensaje || 'No se pudo eliminar el usuario', 'error');
    }
  });
}

// Atiende por delegación los botones de la tabla, porque las páginas se restablecen al cerrar sesión.
document.addEventListener('click', (e) => {
  const boton = e.target.closest('#cuerpoTablaUsuarios [data-admin]');
  if (!boton || boton.disabled) return;
  const usuario = estadoUsuarios.cargados.get(Number(boton.dataset.id));
  if (!usuario) return;
  const accion = boton.dataset.admin;
  if (accion === 'editar') abrirEditorUsuario(usuario);
  else if (accion === 'estado') cambiarEstadoUsuario(usuario, boton);
  else if (accion === 'eliminar') eliminarUsuario(usuario, boton);
});
