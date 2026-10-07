# -*- coding: utf-8 -*-
"""Genera docs/entrega-2/pruebas-consola.md a partir de resultados/consola/resultados.json."""
import os
from datos import consola, ruta_evidencia

BUILD = os.path.dirname(os.path.abspath(__file__))
DESTINO_DIR = os.path.normpath(os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2'))
DESTINO = os.path.join(DESTINO_DIR, 'pruebas-consola.md')

pruebas = consola.get('pruebas', [])
con_fetch = [p for p in pruebas if p.get('httpStatus') is not None]
inspecciones = [p for p in pruebas if p.get('httpStatus') is None]
NUM = {1: 'Una', 2: 'Dos', 3: 'Tres', 4: 'Cuatro', 5: 'Cinco', 6: 'Seis', 7: 'Siete', 8: 'Ocho'}

lineas = ['# Pruebas por consola del navegador (F12) — Equipo F', '']
intro = (f"Estas {len(pruebas)} verificaciones se hacen desde la pestaña **Consola** de las herramientas "
         f"del navegador (F12). {NUM.get(len(con_fetch), len(con_fetch))} pegan un `fetch()` con el token "
         "de la sesión y prueban la capa del servidor directamente, así que son las más cercanas a cómo se "
         "tantea una API.")
if inspecciones:
    ids = ', '.join(p['id'] for p in inspecciones)
    intro += (f" La de {ids} no hace ninguna petición: inspecciona un elemento de la página con "
              "`document.getElementById()` para ver lo que la pantalla no muestra.")
lineas += [intro, '']
lineas += ['Las rutas son **relativas** (`/api/...`): el mismo comando sirve en `localhost` y en',
           f"el entorno de Railway ({consola.get('base', 'http://localhost:3000')} se usó para esta corrida).", '',
           'Debajo de cada comando está la captura de la consola tal como quedó después de pegarlo.', '',
           '> Si Chrome pide permiso para pegar en la consola, escribe `allow pasting` y Enter.', '']

for p in pruebas:
    lineas += [f"## {p['id']} · {p['titulo']}", '',
               f"**Requisito:** {p['requisito']}  ", p['descripcion'], '',
               '```js', p['comando'], '```', '',
               f"- **Resultado esperado:** {p['esperado']}",
               f"- **Resultado real:** {p['resultadoReal']}"]
    codigo = (f"{p['httpStatus']}" if p.get('httpStatus') is not None
              else '— (inspección del elemento, sin petición al servidor)')
    lineas.append(f"- **Código HTTP:** {codigo} · **Estado:** {p['estado']}")
    ruta = ruta_evidencia(p['evidencia']) if p.get('evidencia') else None
    if ruta:
        rel = os.path.relpath(ruta, DESTINO_DIR).replace(os.sep, '/')
        lineas += [f"- **Evidencia:** `{os.path.relpath(ruta, os.path.join(DESTINO_DIR, '..', '..')).replace(os.sep, '/')}`", '',
                   f"![{p['id']} en la consola F12]({rel})"]
    else:
        lineas.append('- **Evidencia:** —')
    lineas.append('')

with open(DESTINO, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lineas).rstrip() + '\n')
print('Guardado', DESTINO)
