# Cómo se arman los documentos

Los documentos salen de lo que el equipo ejecuta a mano en Railway:

- `docs/entrega-2/E2_Registro_Ejecucion_EquipoF.xlsx`: el registro que llena el equipo (columnas amarillas).
- `pruebas/e2/evidencias-equipo/`: las capturas del equipo, con el nombre de la columna «Evidencia».

Donde todavía falta un dato o una captura, el informe y la Tarea 4 lo dejan marcado («____», «pendiente» o un
recuadro con el nombre de la captura) y muestran un aviso amarillo al comienzo. Nada se rellena con la corrida
del script: `pruebas/e2/resultados/` solo aporta la definición de los casos y sirve de referencia.

Requieren python-docx, openpyxl, matplotlib y Pillow.

```bash
cd pruebas/e2/generar-docs
python3 plantilla_registro.py           # crea el registro vacío (no pisa uno que ya tenga datos)
python3 grafico.py                      # grafico_defectos.png
PYTHONPATH=. python3 informe_e2.py      # docs/entrega-2/E2_F_Equipo.docx
PYTHONPATH=. python3 tarea4.py          # docs/entrega-2/IS071_T4_EquipoF.docx
PYTHONPATH=. python3 consola_md.py      # docs/entrega-2/pruebas-consola.md
PYTHONPATH=. python3 datos.py           # cuánto falta: ejecuciones, defectos, reproducciones y capturas
# PDF: soffice --headless --convert-to pdf docs/entrega-2/*.docx
```

Las capturas se insertan como figuras numeradas; para que el documento no pese de más, se guarda una copia
JPEG reducida en `_evid/` (no se versiona).
