# Cómo regenerar los documentos

Estos scripts leen los `resultados.json` de `../resultados/` y arman el gráfico,
el registro xlsx y los informes docx. Requieren python-docx, openpyxl, matplotlib
y Pillow. Las capturas se insertan como figuras numeradas; para que el documento
no pese de más, se guarda una copia JPEG reducida en `_evid/` (no se versiona).

```bash
cd pruebas/e2/generar-docs
python3 grafico.py          # grafico_defectos.png
PYTHONPATH=. python3 registro_xlsx.py   # docs/entrega-2/E2_Registro_Ejecucion_EquipoF.xlsx
PYTHONPATH=. python3 informe_e2.py      # docs/entrega-2/E2_F_Equipo.docx
PYTHONPATH=. python3 tarea4.py          # docs/entrega-2/IS071_T4_EquipoF.docx
PYTHONPATH=. python3 consola_md.py      # docs/entrega-2/pruebas-consola.md
# PDF: soffice --headless --convert-to pdf docs/entrega-2/*.docx
```

