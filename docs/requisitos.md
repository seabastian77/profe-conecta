# ConectaProfe — Análisis de Requisitos

Documento de especificación de requisitos del sistema **ConectaProfe**, plataforma web de gestión de tutorías académicas para la Universidad Católica Luis Amigó (FUNLAM).

---

## 1. Requisitos Funcionales

### 1.1 Sistema (general)

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RF001 | Mostrar pantalla de bienvenida | El sistema debe mostrar una pantalla animada con barra de carga al iniciar, durante 1,8 segundos antes del login. | Alta | Sistema |
| RF002 | Registrar nueva cuenta | El sistema debe permitir crear una cuenta con nombres, apellidos, correo institucional, contraseña y rol, validando cada campo. | Alta | Sistema |
| RF003 | Verificar unicidad de correo | Si el correo ya tiene una cuenta registrada, el sistema debe rechazar el registro con un mensaje de error. | Alta | Sistema |
| RF004 | Confirmar contraseña en el registro | El usuario debe ingresar la contraseña dos veces; ambas deben ser idénticas para completar el registro. | Alta | Sistema |
| RF005 | Validar longitud mínima de contraseña | El sistema debe rechazar contraseñas con menos de 8 caracteres mostrando un mensaje de error. | Alta | Sistema |
| RF006 | Mostrar indicador de fortaleza de contraseña | Debe mostrarse en tiempo real un indicador de tres niveles (débil, media, fuerte) evaluando la contraseña ingresada. | Alta | Sistema |
| RF007 | Requerir aceptación de términos | El usuario debe marcar la casilla de aceptación de términos y política de datos antes de completar el registro. | Alta | Sistema |
| RF008 | Redirigir tras el registro | Tras crear la cuenta, el admin va a su panel directamente y los demás roles al formulario de completar perfil. | Alta | Sistema |
| RF009 | Mostrar formulario de perfil según el rol | Debe mostrarse únicamente el formulario del rol del usuario: admin, docente o estudiante. | Alta | Sistema |
| RF010 | Indicar avance del proceso de perfil | Debe mostrarse un indicador de pasos que refleje el progreso del usuario al completar su perfil. | Media | Sistema |
| RF011 | Navegar entre secciones sin recargar | La navegación entre secciones no debe recargar el navegador; solo se alterna la sección activa. | Alta | Sistema |
| RF013 | Actualizar título de la sección activa | Al navegar, el breadcrumb de la barra superior debe reflejar el nombre de la página actual. | Media | Sistema |
| RF014 | Resaltar ítem activo en el menú lateral | El ítem del menú correspondiente a la sección actual debe estar visualmente destacado. | Alta | Sistema |
| RF015 | Mostrar menú según el rol | El menú lateral debe mostrar solo las opciones del rol autenticado; sin sesión solo aparece el menú de acceso. | Alta | Sistema |
| RF016 | Abrir y cerrar menú en dispositivos móviles | En pantallas menores a 768 px el menú debe abrirse y cerrarse con el botón hamburguesa. | Media | Sistema |
| RF017 | Mostrar chip de usuario en la barra superior | La barra superior debe mostrar la inicial y el primer nombre del usuario autenticado en todo momento. | Alta | Sistema |
| RF018 | Validar campos en tiempo real | Cada campo debe validarse al perder el foco mostrando mensajes de error específicos sin enviar el formulario. | Alta | Sistema |
| RF019 | Marcar visualmente campos inválidos | Los campos con error deben resaltarse con borde rojo para guiar al usuario. | Alta | Sistema |
| RF020 | Alternar visibilidad de contraseña | Los campos de contraseña deben incluir un botón para mostrar u ocultar el texto ingresado. | Alta | Sistema |
| RF021 | Rechazar fechas pasadas en tutorías | El sistema debe rechazar el registro de tutorías con fecha anterior al día actual. | Media | Sistema |
| RF022 | Limpiar formulario tras programar tutoría | Tras guardar exitosamente, el sistema debe limpiar el formulario y redirigir al panel del usuario. | Media | Sistema |
| RF023 | Listar tutorías del usuario | El panel debe mostrar las tutorías del usuario activo ordenadas cronológicamente, diferenciando pendientes de realizadas. | Media | Sistema |
| RF024 | Calcular tasa de recuperación académica | El sistema debe calcular el porcentaje de estudiantes con promedio ≥ 3,0 sobre el total de perfiles registrados. | Media | Sistema |
| RF026 | Visualizar perfil completo | El sistema debe mostrar una vista con datos personales y datos del rol del usuario activo. | Alta | Sistema |
| RF027 | Mostrar aviso de perfil incompleto | Si el perfil no está completado, debe mostrarse un aviso con enlace directo al formulario correspondiente. | Media | Sistema |
| RF028 | Mostrar notificaciones emergentes | El sistema debe mostrar mensajes emergentes al completar cualquier acción, clasificados por tipo con desaparición automática. | Media | Sistema |
| RF029 | Recuperar contraseña | El sistema debe mostrar el flujo de recuperación de contraseña con confirmación visual, sin envío real de correo. | Media | Sistema |
| RF030 | Desplazar al inicio al navegar | Al cambiar de sección, el sistema debe desplazar la vista al inicio con animación suave. | Media | Sistema |
| RF031 | Mostrar barra de progreso de créditos | El perfil del estudiante debe incluir una barra visual del porcentaje de créditos aprobados respecto al total del programa. | Media | Sistema |
| RF032 | Login con proveedor externo | Los botones de Google y Microsoft deben informar al usuario que esta función requiere backend. | Baja | Sistema |
| RF033 | Mostrar horario de atención del docente | El perfil del docente debe incluir bloques de disponibilidad horaria; actualmente con datos de ejemplo. | Baja | Sistema |
| RF034 | Mostrar log de actividad reciente | El perfil del administrador debe incluir un registro de acciones recientes; actualmente con datos de ejemplo. | Baja | Sistema |

