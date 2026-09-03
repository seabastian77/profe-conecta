# Cómo contribuir a ConectaProfe

Somos un equipo pequeño trabajando sobre un sistema que ya está en producción. Estas reglas existen para que nadie rompa el trabajo de otro y para que cualquiera pueda entender, meses después, por qué se hizo un cambio.

---

## Flujo de trabajo

**Nunca se hace commit directo a `main`.** La rama está protegida y todo entra por Pull Request.

```bash
git checkout main
git pull

git checkout -b tipo/descripcion-corta
# ... trabajas ...

cd backend && npm test        # debe pasar antes de subir

git push -u origin tipo/descripcion-corta
```

Luego abres el PR en GitHub y esperas una aprobación.

### Nombres de rama

| Prefijo | Para qué |
|---|---|
| `feat/` | Funcionalidad nueva |
| `fix/` | Corrección de un error |
| `seguridad/` | Cambios de seguridad |
| `docs/` | Solo documentación |
| `refactor/` | Reorganización sin cambio de comportamiento |
| `test/` | Solo pruebas |

Ejemplos: `fix/cancelar-tutoria-vencida`, `feat/exportar-reporte-pdf`.

---

## Mensajes de commit

Primera línea: **imperativo, en español, máximo 72 caracteres**, sin punto final.

Después una línea en blanco y el cuerpo, que responde **por qué**, no qué (el diff ya dice qué).

```
Corregir el crash al cancelar tutorías

HORAS_CANCELACION se usaba sin haberse definido nunca. Cada intento de
cancelar lanzaba ReferenceError y, al no estar capturado, Node mataba el
proceso entero. El valor sale ahora de configuracion.RN_HORAS_CANCELACION.
```

Evita `cambios`, `update`, `arreglos`, `asdf`. Dentro de seis meses nadie va a saber qué fue eso.

---

## Antes de abrir un PR

- [ ] `npm test` pasa en local
- [ ] No hay `console.log` de depuración olvidados
- [ ] Ningún secreto, contraseña ni token en el código
- [ ] Si cambiaste una regla de negocio, actualizaste `docs/requisitos.md`
- [ ] Si arreglaste un error, agregaste una prueba que falla sin tu arreglo
- [ ] Probaste el cambio en el navegador, no solo con `curl`

---

## Convenciones de código

**Idioma.** El código, los comentarios y los mensajes al usuario van en español. Solo quedan en inglés las palabras del lenguaje y las librerías (`function`, `await`, `router.get`).

**Comentarios.** Se comenta el *porqué*, no el *qué*. Un comentario que repite la línea siguiente sobra; uno que explica una decisión no obvia vale oro.

```js
// ❌ Incrementa el contador
contador++;

// ✅ El límite por IP es 20 veces el de cuenta a propósito: en la
// universidad todos salen por la misma IP pública y un solo usuario
// equivocándose bloquearía a todo el campus.
const MAX_INTENTOS_IP = MAX_INTENTOS * 20;
```

**Backend.** Un controlador por recurso. Toda consulta va parametrizada — nunca se concatena una variable dentro de SQL. Los handlers asíncronos van envueltos por `envolverControlador`, así una excepción devuelve 500 en vez de tumbar el servidor.

**Frontend.** Un archivo por dominio funcional. Las validaciones de formulario deben ser **idénticas** a las del backend: si difieren, el usuario recibe un error del servidor que el navegador debió haberle explicado antes.

**Base de datos.** Los cambios de esquema van en `migrate.js` y tienen que ser **idempotentes**: corren en cada arranque y no pueden romper nada al repetirse. Cualquier clave foránea hacia `usuarios` necesita una acción `ON DELETE` decidida a conciencia — `CASCADE` para registros operativos, `SET NULL` para auditoría e historial, que deben sobrevivir al borrado de la cuenta.

---

## Seguridad

Nunca subas al repositorio:

- Archivos `.env` (ya están en `.gitignore`, pero revisa antes de hacer commit)
- Contraseñas, tokens, claves de API o cadenas de conexión
- Volcados de base de datos con datos reales de estudiantes

El CI falla automáticamente si detecta un `.env` versionado.

Si vas a tocar autenticación, roles o permisos, dilo explícitamente en la descripción del PR para que la revisión sea más cuidadosa.

---

## Pruebas

Toda corrección de un error debería venir con una prueba que **falle sin el arreglo**. Así el error no vuelve en silencio.

```bash
cd backend
npm test                  # toda la suite
npm run test:cobertura    # con informe de cobertura
```

Las pruebas que necesitan base de datos se saltan solas si no hay `DATABASE_URL`. Para correrlas completas, levanta una PostgreSQL local y expórtala.

---

## Revisar un PR

Revisar no es solo mirar el diff:

1. Descarga la rama y **pruébala en el navegador**
2. Verifica que el CI esté en verde
3. Pregunta por lo que no entiendas — si no se entiende leyéndolo, falta un comentario
4. Aprueba solo cuando lo probaste, no solo cuando lo leíste
