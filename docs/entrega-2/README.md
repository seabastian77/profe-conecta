# Entregable 2 — Ejecución manual y gestión de defectos

Sistema bajo prueba: **ConectaProfe** · commit `693358a` (rama `main`)
Equipo F · Sebastián González González · Esteban Palencia

Este directorio reúne la entrega lista para subir al Campus Virtual, más la
evidencia que la respalda.

## Documentos

| Archivo | Qué es |
|---|---|
| `E2_F_Equipo.pdf` / `.docx` | Informe del Entregable 2: resumen ejecutivo, actualización del plan, ejecución de los dos ciclos, 14 defectos, pruebas exploratorias, métricas, evaluación y lecciones. |
| `IS071_T4_EquipoF.pdf` / `.docx` | Tarea 4: reporte profesional de ocho defectos, con la matriz de reproducción cruzada y el análisis por riesgo. |
| `E2_Registro_Ejecucion_EquipoF.xlsx` | Registro de ejecución (una fila por corrida), hoja de defectos, reproducción cruzada y métricas con gráfico. |
| `pruebas-consola.md` | Los cinco comandos `fetch()` que se pegan en la consola (F12), listos para copiar y pegar, con su resultado esperado. Es el Anexo D del informe y el Anexo F de la Tarea 4. |

## Evidencia

Las capturas están en `../../pruebas/e2/resultados/`, nombradas por caso, ciclo
y consecutivo (`EV-CP016-C1-01.png`), más los defectos exploratorios
(`EV-DEF07-C1-01.png`). Cada captura lleva impreso el caso, la URL, la hora de
Colombia, la versión del navegador y la respuesta del servidor.

- `pruebas/e2/resultados/ciclo-1/` — 34 casos en Chromium (escritorio).
- `pruebas/e2/resultados/ciclo-2/` — los 9 fallidos + 7 de riesgo alto, en una
  instancia independiente de Chromium.
- `pruebas/e2/resultados/defectos-exploratorios/` — DEF-05, 06, 07, 10 y 14.
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

# 5. Pruebas por consola (F12): CP-008, CP-018, CP-021, DEF-06, DEF-10.
#    Dejan la evidencia con el aspecto de la consola del navegador.
node pruebas/e2/consola.js
```

Los documentos (`.docx`, `.pdf`, `.xlsx`) y el gráfico se arman con los scripts
de `pruebas/e2/generar-docs/` a partir de esos `resultados.json`.

## Antes de entregar (lo único que falta, y es de ustedes)

Todo lo demás ya está hecho con datos reales. Esto no lo puede poner un script:

- [ ] **Firmar** la tabla de reparto interno en los dos documentos (hay línea para cada uno).
- [ ] Pegar en la portada los **enlaces reales**: carpeta compartida de evidencias (si la suben a Drive) y el proyecto de Qase, si lo van a mantener.
- [ ] **Contraste en Firefox** del ciclo 2: correr a mano los 16 casos del ciclo 2 en Firefox sobre Railway y confirmar que da igual (lo normal es que sí). Anotar la versión de Firefox.
- [ ] **CP-014 y CP-015 (Google)** en Railway, con una cuenta institucional y una de Gmail, y guardar las dos capturas.
- [ ] Revisar que el nombre del archivo final de la Tarea 4 sea el que pide el Campus (`IS071_T4_EquipoF.pdf`) y, si piden el E2 con otro nombre, renombrarlo.

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
