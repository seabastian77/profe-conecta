# Entregable 2 — Ejecución manual y gestión de defectos

Sistema bajo prueba: **ConectaProfe** · commit `693358a` (rama `main`)
Equipo F · Sebastián González González · Esteban Palencia

Este directorio reúne la entrega lista para subir al Campus Virtual, más la
evidencia que la respalda.

## Documentos

| Archivo | Qué es |
|---|---|
| `E2_F_Equipo.pdf` / `.docx` | Informe del Entregable 2: resumen ejecutivo, actualización del plan, ejecución de los dos ciclos, 14 defectos, pruebas exploratorias, métricas, evaluación y lecciones. Cada reporte de defecto lleva sus capturas debajo, el Anexo D trae las capturas de la consola y el Anexo E todas las capturas de los dos ciclos. |
| `IS071_T4_EquipoF.pdf` / `.docx` | Tarea 4: reporte profesional de ocho defectos, con la matriz de reproducción cruzada y el análisis por riesgo. El Anexo F trae las pruebas de consola con su captura y el Anexo G las capturas de los ocho defectos, citadas por número de figura en cada reporte. |
| `E2_Registro_Ejecucion_EquipoF.xlsx` | Registro de ejecución (una fila por corrida), hoja de defectos, reproducción cruzada y métricas con gráfico. |
| `pruebas-consola.md` | Los comandos que se pegan en la consola (F12), listos para copiar y pegar, con su resultado esperado y la captura de la consola debajo. Es el Anexo D del informe y el Anexo F de la Tarea 4. |

## Evidencia

Las capturas están en `../../pruebas/e2/resultados/`, nombradas por caso, ciclo
y consecutivo (`EV-CP016-C1-01.png`), más los defectos exploratorios
(`EV-DEF07-C1-01.png`). Cada captura lleva impreso el caso, la URL, la hora de
Colombia, la versión del navegador y la respuesta del servidor.

- `pruebas/e2/resultados/ciclo-1/` — 34 casos en Chromium (escritorio).
- `pruebas/e2/resultados/ciclo-2/` — los 9 fallidos + 7 de riesgo alto, en una
  instancia independiente de Chromium.
- `pruebas/e2/resultados/defectos-exploratorios/` — DEF-05, 06, 07, 10 y 14.
- `pruebas/e2/resultados/consola/` — las pruebas hechas desde la consola F12
  (CP-008, CP-018, CP-021, DEF-06, DEF-10 y DEF-13), con capturas que muestran
  el comando pegado y lo que respondió el sistema.
- Las pruebas de los ciclos que se hacen con código (CP-008, CP-018 y CP-021)
  también dejan su captura con el aspecto de la consola.
- Cada carpeta trae su `resultados.json` con el detalle completo por caso
  (estado, resultado real, llamadas a la API, diálogos y evidencia).

## Resultados en una línea

- **Ciclo 1:** 23 aprobados · 9 fallidos · 2 bloqueados (CP-014 y CP-015, Google) de 34.
- **Ciclo 2:** los 9 fallidos reaparecen estables; los 7 de riesgo alto siguen pasando.
- **14 defectos:** 1 crítico (verificado/corregido), 2 altos, 9 medios, 2 bajos.
- **Recomendación:** apto con condiciones.

## Cómo volver a ejecutar las pruebas

La ejecución está automatizada con Playwright sobre Chromium. Conduce la
aplicación como una persona y, donde la guía lo pide, lanza peticiones desde la
consola del navegador (F12) con el token de la sesión.

