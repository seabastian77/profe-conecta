# Pruebas por consola del navegador (F12) — Equipo F

Estas cinco verificaciones se ejecutan pegando un `fetch()` en la pestaña **Consola**
de las herramientas del navegador (F12), con el token de la sesión. Prueban la capa
del servidor directamente, así que son las más cercanas a cómo se tantea una API.

Las rutas son **relativas** (`/api/...`): el mismo comando sirve en `localhost` y en
el entorno de Railway (http://localhost:3000 se usó para esta corrida).

> Si Chrome pide permiso para pegar en la consola, escribe `allow pasting` y Enter.

## CP-008 · Rechazo de registro con rol de administrador

**Requisito:** R1 · RRN02  
Un visitante intenta registrarse como administrador enviando la petición a mano.

```js
fetch("/api/auth/registro",{method:"POST",headers:{
  "Content-Type":"application/json"},
  body:JSON.stringify({nombres:"Intruso",apellidos:"Prueba",
  correo:"admin.consola@amigo.edu.co",contrasena:"Password123",
  rol:"admin"})}).then(r=>r.json()).then(console.log)
```

- **Resultado esperado:** La consola muestra {error: "Rol inválido"} y la pestaña Red, el código 400. No se crea la cuenta.
- **Resultado real:** La consola muestra {error: 'Rol inválido'} y la pestaña Red el código 400. El servidor no crea la cuenta de administrador.
- **Código HTTP:** 400 · **Estado:** Aprobado
- **Evidencia:** `pruebas/e2/resultados/consola/evidencias/EV-CP008-CONSOLA.png`

## CP-018 · Un estudiante no puede guardar un perfil de docente

**Requisito:** R4 · RRN05  
Un estudiante autenticado intenta usar el endpoint de perfil de docente (control de acceso por rol).

```js
fetch("/api/perfil/docente",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({cedula:"12345",facultad:"Ingenierías"})})
  .then(r=>r.json()).then(console.log)
```

- **Resultado esperado:** La consola muestra {error: "No tienes permiso para esto"} y la pestaña Red, el código 403. No se crea ningún perfil de docente.
- **Resultado real:** La consola muestra {error: 'No tienes permiso para esto'} y la pestaña Red el código 403. El servidor no crea ningún perfil de docente para el estudiante.
- **Código HTTP:** 403 · **Estado:** Aprobado
- **Evidencia:** `pruebas/e2/resultados/consola/evidencias/EV-CP018-CONSOLA.png`

## CP-021 · Rechazo de tutoría con docente inexistente

**Requisito:** R5 · R-03  
Se programa una tutoría con un docente que no existe; el servidor debe responder 404 sin caerse.

```js
fetch("/api/tutorias",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({docente_id:999999,
  asignatura:"Cálculo Diferencial",modalidad:"Virtual",
  fecha:"2027-02-15",hora:"10:00"})}).then(r=>r.json()).then(console.log)
```

- **Resultado esperado:** La consola muestra {error: "Docente no encontrado o inactivo"} y la pestaña Red, el código 404. Al recargar, la página carga normal: el servidor sigue arriba (no hay error 500).
- **Resultado real:** La consola muestra {error: 'Docente no encontrado o inactivo'} y la pestaña Red el código 404. Al recargar, la página carga normal y el servidor sigue arriba (no hay error 500).
- **Código HTTP:** 404 · **Estado:** Aprobado
- **Evidencia:** `pruebas/e2/resultados/consola/evidencias/EV-CP021-CONSOLA.png`

## DEF-06 · Una tutoría cancelada se marca «completada» por la API

**Requisito:** R6  
Una tutoría ya cancelada no debería admitir nuevas transiciones; por la API se puede marcar «realizada».

```js
fetch("/api/tutorias/6/realizada",{method:"PATCH",headers:{Authorization:"Bearer "+localStorage.getItem("cp.token")}}).then(r=>r.json()).then(console.log)
```

- **Resultado esperado:** El servidor debería rechazar el cambio (la tutoría está cancelada). En su lugar responde {mensaje: "Tutoría completada"} y la tutoría pasa a «completada»: DEFECTO.
- **Resultado real:** El servidor respondió 200 {mensaje: 'Tutoría completada'} y la tutoría cancelada pasó a «completada». Debería haberlo rechazado.
- **Código HTTP:** 200 · **Estado:** Defecto confirmado
- **Evidencia:** `pruebas/e2/resultados/consola/evidencias/EV-DEF06-CONSOLA.png`

## DEF-10 · La API guarda tutorías con fechas y horas que no existen

**Requisito:** R5  
El servidor no valida que la fecha y la hora existan; acepta «2027-13-45» y «25:99».

```js
fetch("/api/tutorias",{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "
  +localStorage.getItem("cp.token")},
  body:JSON.stringify({docente_id:9,asignatura:"Cálculo Diferencial",
  modalidad:"Virtual",fecha:"2027-13-45",hora:"25:99"})})
  .then(r=>r.json()).then(console.log)
```

- **Resultado esperado:** El servidor debería rechazar la fecha y la hora inválidas. En su lugar responde 201 {mensaje: "Tutoría programada"}: DEFECTO.
- **Resultado real:** El servidor respondió 201 {mensaje: 'Tutoría programada', id: 7}: acepta la fecha «2027-13-45» y la hora «25:99» sin validar que existan.
- **Código HTTP:** 201 · **Estado:** Defecto confirmado
- **Evidencia:** `pruebas/e2/resultados/consola/evidencias/EV-DEF10-CONSOLA.png`