### 1.2 Estudiante

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RF035 | Guardar perfil de estudiante | El estudiante debe poder registrar código estudiantil, documento, programa académico, semestre, teléfono y promedio acumulado. | Alta | Estudiante |
| RF036 | Subir foto de perfil | El sistema debe permitir cargar una foto de perfil desde el dispositivo con un límite de 2 MB, mostrando la imagen de inmediato. | Media | Estudiante |
| RF037 | Programar tutoría | El sistema debe permitir registrar una tutoría especificando estudiante, tutor, asignatura, modalidad, fecha, hora y observaciones. | Media | Estudiante |
| RF038 | Mostrar métricas del estudiante | El panel debe mostrar tarjetas con promedio acumulado, semestre actual, total de tutorías y estado de alerta académica. | Baja | Estudiante |
| RF039 | Activar alerta por promedio bajo | Si el promedio es inferior a 3,0 el panel debe mostrar un aviso de alerta con recomendación de programar tutoría. | Media | Estudiante |
| RF040 | Mostrar contador de tutorías del mes | El panel debe indicar cuántas tutorías ha tenido el estudiante en el mes en curso. | Baja | Estudiante |

### 1.3 Docente

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RF041 | Guardar perfil de docente | El docente debe poder registrar cédula, código, facultad, teléfono y las asignaturas que imparte (mínimo una). | Alta | Docente |
| RF042 | Programar tutoría | El sistema debe permitir al docente registrar tutorías especificando todos los campos obligatorios del formulario. | Media | Docente |
| RF043 | Mostrar métricas del docente | El panel debe mostrar el número de estudiantes atendidos, alertas activas, tutorías del mes y tasa de recuperación. | Alta | Docente |
| RF044 | Identificar y listar estudiantes en alerta | El panel debe listar estudiantes con promedio inferior a 3,0 diferenciando por color según el nivel de riesgo. | Media | Docente |
| RF045 | Mostrar tutorías recientes en el perfil | El perfil del docente debe mostrar las últimas 4 sesiones de tutoría registradas. | Baja | Docente |

### 1.4 Administrador

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RF046 | Guardar perfil de administrador | El administrador debe poder registrar cédula, cargo, dependencia y teléfono en el formulario de perfil. | Alta | Administrador |
| RF047 | Mostrar métricas globales del sistema | El panel admin debe mostrar total de usuarios, perfiles completados, tutorías en el sistema y alertas académicas activas. | Alta | Administrador |
| RF048 | Listar usuarios registrados | El módulo de usuarios debe mostrar en tabla todos los usuarios del sistema con nombre, correo, rol y estado. | Alta | Administrador |
| RF049 | Filtrar usuarios en tiempo real | Debe permitirse filtrar la tabla de usuarios por texto libre, rol y estado, actualizando un contador de resultados visible. | Alta | Administrador |
| RF050 | Activar y desactivar cuentas de usuario | El administrador debe poder alternar el estado de una cuenta entre activo e inactivo con cambio visual inmediato. | Media | Administrador |
| RF051 | Enviar notificación al grupo de usuarios | El administrador debe poder enviar notificaciones especificando tipo, destinatario, asunto y mensaje. | Media | Administrador |
| RF052 | Registrar historial de notificaciones enviadas | Cada notificación enviada debe quedar registrada en tabla con fecha, tipo, destinatario, asunto y estado. | Media | Administrador |
| RF053 | Crear asignación estudiante-tutor | El administrador debe poder asignar un estudiante a un tutor seleccionando ambos de listas desplegables. | Media | Administrador |
| RF054 | Eliminar asignación estudiante-tutor | El administrador debe poder eliminar una asignación de la tabla con animación de desvanecimiento. | Media | Administrador |
| RF055 | Guardar parámetro de configuración | El administrador debe poder modificar parámetros del sistema con confirmación visual al guardar. | Media | Administrador |
| RF056 | Confirmar acciones críticas del sistema | Antes de ejecutar acciones irreversibles, el sistema debe solicitar confirmación explícita del administrador. | Media | Administrador |
| RF057 | Editar datos de un usuario | El sistema debe permitir al administrador editar los datos de un usuario; actualmente muestra una notificación informativa. | Baja | Administrador |