```bash
# 1. Base de datos y app (local, equivalente a Railway)
createdb conectaprofe
NODE_ENV=production TZ=UTC \
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/conectaprofe \
  JWT_SECRET=... FRONTEND_URL=http://localhost:3000 \
  ADMIN_INICIAL_CORREO=admin@amigo.edu.co ADMIN_INICIAL_CONTRASENA=... \
  node src/server.js

# 2. Ciclo 1 (los 34 casos)
ADMIN_CORREO=admin@amigo.edu.co ADMIN_CONTRASENA=... \
  node pruebas/e2/ejecutar.js --ciclo 1 --version 693358a

# 3. Ciclo 2 (fallidos + riesgo alto). Reinicia el servidor antes, para
#    reponer el límite de intentos por IP en memoria.
ADMIN_CORREO=admin@amigo.edu.co ADMIN_CONTRASENA=... \
  node pruebas/e2/ejecutar.js --ciclo 2 \
  --casos CP-007,CP-008,CP-013,CP-016,CP-017,CP-018,CP-019,CP-020,CP-021,CP-022,CP-024,CP-025,CP-031,CP-032,CP-033,CP-034

# 4. Defectos de las sesiones exploratorias
ADMIN_CORREO=admin@amigo.edu.co ADMIN_CONTRASENA=... node pruebas/e2/defectos.js

# 5. Pruebas por consola (F12): CP-008, CP-018, CP-021, DEF-06, DEF-10 y DEF-13.
#    Dejan la evidencia con el aspecto de la consola del navegador.
node pruebas/e2/consola.js
```

Los documentos (`.docx`, `.pdf`, `.xlsx`) y el gráfico se arman con los scripts
de `pruebas/e2/generar-docs/` a partir de esos `resultados.json`.

## Antes de entregar (lo único que falta, y es de ustedes)

Todo lo demás ya está hecho con datos reales. Esto no lo puede poner un script:

- [ ] **Firmar** la tabla de reparto interno en los dos documentos (hay línea para cada uno).
- [ ] Pegar en la portada los **enlaces reales**: carpeta compartida de evidencias (si la suben a Drive) y el proyecto de Qase, si lo van a mantener.
- [ ] **CP-014 y CP-015 (Google)** en Railway, con una cuenta institucional y una de Gmail.
- [ ] **Contraste en Firefox** del ciclo 2: correr a mano en Firefox, sobre Railway, los 16 casos del ciclo 2. Anotar la versión de Firefox.
- [ ] Revisar que el nombre del archivo final de la Tarea 4 sea el que pide el Campus (`IS071_T4_EquipoF.pdf`) y, si piden el E2 con otro nombre, renombrarlo.

### Dónde van esas capturas

Todo está en el **Anexo F** del Entregable 2 (`E2_F_Equipo.docx`, desde la página 76): una página por caso, con
su ficha y un recuadro punteado que dice «Pegue aquí la captura de…». Quién ejecuta cada caso y qué datos usar
está en la misma ficha.

Hay dos formas de llenarlo:

1. **La más fácil:** mándenle a Claude las capturas por el chat, cada una con el nombre que dice su recuadro
   (`EV-CP014-RAILWAY.png`, `EV-CP007-FIREFOX.png`, …) o diciendo de qué caso es, junto con lo que pasó
   (aprobado o fallido, y la versión de Firefox). Se guardan en `pruebas/e2/resultados/manual/`, se llena
   `manual.json` y se regeneran el informe, el registro xlsx y las métricas, para que todo cuadre.
2. **A mano en Word:** abrir `E2_F_Equipo.docx`, hacer clic dentro del recuadro, borrar el texto gris, pegar la
   captura con Ctrl+V y llenar «Estado obtenido», «Resultado real» y «Fecha y navegador». Al final borrar la nota
   gris del comienzo del Anexo F y guardar como PDF. Ojo: por este camino hay que cambiar también a mano el estado
   de CP-014 y CP-015 en la sección 3, en las métricas y en la hoja «Registro de ejecución» del xlsx.

En cada captura tiene que verse la barra de direcciones con la URL de Railway y, si se puede, la hora del computador.


## Notas de honestidad

- **Firefox.** La guía pide repetir el ciclo 2 en Firefox. El entorno de
  ejecución automatizada solo dispone de Chromium, así que el ciclo 2 se corrió
  en una instancia independiente de Chromium (ventana y almacenamiento nuevos
  por caso), lo que confirma que los fallos son estables entre corridas. El
  contraste específico en Firefox queda para ejecución manual del equipo sobre
  Railway.
- **Google (CP-014 y CP-015).** Quedan en estado «Bloqueado» porque la
  ejecución automatizada no tiene credenciales del proveedor; se ejecutan a mano
  en Railway con una cuenta institucional y una de Gmail.
- Las pruebas corren contra una copia local del mismo commit desplegado en
  Railway, para no ensuciar la base de producción.
