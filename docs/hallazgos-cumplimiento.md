# ConectaProfe — Hallazgos de cumplimiento

Verificación del código contra `docs/requisitos.md`. Cada hallazgo se comprobó leyendo el archivo y la línea que se cita.

Fecha de la revisión: 1 de septiembre de 2026 · Commit base: `a3b04d2`

---

## Resumen

| | |
|---|---|
| Requisitos verificados | 10 |
| Cumplen | 3 |
| No cumplen | 3 |
| Desviaciones a decidir | 2 |
| Requisitos desactualizados | 1 |
| Corregidos por el PR #1 | 1 |

---

## ❌ No cumplen

### H-01 · RNF02 — La sesión no expira a los 15 minutos

> **RNF02:** "La sesión debe expirar automáticamente tras 15 minutos de inactividad del usuario." — Prioridad **Alta**

**Lo que hace el código:**

| Capa | Archivo | Valor real |
|---|---|---|
| Frontend | `frontend/js/config.js:17` | `MINUTOS_INACTIVIDAD: 120` → **2 horas** |
| Backend (JWT) | `backend/src/config/jwt.js:26` | `JWT_EXPIRES_IN \|\| '8h'` → **8 horas** |

**Severidad: alta.** El requisito pide 15 minutos y el sistema tolera 8 horas. En un equipo compartido de la universidad, la sesión de un estudiante sigue viva toda la jornada. Es el incumplimiento más grave de la lista porque afecta un control de seguridad, no una comodidad.

**Corrección:** `MINUTOS_INACTIVIDAD: 15` y `JWT_EXPIRES_IN=15m`. Ojo: con 15 minutos de vida del token hace falta renovarlo mientras el usuario trabaja, o lo va a sacar a mitad de un formulario. Lo honesto es implementar la renovación o **modificar el requisito** con justificación escrita.

---

### H-02 · RRN06 — Se pueden programar tutorías para el mismo día

> **RRN06:** "No es posible programar una tutoría para la fecha del mismo día; la fecha mínima de programación es el día siguiente." — Prioridad **Alta**

**Lo que hace el código** (`backend/src/controllers/tutoriasController.js:29`):

```js
if (new Date(`${fecha}T${hora}`) < new Date()) {
  return res.status(400).json({ error: 'La fecha no puede ser en el pasado' });
}
```

Solo rechaza el pasado. **Hoy a las 11 p. m. se acepta**, y la regla lo prohíbe.

**Y el frontend se contradice a sí mismo**, en el mismo archivo:

| Línea | Código | Permite |
|---|---|---|
| `frontend/js/app.js:90` | `fechaEl.min = new Date()...` | **hoy** |
| `frontend/js/app.js:223` | `campo.min = manana...` | **mañana** |

Dos formularios de la misma aplicación aplican reglas distintas. Este es el hallazgo más interesante para la auditoría: no es solo un incumplimiento, es una **inconsistencia interna** que demuestra que la regla nunca se implementó de forma centralizada.

**Corrección:** validar en el backend (es la capa que manda) que `fecha > hoy`, y unificar los dos `min` del frontend.

---

### H-03 · RF036 — El límite de 2 MB en la foto no existe

> **RF036:** "…cargar una foto de perfil desde el dispositivo con un límite de 2 MB." — Prioridad **Media**

**Lo que hace el código:** no hay ninguna validación de tamaño. Se revisó `frontend/js/perfil.js` (sin comprobación de `size`) y `backend/src/controllers/perfilController.js` (acepta el base64 sin medirlo). El único tope es el del cuerpo de la petición:

```js
// backend/src/app.js:81
app.use(express.json({ limit: '10mb' }));
```

Es decir, **el sistema acepta hasta 10 MB donde el requisito permite 2**. Como las fotos se guardan en base64 dentro de PostgreSQL, cada foto grande infla la base de datos.

**Corrección:** validar `archivo.size > 2 * 1024 * 1024` en el frontend y volver a comprobarlo en el backend (el frontend nunca es suficiente: se puede saltar).

---

## ⚠️ Desviaciones que hay que decidir

### H-04 · RRN01 — El bloqueo es a los 5 intentos, no a los 3

> **RRN01:** "Un usuario no puede intentar iniciar sesión más de **3** veces de forma incorrecta; al superar este límite, su acceso se bloquea durante 5 minutos." — Prioridad **Alta**

