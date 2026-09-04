# Configurar el inicio de sesión con Google

El código ya está listo (`passport.js`, `auth.routes.js`). El botón "Continuar
con Google" muestra el error *"El inicio de sesión con Google no está configurado"*
porque faltan tres variables de entorno con las credenciales de Google. Esta guía
las obtiene y las carga.

**Requisito confirmado:** los correos `@amigo.edu.co` son cuentas de Google
Workspace, así que el login funcionará con las cuentas institucionales.

---

## Parte 1 · Crear las credenciales en Google Cloud

Todo esto se hace una sola vez, con tu cuenta `@amigo.edu.co`.

### 1. Entra a Google Cloud Console
Abre **https://console.cloud.google.com** e inicia sesión.

### 2. Crea un proyecto
Arriba, junto al logo, clic en el selector de proyecto → **Proyecto nuevo**.
- Nombre: `ConectaProfe`
- **Crear**, y luego selecciónalo.

### 3. Configura la pantalla de consentimiento
Menú (☰) → **APIs y servicios** → **Pantalla de consentimiento de OAuth**.
- Tipo de usuario: **Interno** si te deja (limita el acceso a la organización
  `@amigo.edu.co`, que es justo lo que quieres). Si no aparece "Interno",
  elige **Externo**.
- **Crear** y llena lo mínimo:
  - Nombre de la app: `ConectaProfe`
  - Correo de asistencia: tu correo
  - Correo del desarrollador: tu correo
- Guarda y continúa hasta el final. (Si elegiste **Externo**, en la sección
  **Usuarios de prueba** agrega los correos que van a probar, o publica la app.)

### 4. Crea el ID de cliente OAuth
**APIs y servicios** → **Credenciales** → **Crear credenciales** →
**ID de cliente de OAuth**.
- Tipo de aplicación: **Aplicación web**
- Nombre: `ConectaProfe web`
- **Orígenes de JavaScript autorizados** → Agregar URI:
  ```
  https://profe-conecta-production-e40c.up.railway.app
  ```
- **URIs de redireccionamiento autorizados** → Agregar URI (¡exacta!):
  ```
  https://profe-conecta-production-e40c.up.railway.app/api/auth/google/callback
  ```
  > Si vas a probar también en local, agrega además:
  > `http://localhost:3000/api/auth/google/callback`
- **Crear**.

### 5. Copia las dos credenciales
Google te muestra:
- **ID de cliente** — algo como `123456789-abc...apps.googleusercontent.com`
- **Secreto de cliente** — algo como `GOCSPX-....`

Cópialos. El secreto no lo compartas por chat ni lo subas al repositorio.

---

## Parte 2 · Cargar las variables en Railway

En tu servicio **profe-conecta** → pestaña **Variables** → agrega tres:

| Variable | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | el ID de cliente que copiaste |
| `GOOGLE_CLIENT_SECRET` | el secreto de cliente |
| `GOOGLE_CALLBACK_URL` | `https://profe-conecta-production-e40c.up.railway.app/api/auth/google/callback` |

Ya deberías tener también `DOMINIO_CORREO=@amigo.edu.co` (limita el login a la
universidad). Si no está, agrégala.

Railway redespliega solo al guardar. En el log de arranque, si las credenciales
están, el login con Google queda activo (el código lo detecta con `oauthActivo`).

---

## Parte 3 · Probar

1. Entra a la app y pulsa **Continuar con Google**.
2. Inicia sesión con una cuenta `@amigo.edu.co`.
3. La primera vez, Google pide autorizar la app; acepta.
4. Vuelves a ConectaProfe ya con sesión iniciada.

Si intentas con un correo que **no** sea `@amigo.edu.co`, el sistema lo rechaza
a propósito con "Solo cuentas @amigo.edu.co".

---

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| `redirect_uri_mismatch` | La URI de redireccionamiento en Google no coincide **exactamente** con la de arriba (revisa `https`, sin barra final, y el `/api/auth/google/callback`). |
| Sigue diciendo "no está configurado" | Las variables no quedaron en el servicio correcto, o el redespliegue no terminó. Revísalas en Railway y espera el nuevo deploy. |
| "Acceso bloqueado / app no verificada" | La pantalla de consentimiento está en modo Externo sin publicar: agrega tu correo como usuario de prueba, o publícala. |
| Entra cualquier correo, no solo @amigo | Falta `DOMINIO_CORREO=@amigo.edu.co` en Railway. |

---

## Cómo funciona por dentro (para la auditoría)

- El token de Google **no viaja en la URL**: el backend genera un código de un
  solo uso que vence en 60 segundos, y el frontend lo canjea por el JWT vía POST
  (`/api/auth/google/canjear`). Evita filtrar el token en el historial y los logs.
- Solo se aceptan correos del dominio institucional y verificados por Google.
- Si las credenciales no están, el login con Google se desactiva solo, sin
  romper el resto del sistema.