---

## 2. Requisitos No Funcionales

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RNF01 | Garantizar rendimiento | El sistema debe cargar completamente en menos de 3 segundos en una conexión de 10 Mbps. | Alta | Sistema |
| RNF02 | Expirar sesión | La sesión debe expirar automáticamente tras 15 minutos de inactividad del usuario. | Alta | Sistema |
| RNF03 | Ofrecer diseño responsivo | El sistema debe adaptarse a dispositivos con pantallas desde 360 px de ancho sin pérdida funcional. | Alta | Todos |
| RNF04 | Garantizar compatibilidad | El sistema debe funcionar en las dos versiones más recientes de Chrome, Firefox y Edge. | Alta | Todos |
| RNF05 | Proteger contraseñas | Las contraseñas no deben almacenarse ni mostrarse en texto plano en ningún momento. | Alta | Sistema |
| RNF06 | Validar formularios | Todos los campos de formulario deben validarse en tiempo real con mensajes de error claros en español. | Alta | Sistema |
| RNF07 | Permitir accesibilidad | La interfaz debe incluir atributos ARIA, etiqueta `lang='es'` y contraste mínimo 4.5:1 para texto normal. | Media | Sistema |
| RNF08 | Mantener código organizado | El código debe separarse en capas (HTML, CSS, JS) con modo estricto y secciones documentadas. | Media | Desarrollo |
| RNF09 | Ejecutar sin instalación | La aplicación debe ejecutarse directamente desde un navegador sin requerir instalación o plugins adicionales. | Alta | Todos |
| RNF10 | Manejar errores de almacenamiento | Las operaciones de `localStorage`/`sessionStorage` deben manejarse con `try-catch` para evitar fallos no controlados. | Alta | Sistema |

---

## 3. Reglas de Negocio

| N° | Nombre | Descripción | Prioridad | Rol |
|---|---|---|---|---|
| RRN01 | Limitar intentos de acceso | Un usuario no puede intentar iniciar sesión más de 3 veces de forma incorrecta; al superar este límite, su acceso se bloquea durante 5 minutos. | Alta | Todos |
| RRN02 | Asignar rol en el registro | Todo usuario debe seleccionar un rol (Estudiante, Docente o Administrador) al momento de crear su cuenta; no es posible registrarse sin un rol definido. | Alta | Visitante |
| RRN03 | Requerir perfil completo | Un usuario no puede acceder a las funcionalidades principales de su panel hasta haber completado los datos de su perfil según su rol. | Media | Autenticados |
| RRN04 | Confirmar contraseña en el registro | El usuario debe ingresar la contraseña dos veces durante el registro; ambas deben coincidir para completar la creación de la cuenta. | Alta | Visitante |
| RRN05 | Proteger rutas privadas | Ningún usuario sin sesión activa puede acceder a páginas protegidas; el sistema redirige automáticamente al inicio de sesión. | Alta | Sistema |
| RRN06 | Programar tutorías con fecha futura | No es posible programar una tutoría para la fecha del mismo día; la fecha mínima de programación es el día siguiente a la solicitud. | Alta | Estudiante, Docente |
| RRN07 | Marcar alerta académica | Un estudiante con promedio acumulado inferior a 3.0 es clasificado automáticamente como caso en alerta y aparece destacado en el panel del docente y del administrador. | Alta | Sistema |
| RRN08 | Mantener unicidad de correo | No pueden existir dos cuentas registradas con el mismo correo electrónico en el sistema. | Alta | Sistema |

---

_Documento de requisitos — ConectaProfe_
_Universidad Católica Luis Amigó (FUNLAM)_