**Lo que hace el código** (`backend/src/controllers/authController.js:6`):

```js
const MAX_INTENTOS = parseInt(process.env.MAX_INTENTOS || '5');
```

Los 5 minutos de bloqueo **sí** cumplen. El número de intentos no: son 5 y deberían ser 3.

**Contexto honesto:** antes del PR #1 esta regla **no estaba implementada en absoluto** — `MAX_INTENTOS` y `MINUTOS_BLOQUEO` estaban declarados pero jamás se usaban, o sea que RRN01 era código muerto y el sistema aceptaba intentos infinitos. El PR la implementó, pero con 5.

**Decisión:** basta con poner la variable de entorno `MAX_INTENTOS=3` en Railway, sin tocar código. O justificar por escrito por qué 5 es un mejor equilibrio y actualizar el requisito. Cualquiera de las dos sirve; lo que no sirve es dejar la discrepancia sin documentar.

---

### H-05 · RRN02 — El requisito exige algo inseguro

> **RRN02:** "Todo usuario debe seleccionar un rol (Estudiante, Docente o **Administrador**) al momento de crear su cuenta."

**Lo que hace el código después del PR #1** (`authController.js`):

```js
body('rol').isIn(['estudiante', 'docente'])  // 'admin' ya no se acepta
```

**Aquí el defecto está en el requisito, no en el código.** Tal como está escrito, RRN02 obliga a que cualquier persona pueda registrarse desde el formulario público eligiendo "Administrador" y salir con control total del sistema. Eso es una **escalada de privilegios por diseño**.

El PR lo cerró a propósito: los administradores se crean desde el panel de administración, por otro administrador.

**Decisión:** modificar RRN02 para que diga *"Estudiante o Docente; las cuentas de Administrador las crea un administrador existente"*. Documentar el cambio y su motivo — en una auditoría, encontrar un requisito que **manda** abrir un hueco de seguridad es un hallazgo de peso, y corregirlo suma.

---

## 📝 Requisito desactualizado

### H-06 · RF032 — Ya no describe el sistema

> **RF032:** "Los botones de Google y Microsoft deben informar al usuario que esta función requiere backend." — Prioridad **Baja**

El inicio de sesión con Google **ya funciona** tras el PR #1 (`passport.js` reescrito). El requisito describe un estado anterior del sistema.

**Corrección:** reescribir RF032 para el comportamiento real de Google, y decidir si Microsoft se implementa o se retira del alcance.

---

## ✅ Cumplen

| Req. | Qué exige | Evidencia |
|---|---|---|
| **RNF05** | Contraseñas nunca en texto plano | `bcrypt` con 12 rondas en `authController.js`; la columna guarda solo el hash |
| **RRN08** | Unicidad del correo | `correo TEXT UNIQUE NOT NULL` en `migrate.js` + verificación previa en el registro |
| **RRN05** | Rutas privadas protegidas | `router.use(autenticar, soloRol('admin'))` cubre las 20 rutas de administración |

---

## ✅ Corregido por el PR #1

### RF005 — Longitud mínima de contraseña

> **RF005:** "El sistema debe rechazar contraseñas con menos de **8** caracteres."

| | Valor |
|---|---|
| Antes | `isLength({ min: 6 })` — **incumplía** |
| Ahora | `isLength({ min: 8 })` + exige letra y número — **cumple** |

Vale la pena señalarlo: el sistema llevaba tiempo **violando su propio requisito documentado** y nadie lo había notado. Ese es justamente el tipo de hallazgo que justifica hacer una auditoría.

---

## Cómo usar esto en el curso

Los hallazgos ya están en el formato que suele pedirse: requisito → evidencia en el código (archivo y línea) → severidad → recomendación.

Tres cosas que suman al sustentar:

1. **H-02 es el mejor hallazgo.** No es un olvido: son dos partes del mismo archivo aplicando reglas contrarias. Evidencia de que faltó una única fuente de verdad.
2. **H-05 invierte el guion.** Encontrar un requisito que ordena abrir un hueco de seguridad demuestra que auditaste el documento, no solo el código.
3. **RF005 y RRN01 muestran deriva.** Un requisito documentado que el código incumplía en silencio, y una regla de negocio que existía en papel pero era código muerto. Eso es exactamente lo que una auditoría busca destapar.

---

_Revisión de cumplimiento — ConectaProfe_
_Universidad Católica Luis Amigó (FUNLAM)_
