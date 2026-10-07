# Entregable 2 y Tarea 4 — Equipo F

Sistema bajo prueba: **ConectaProfe** en https://profe-conecta-production-e40c.up.railway.app (commit `693358a`).
Equipo F · Sebastián González González · Esteban Palencia

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `E2_Registro_Ejecucion_EquipoF.xlsx` | El registro que llenamos al ejecutar en Railway. Las columnas amarillas son nuestras: navegador, sistema operativo, fecha, estado, resultado real, evidencia, intentos, la reproducción cruzada y las notas de las sesiones exploratorias. La hoja «Métricas» se calcula sola. |
| `E2_F_Equipo.pdf` / `.docx` | Informe del Entregable 2. Se arma con el registro y con nuestras capturas; mientras falte algo, lo deja marcado con «____» o «pendiente» y un aviso amarillo al comienzo. |
| `IS071_T4_EquipoF.pdf` / `.docx` | Tarea 4: los ocho reportes, el análisis, los tres bloqueantes y los anexos A a F. Igual que el informe, toma los datos del registro y las capturas. |
| `pruebas-consola.md` | Los comandos para pegar en la consola (F12), con su resultado esperado. |

## Cómo se llena

1. **Ejecutar en Railway** cada caso que nos toca, según la guía de ejecución del equipo
   (ciclo 1 en Chrome, ciclo 2 en Firefox, los dos en Windows).
2. **Tomar la captura** con Windows + Shift + S, con la barra de direcciones y la hora de Windows a la vista,
   y guardarla con el nombre de la columna «Evidencia» del registro (`EV-CP016-C1-01.png`, `EV-DEF06-01.png`…).
   Las capturas van en la carpeta compartida y en `pruebas/e2/evidencias-equipo/`.
3. **Llenar la fila** del registro: navegador y versión, sistema operativo, fecha, estado
   (Aprobado, Fallido o Bloqueado) y lo que vimos, con nuestras palabras.
4. **Defectos**: quien reporta cada defecto llena en la hoja «Defectos» la fecha en que lo probó, el navegador,
   el sistema operativo, cuántas veces le salió de cuántas lo intentó y el resultado real.
5. **Reproducción cruzada**: cada uno sigue paso a paso los reportes del otro, sin preguntar nada, y en la hoja
   «Reproducción cruzada» anota la fecha, si salió solo con el reporte, con ayuda o no salió, y qué le faltaba al
   reporte.
6. **Sesiones exploratorias**: en su hoja, la fecha, la duración y las notas con el minuto de cada cosa.
7. Con el registro y las capturas listos, se vuelven a armar los documentos (`pruebas/e2/generar-docs/`):
   cada captura queda como figura y el aviso amarillo desaparece cuando ya no falta nada.

Las columnas grises del registro («Estado esperado hoy», «Defecto esperado») son solo para comparar.

## Antes de entregar

- [ ] Las 50 ejecuciones del registro llenas, con su captura.
- [ ] Los datos de Railway de los 14 defectos (hoja «Defectos»).
- [ ] La reproducción cruzada de los 14 (la Tarea 4 usa ocho).
- [ ] Las dos sesiones exploratorias con sus notas.
- [ ] El enlace de la carpeta compartida en la portada de los dos documentos.
- [ ] Las firmas, al final, cuando todo esté hecho.

## Sobre el script de Playwright

En `pruebas/e2/` hay un script que recorre la misma suite sobre una copia local del commit `693358a`
(`ejecutar.js`, `defectos.js`, `consola.js`). Lo usamos para preparar los casos y saber qué esperar, y queda
como base para la automatización del Entregable 3. Lo que produjo está en `pruebas/e2/resultados/` y es
**referencia, no evidencia**: la evidencia es la que tomamos nosotros en Railway.
