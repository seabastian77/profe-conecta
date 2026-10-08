# -*- coding: utf-8 -*-
"""Genera docs/entrega-2/pruebas-consola.md: los comandos que se pegan en la consola (F12) para las
pruebas de la capa del servidor, con el nombre de la captura que toma el equipo en Railway."""
import json
import os
import re

BUILD = os.path.dirname(os.path.abspath(__file__))
REF = os.path.normpath(os.path.join(BUILD, '..', 'resultados', 'consola'))
DESTINO_DIR = os.path.normpath(os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2'))
DESTINO = os.path.join(DESTINO_DIR, 'pruebas-consola.md')

with open(os.path.join(REF, 'resultados.json'), encoding='utf-8') as f:
    pruebas = json.load(f)['pruebas']

CAPTURAS = {
    'CP-008': 'EV-CP008-C1-01.png y EV-CP008-C2-01.png', 'CP-018': 'EV-CP018-C1-01.png y EV-CP018-C2-01.png',
    'CP-021': 'EV-CP021-C1-01.png y EV-CP021-C2-01.png', 'DEF-06': 'EV-DEF06-01.png', 'DEF-10': 'EV-DEF10-01.png',
    'DEF-13': 'EV-CP024-C1-01.png',
}
lineas = ['# Pruebas por consola del navegador (F12) — Equipo F', '',
          'Estas son las pruebas que hacemos desde la pestaña **Consola** de las herramientas del navegador (F12), '
          'en https://profe-conecta-production-e40c.up.railway.app. En cinco se pega un `fetch()`: cuatro con el '
          'token de la sesión y el de CP-008 sin sesión, como lo haría un visitante. En la de DEF-13 se inspecciona '
          'el elemento del mensaje emergente con `document.getElementById()`.', '',
          '- En DEF-06 hay que cambiar `ID` por el número de una tutoría cancelada (se ve en la pestaña Red) y entrar '
          'como su docente. En DEF-10, `docente_id` tiene que ser el de un docente activo (se ve en la pestaña Red, '
          'en la respuesta de `/api/tutorias/docentes-disponibles` al abrir «Programar Tutoría»).',
          '- Firefox pide escribir `permitir pegar` antes de dejar pegar en la consola; Chrome pide `allow pasting`.',
          '- La evidencia es nuestra captura en Railway, con la consola abierta y la respuesta a la vista.', '']
for p in pruebas:
    comando = re.sub(r'/api/tutorias/\d+/realizada', '/api/tutorias/ID/realizada', p['comando'])
    if p['id'] == 'DEF-10':
        comando = re.sub(r'docente_id:\d+', 'docente_id:9', comando)
    lineas += [f"## {p['id']} · {p['titulo']}", '', f"**Requisito:** {p['requisito']}  ", p['descripcion'], '',
               '```js', comando, '```', '', f"- **Resultado esperado:** {p['esperado']}",
               f"- **Captura:** {CAPTURAS.get(p['id'], '—')}", '']

with open(DESTINO, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lineas).rstrip() + '\n')
print('Guardado', DESTINO)
