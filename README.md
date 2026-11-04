# ConectaProfe 🎓

Sistema de seguimiento académico y gestión de tutorías para la **Universidad Católica Luis Amigó (FUNLAM)**, Medellín.

Conecta estudiantes con docentes tutores, detecta alertas académicas por promedio y centraliza la programación y el seguimiento de las sesiones.

**Aplicación en producción:** https://profe-conecta-production-e40c.up.railway.app

---

## Índice

- [Qué hace](#qué-hace)
- [Arquitectura](#arquitectura)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Primer administrador](#primer-administrador)
- [Pruebas](#pruebas)
- [Despliegue](#despliegue)
- [Seguridad](#seguridad)
- [Documentación](#documentación)
- [Cómo contribuir](#cómo-contribuir)

---

## Qué hace

| Rol | Puede |
|---|---|
| **Estudiante** | Ver su promedio y alertas, programar tutorías, consultar su calendario y completar su perfil |
| **Docente** | Ver sus estudiantes asignados y los que están en alerta, programar y registrar sesiones, publicar su horario de atención |
| **Administrador** | Gestionar usuarios, asignar estudiantes a tutores, enviar notificaciones, configurar reglas de negocio, abrir y cerrar períodos y consultar la auditoría |

Reglas de negocio destacadas: alerta automática con promedio inferior a 3,0; cancelación con 24 horas de anticipación; bloqueo temporal tras varios intentos de acceso fallidos. Todas parametrizables desde el panel de administración.

---

## Arquitectura

```
profe-conecta/
├── src/                      Código fuente principal (API en Node.js + Express)
│   ├── server.js             Arranque: espera la base, migra y escucha
│   ├── app.js                Express: seguridad, CORS, rutas, errores
│   ├── config/               Base de datos, JWT, OAuth, esquema, datos iniciales y reglas
│   ├── controllers/          Lógica de cada recurso (admin/ tiene un controlador por tema)
│   ├── middlewares/          Autenticación, roles, límites, validación de ids y errores
│   └── routes/               Definición de endpoints
├── scripts/                  Respaldo, restauración, diagnóstico y reparación de la base
├── tests/                    Pruebas con Jest y Supertest
├── frontend/                 SPA en JavaScript sin framework
│   ├── index.html            Todas las vistas como secciones
│   ├── css/                  Variables, base, componentes, estructura y páginas
│   ├── fonts/                Tipografías IBM Plex servidas por el propio sitio
│   ├── img/                  Íconos (sprite SVG), marca y favicon
│   └── js/                   Un archivo por dominio funcional
├── docs/                     Documentación de la base de datos
├── .github/                  Integración continua y plantillas de issues
├── LICENSE
├── README.md
└── package.json
```

**Decisiones de diseño**

- **SPA sin framework.** El frontend es JavaScript plano: no hay build ni dependencias que mantener. Las vistas son secciones del mismo HTML y se alternan con `irAPagina()`.
- **Autenticación por JWT, sin sesiones de servidor.** El backend no guarda estado, así que puede escalar a varias instancias sin almacén compartido.
- **La migración corre en cada arranque.** Es idempotente: crea lo que falte y corrige lo que esté mal, sin tocar lo que ya está bien.

### Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 18+, Express 5 |
| Base de datos | PostgreSQL 16 |
| Autenticación | JWT (HS256) + Google OAuth 2.0 |
| Seguridad | helmet, express-rate-limit, bcrypt (12 rondas) |
| Pruebas | Jest + Supertest |
| Despliegue | Railway (Nixpacks) |

---

## Puesta en marcha

**Requisitos:** Node.js 18 o superior y PostgreSQL 16.

```bash
git clone https://github.com/seabastian77/profe-conecta.git
cd profe-conecta

cp .env.example .env             # y llena los valores
npm install

npm run db:init                  # crea las tablas y los datos de ejemplo
npm run dev                      # http://localhost:3000
```

Fuera de producción, el seed crea 10 docentes y 10 estudiantes de ejemplo con la contraseña `123456` (en producción solo se crean con `SEMBRAR_DATOS_DEMO=true`). **Bórralos o cámbiales la contraseña antes de cualquier uso real.**

### Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Arranca en modo producción |
| `npm run dev` | Arranca con recarga automática (nodemon) |
| `npm run db:init` | Ejecuta las migraciones y el seed |
| `npm run db:respaldo` | Crea un respaldo comprimido de la base, con huella SHA-256, y lo verifica |
| `npm run db:restaurar` | Restaura un respaldo en una base vacía o, con `--reemplazar --confirmar`, sobre una con datos (antes guarda una copia) |
| `npm run db:diagnostico` | Revisa la base en solo lectura: índices, duplicados, hashes inválidos y, con `--profundo`, contraseñas publicadas |
| `npm run db:reparar` | Muestra qué corregiría; con `--aplicar` hace copia previa y repara sin borrar filas |
| `npm test` | Corre la suite de pruebas |
| `npm run test:cobertura` | Pruebas con informe de cobertura |
| `npm run lint` | Análisis estático (ESLint) del servidor, las pruebas, los scripts y el JavaScript del navegador |
| `npm run auditoria` | Revisa vulnerabilidades en las dependencias |

---

## Variables de entorno

Copia `.env.example` y completa los valores. Todo lo obligatorio está marcado.

| Variable | Obligatoria | Descripción |
|---|:--:|---|
| `DATABASE_URL` | ✅ | Cadena de conexión a PostgreSQL |
| `DATABASE_PUBLIC_URL` | | Solo para los comandos `db:*` desde tu computador: en Railway, la URL pública del servicio Postgres |
| `JWT_SECRET` | ✅ en producción | Secreto para firmar los tokens. **Sin él el servidor no arranca** |
| `FRONTEND_URL` | ✅ en producción | URL exacta del frontend, sin barra final. Define la lista blanca de CORS |
| `DOMINIO_CORREO` | | Dominio institucional permitido. Por defecto `@amigo.edu.co` |
| `NODE_ENV` | | `production` activa HSTS, oculta los detalles de error y exige el secreto |
| `PORT` | | Puerto de escucha. Por defecto 3000 |
| `JWT_EXPIRES_IN` | | Vigencia del token. Por defecto `8h` |
| `MAX_INTENTOS` | | Intentos fallidos antes de bloquear. Por defecto 3 |
| `MINUTOS_BLOQUEO` | | Duración del bloqueo. Por defecto 5 |
| `GOOGLE_CLIENT_ID` | | Si falta, el inicio de sesión con Google se desactiva solo |
| `GOOGLE_CLIENT_SECRET` | | |
| `GOOGLE_CALLBACK_URL` | | URL de retorno registrada en Google Cloud |
| `ADMIN_INICIAL_CORREO` | | Solo para crear el primer administrador |
| `ADMIN_INICIAL_CONTRASENA` | | |
| `ADMIN_INICIAL_RESTABLECER` | | `true` durante un solo arranque para restablecer la contraseña de un administrador existente |
| `SEMBRAR_DATOS_DEMO` | | `true` crea las cuentas de ejemplo también en producción. Déjala sin definir en una base real |
| `DB_POOL_MAX`, `DB_CONEXION_MS`, `DB_CONSULTA_MS` | | Conexiones máximas del pool (10) y tiempo máximo para conectar (15000 ms) y para una consulta (30000 ms) |
| `ZONA_HORARIA` | | Zona horaria de la sesión en la base de datos. Por defecto `America/Bogota` |

Genera un secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Primer administrador

El registro público **solo acepta los roles estudiante y docente**: permitir que cualquiera se creara una cuenta de administrador desde el formulario abierto sería una escalada de privilegios.

Para crear el primero, define estas dos variables y reinicia:

```
ADMIN_INICIAL_CORREO=tu.correo@amigo.edu.co
ADMIN_INICIAL_CONTRASENA=una-contraseña-larga
```

Se usan **una sola vez**: si ya existe un administrador, se ignoran. Cambia la contraseña al entrar y borra las variables. Si más adelante olvidas esa contraseña, define también `ADMIN_INICIAL_RESTABLECER=true` durante un solo arranque.

---

## Pruebas

```bash
npm test
```

Las pruebas que necesitan base de datos se **saltan** si no hay `DATABASE_URL`, para que la suite corra en cualquier máquina. Con base configurada se ejecutan todas.

Cubren firma y verificación de tokens (incluido el rechazo del algoritmo `none`), códigos OAuth de un solo uso, control de acceso por rol, validación del registro, cabeceras de seguridad y que un error en un handler asíncrono no derribe el proceso. También cubren las reglas de reservas, la administración, el esquema y la integridad de la base, los comandos de respaldo y reparación, y que la interfaz siga siendo compatible con la política de contenido.

Las pruebas que tocan la base escriben datos de prueba, así que usa una base local: se niegan a correr si `DATABASE_URL` apunta a Railway. Las de esquema y mantenimiento crean además bases temporales que se borran solas.

---

## Despliegue

Railway despliega automáticamente al hacer push a `main`. La configuración está en `railway.json`: las dependencias se instalan en la fase de build y el healthcheck apunta a `/api/ping`. `/api/salud` comprueba además la base de datos y responde 503 si no hay conexión.

**Antes del primer despliegue** carga `JWT_SECRET`, `FRONTEND_URL`, `DOMINIO_CORREO` y `NODE_ENV=production` en las variables del servicio.

`DATABASE_URL` debe ser una **referencia** al servicio de PostgreSQL (`${{Postgres.DATABASE_URL}}`), no una URL pegada a mano: cuando Railway recrea la base, el host cambia y una copia literal queda apuntando al vacío.

El arranque reintenta la conexión a la base diez veces con espera creciente, porque la red privada de Railway tarda un momento en quedar lista y antes eso bastaba para tumbar el despliegue.

---

## Seguridad

- Contraseñas con bcrypt a 12 rondas; nunca se guardan ni se devuelven en claro
- JWT fijado a HS256 con emisor y audiencia verificados, lo que cierra el ataque de algoritmo `none`
- Cada petición revalida al usuario en la base: una cuenta desactivada, eliminada o con otro rol pierde el acceso al instante
- Sin secretos por defecto: en producción el servidor se niega a arrancar si falta `JWT_SECRET`
- CORS con lista blanca explícita en producción
- `helmet` con CSP, HSTS y `frame-ancestors: none`
- Límite de peticiones en los endpoints de autenticación y bloqueo por cuenta tras varios fallos
- Consultas parametrizadas en toda la capa de datos
- El registro de auditoría **sobrevive** al borrado de un usuario: la fila se conserva con el autor en `NULL`
- Los errores devuelven un mensaje genérico en producción, con una referencia corta para ubicarlos; el detalle solo va al log

Si encuentras un problema de seguridad, abre un issue **sin incluir datos sensibles** o escribe directamente a los responsables del repositorio.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/base-de-datos.md`](docs/base-de-datos.md) | Modelo de datos, integridad, concurrencia, migraciones, respaldo y pendientes |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Flujo de trabajo, convenciones y checklist antes de abrir un PR |

---

## Cómo contribuir

`main` está protegida: los cambios entran por Pull Request con al menos una aprobación. El detalle está en [`CONTRIBUTING.md`](CONTRIBUTING.md).

```bash
git checkout -b tipo/descripcion-corta
# ... cambios ...
npm test
git push -u origin tipo/descripcion-corta
```

---

## Equipo

Proyecto académico de la Universidad Católica Luis Amigó — Medellín, Colombia.
