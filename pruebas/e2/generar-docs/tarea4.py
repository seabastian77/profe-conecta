# -*- coding: utf-8 -*-
"""Genera la Tarea 4 — Reporte profesional de defectos (IS071_T4_EquipoF.docx).
Ocho de los catorce defectos del Entregable 2, con los datos de quien los ejecutó en Railway,
la reproducción cruzada que hizo el otro integrante y el análisis por riesgo. Donde todavía falta
un dato o una captura, el documento lo deja marcado."""
import os

from docxutil import (nuevo_doc, tabla, ficha, recuadro, parrafo, figura, proxima_figura, recuadro_captura,
                      salto, titulo_portada, titulo_en_pagina_nueva, rango_figuras, pie_de_pagina, TEAL)
from datos import EQUIPO, DEFECTOS, REPRO, v, entorno
from textos import PASOS, PRECOND, ESPERADO, SEV_JUST, PRIO_JUST

BUILD = os.path.dirname(os.path.abspath(__file__))
GRAFICO = os.path.join(BUILD, 'grafico_defectos.png')

# Ocho defectos: dos por integrante como mínimo, variados por requisito, con los tres
# bloqueantes incluidos. Sebastián: DEF-06, DEF-08, DEF-11, DEF-13. Esteban: DEF-01, DEF-02, DEF-07, DEF-14.
SELECCION = ['DEF-01', 'DEF-02', 'DEF-06', 'DEF-07', 'DEF-08', 'DEF-11', 'DEF-13', 'DEF-14']
por_id = {d['id']: d for d in DEFECTOS}
elegidos = [por_id[i] for i in SELECCION]
BLOQUEANTES = ['DEF-01', 'DEF-08', 'DEF-13']

# Figura 1 es el gráfico; las capturas de los ocho defectos van en el Anexo F, en el orden de la sección 4.
FIG = {}
_n = 2
for d in elegidos:
    for nombre, ruta in zip(d['evidencias'], d['rutas']):
        if ruta and nombre not in FIG:
            FIG[nombre] = _n
            _n += 1


def texto_evidencia(d):
    partes = []
    hechas = [x for x in d['evidencias'] if x in FIG]
    if hechas:
        partes.append(f"{', '.join(hechas)} (Anexo F, {rango_figuras(FIG[hechas[0]], FIG[hechas[-1]])})")
    faltan = [x for x in d['evidencias'] if x not in FIG]
    if faltan:
        partes.append(f"{', '.join(faltan)} (pendiente{'s' if len(faltan) > 1 else ''})")
    return '; '.join(partes)


faltan_datos = [d['id'] for d in elegidos if not d['hecho']]
faltan_capturas = sum(1 for d in elegidos for r in d['rutas'] if not r)
faltan_repro = [d['id'] for d in elegidos if not REPRO.get(d['id'], {}).get('resultado')]

doc = nuevo_doc()
pie_de_pagina(doc, 'ConectaProfe · Tarea 4 · Equipo F')

# ===== Portada =====
for _ in range(2): doc.add_paragraph()
titulo_portada(doc, [
    ('UNIVERSIDAD CATÓLICA LUIS AMIGÓ', 13, None, True),
    ('Facultad de Ingenierías y Arquitectura', 11, None, False),
    ('Ingeniería de Sistemas · Tecnología en Desarrollo de Software', 10.5, None, False),
    ('Verificación y Validación de Software · IS019 · IS071 · TDS004', 10.5, None, False),
])
for _ in range(2): doc.add_paragraph()
titulo_portada(doc, [
    ('TAREA 4', 24, TEAL, True),
    ('Reporte profesional de defectos', 14, None, True),
    ('', 6, None, False),
    ('Sistema bajo prueba: ConectaProfe — Plataforma de gestión de tutorías académicas', 11, None, False),
])
for _ in range(2): doc.add_paragraph()
ficha(doc, [
    ('Curso', EQUIPO['curso'] + ' (' + EQUIPO['codigos'] + ')'),
    ('Equipo', EQUIPO['equipo']),
    ('Integrantes', ' · '.join(EQUIPO['integrantes'])),
    ('Sistema bajo prueba', EQUIPO['sistema']),
    ('Entorno', f"{EQUIPO['url']} (commit {EQUIPO['commit']})"),
    ('Carpeta de evidencias', 'La misma del Entregable 2 (lectura para el docente): ______________________'),
    ('Docente', EQUIPO['docente']),
    ('Fecha de entrega', 'Martes 13 de octubre de 2026 · sesión 12'),
])
salto(doc)

# ===== Anexo A: reparto =====
doc.add_heading('Anexo A. Tabla de reparto interno', level=2)
parrafo(doc, 'Se escriben los identificadores concretos de los defectos que reportó y que reprodujo cada '
             'integrante. Cada defecto lo reproduce el integrante que no lo reportó, siguiendo solo lo que '
             'dice su reporte.', size=10.5)
rep = {}
for d in elegidos:
    rep.setdefault(d['reporta'], {'reporta': [], 'reproduce': []})['reporta'].append(d['id'])
    rep.setdefault(d['reproduce'], {'reporta': [], 'reproduce': []})['reproduce'].append(d['id'])
filas = [['Integrante', 'Defectos que reportó', 'Defectos que reprodujo', 'Firma']]
for integrante in EQUIPO['integrantes']:
    r = rep.get(integrante, {'reporta': [], 'reproduce': []})
    filas.append([integrante, ', '.join(r['reporta']) or '—', ', '.join(r['reproduce']) or '—', ''])
tabla(doc, filas, anchos=[4.8, 4.2, 4.2, 3.0], fuente=9.5)
parrafo(doc, 'Firma: ___________________________        Firma: ___________________________', size=10, space=2)
if faltan_datos or faltan_capturas or faltan_repro:
    partes = []
    if faltan_datos:
        partes.append(f'los datos de Railway de {len(faltan_datos)} reportes')
    if faltan_capturas:
        partes.append(f'{faltan_capturas} capturas')
    if faltan_repro:
        partes.append(f'{len(faltan_repro)} reproducciones cruzadas')
    parrafo(doc, 'Borrador para el equipo (este aviso sale solo mientras falte algo): faltan '
            + ', '.join(partes[:-1]) + (' y ' if len(partes) > 1 else '') + partes[-1]
            + '. Todo lo que dice «____» o «pendiente» se llena con el registro y las capturas de Railway.',
            size=9.5, italic=True, resaltado=True)
salto(doc)

# ===== 1. Propósito =====
doc.add_heading('1. Propósito y alcance', level=1)
parrafo(doc,
    'Encontrar un defecto es la mitad del trabajo; la otra mitad es escribirlo de modo que otra persona, que '
    'no estaba ahí y no conoce el sistema, pueda reproducirlo y corregirlo. Esta tarea presenta ocho de los '
    'catorce defectos del Entregable 2 con el formato profesional completo, la reproducción cruzada dentro '
    'del equipo y el análisis que los relaciona con los riesgos del Entregable 1.')
recuadro(doc,
    'La pregunta que responde esta tarea: ¿nuestros reportes permiten que alguien más reproduzca el fallo sin '
    'preguntarnos nada? Para responderla, cada defecto lo reproduce en Railway el integrante que no lo reportó, '
    'usando solo los pasos escritos, y anota si le salió con el reporte, si necesitó ayuda o si no le salió.',
    bold_primero=True)
parrafo(doc, 'Cómo se ejecutaron las pruebas.', bold=True, space=2)
parrafo(doc,
    'Todo se ejecutó a mano en la aplicación desplegada en Railway (commit 693358a), en Chrome y Firefox sobre '
    'Windows. Lo que se mira en el servidor se revisó en la pestaña Red de F12, y las peticiones que la interfaz no '
    'deja hacer se pegaron en la consola con el token de la sesión, tal como pide la guía. Cada reporte trae el '
    'entorno, la fecha y los intentos de quien lo ejecutó, y su evidencia nombrada con el identificador.', size=10.5)
salto(doc)

# ===== 2. Los ocho defectos (tabla resumen) =====
doc.add_heading('2. Resumen de los ocho defectos', level=1)
filas = [['ID', 'Título', 'Requisito', 'Severidad', 'Prioridad', 'Origen', 'Estado']]
for d in elegidos:
    filas.append([d['id'], d['titulo'], d['requisito'], d['severidad'], d['prioridad'], d['origen'], d['estado']])
tabla(doc, filas, anchos=[1.5, 6.8, 2.0, 1.5, 1.5, 1.5, 1.4], fuente=8.3)
parrafo(doc, 'Los ocho cubren seis requisitos distintos (R2/RNF02, R4, R5, R6, R7 y R8/transversal), para no '
             'concentrar todo en una sola funcionalidad. Los reportes completos, con los trece campos, van en '
             'la sección 4.', size=10.5)
salto(doc)

# ===== 3. Análisis por riesgo =====
doc.add_heading('3. Análisis de los defectos', level=1)
parrafo(doc, 'Distribución por requisito y severidad', bold=True, space=2)
figura(doc, GRAFICO, 'Defectos por requisito y severidad (los catorce del Entregable 2). Fuente: registro '
       'de defectos del equipo.', ancho_cm=15.5, comprimir=False)
parrafo(doc, 'Comparación con la matriz de riesgos del Entregable 1', bold=True, space=2)
parrafo(doc,
    'El análisis de riesgos del Entregable 1 apuntó donde debía: R5 era el riesgo más alto de la matriz '
    '(R-03, nivel 15) y concentra cuatro defectos, incluido el único crítico. R6, que habíamos calificado como '
    'riesgo medio (R-11), aportó un defecto de severidad alta (DEF-08). Lo que la matriz no vio fueron dos '
    'riesgos transversales: la zona horaria (DEF-08 y DEF-12 comparten causa, el servidor en UTC) y la '
    'visibilidad de los mensajes al usuario (DEF-13), que toca todas las pantallas.')
recuadro(doc,
    'Conclusión (cinco líneas). La matriz de riesgos acertó en los requisitos: donde predijo más riesgo '
    '(R5, R-03) es donde más defectos aparecieron, y el análisis llevó a probar primero esos caminos. Su '
    'punto ciego fueron los riesgos transversales —zona horaria y mensajes al usuario—, que no estaban '
    'ligados a un requisito concreto y por eso ninguna fila los nombraba. Para el Entregable 3 agregamos esos '
    'dos riesgos y subimos R6 a nivel alto.')
parrafo(doc, 'Los tres defectos bloqueantes', bold=True, space=2)
parrafo(doc, 'De los ocho, estos tres impedirían liberar el producto:', size=10.5)
BLQ_JUST = {
 'DEF-01': 'DEF-01 (sesión que no expira, severidad alta, RNF02). Es un control de seguridad que el requisito '
           'exige y que no funciona: la sesión sigue abierta a los 16 minutos y solo se cierra a las dos horas. '
           'En los equipos compartidos de la universidad, cualquiera que se siente después queda dentro de la '
           'cuenta anterior. El riesgo es de seguridad y el impacto alcanza a todos los roles.',
 'DEF-08': 'DEF-08 (regla de 24 horas corrida 5 horas, severidad alta, R6). La cancelación es una de las dos '
           'operaciones centrales del módulo y la regla se aplica mal a todos los usuarios: con 26 horas reales '
           'de margen el sistema dice que faltan 21 y no deja cancelar. El requisito es de riesgo medio-alto y '
           'el usuario no tiene alternativa dentro de la aplicación salvo escribirle al docente.',
 'DEF-13': 'DEF-13 (mensajes emergentes que nunca se ven, prioridad alta, transversal). El servidor acepta o '
           'rechaza bien cada acción, pero el usuario no recibe ninguna confirmación ni error en pantalla. '
           'Afecta todas las pantallas y deja al usuario sin saber por qué se rechaza lo que intenta; sin esa '
           'respuesta visible, varias reglas de negocio quedan invisibles para quien usa el sistema.',
}
for b in BLOQUEANTES:
    parrafo(doc, BLQ_JUST[b], size=10.5, space=6)
salto(doc)

# ===== 4. Reportes completos =====

doc.add_heading('4. Reportes completos de los ocho defectos', level=1)
parrafo(doc, 'El entorno, la fecha, la frecuencia y el resultado real de cada reporte son los de quien lo '
             'ejecutó en Railway. Las capturas están en el Anexo F, con el número de figura que cita el campo '
             '«Evidencia».', size=10, italic=True)
for d in elegidos:
    doc.add_heading(f"{d['id']} · {d['titulo']}", level=3)
    ficha(doc, [
        ('Identificador', d['id']),
        ('Título', d['titulo']),
        ('Entorno y versión', entorno(d['navegador'], d['so']) + f" · probado el {v(d['fecha'])}"),
        ('Precondición', PRECOND[d['id']]),
        ('Pasos', PASOS[d['id']]),
        ('Resultado esperado', ESPERADO[d['id']]),
        ('Resultado real', v(d['resultado_real'])),
        ('Frecuencia', v(d['intentos'], '____ de ____ intentos')),
        ('Severidad', SEV_JUST[d['id']]),
        ('Prioridad', PRIO_JUST[d['id']]),
        ('Evidencia', texto_evidencia(d)),
        ('Origen', d['origen']),
        ('Reportado por', d['reporta']),
    ])
    doc.add_paragraph()

# ===== Anexo B: formato del reporte =====
titulo_en_pagina_nueva(doc, 'Anexo B. Formato del reporte de defecto', nivel=1)
parrafo(doc, 'Estos son los trece campos que usamos en cada reporte, con lo que va en cada uno. La columna de '
             'ejemplo sale de nuestro propio DEF-08.', size=10.5)
_d8 = por_id['DEF-08']
tabla(doc, [
    ['Campo', 'Qué se escribe', 'Ejemplo (DEF-08)'],
    ['Identificador', 'Código consecutivo del equipo', 'DEF-08'],
    ['Título', 'Qué falla, dónde y en qué condición', _d8['titulo']],
    ['Entorno y versión', 'Navegador, sistema operativo y versión o fecha del sistema',
     entorno(_d8['navegador'], _d8['so']) + f" · probado el {v(_d8['fecha'])}"],
    ['Precondición', 'Estado necesario para reproducirlo', PRECOND['DEF-08']],
    ['Pasos', 'Numerados, mínimos y con los datos concretos', PASOS['DEF-08']],
    ['Resultado esperado', 'Lo que exige el requisito, citándolo', ESPERADO['DEF-08']],
    ['Resultado real', 'Lo observado, sin interpretar', v(_d8['resultado_real'])],
    ['Frecuencia', 'Medida: siempre, o n de m intentos', v(_d8['intentos'], '____ de ____ intentos')],
    ['Severidad', 'Crítica, alta, media o baja, con la razón', SEV_JUST['DEF-08']],
    ['Prioridad', 'Alta, media o baja, con la razón', PRIO_JUST['DEF-08']],
    ['Evidencia', 'Archivos nombrados con el identificador', ', '.join(_d8['evidencias'])],
    ['Origen', 'Caso de prueba o sesión exploratoria', _d8['origen']],
    ['Reportado por', 'Integrante que lo encontró', _d8['reporta']],
], anchos=[3.0, 5.0, 8.4], fuente=8.5)

# ===== Anexo C: matriz de reproducción cruzada =====
titulo_en_pagina_nueva(doc, 'Anexo C. Matriz de reproducción cruzada', nivel=1)
parrafo(doc, 'Cada defecto lo reproduce en Railway un integrante distinto del que lo reportó, siguiendo '
             'únicamente lo que dice el reporte. Resultados posibles: reproducido (solo con el reporte), con '
             'ayuda (hubo que preguntarle al autor) o no reproducido; los dos últimos dicen qué le faltaba al '
             'reporte.', size=10.5)
filas = [['Defecto', 'Reportado por', 'Reproducido por', 'Fecha', 'Resultado', 'Qué faltó o qué se observó']]
for d in elegidos:
    r = REPRO.get(d['id'], {})
    filas.append([d['id'], d['reporta'], d['reproduce'], v(r.get('fecha')), v(r.get('resultado'), 'Pendiente'),
                  v(r.get('falto'), '')])
tabla(doc, filas, anchos=[1.5, 3.0, 3.0, 1.8, 2.2, 5.2], fuente=8.6)


# ===== Anexo D: escalas =====
doc.add_heading('Anexo D. Escalas de severidad y prioridad', level=1)
tabla(doc, [
    ['Severidad', 'Significa'],
    ['Crítica', 'Impide usar una función principal o causa pérdida de datos, sin alternativa.'],
    ['Alta', 'Una función principal falla, pero existe una alternativa costosa.'],
    ['Media', 'Falla una función secundaria o el resultado es incorrecto en casos poco frecuentes.'],
    ['Baja', 'Problema de apariencia o de texto que no altera el resultado.'],
], anchos=[3.0, 13.0], fuente=9.5)
parrafo(doc, 'Prioridad. Dice qué tan pronto conviene corregir el defecto y puede no coincidir con la '
             'severidad: en seis de los ocho reportes difieren, y en cada uno se justifica por separado.', size=10.5)


# ===== Anexo E: lista de verificación =====
doc.add_heading('Anexo E. Lista de verificación de cada reporte', level=1)
_todos = all(d['hecho'] for d in elegidos)
_ev = all(all(d['rutas']) for d in elegidos)
tabla(doc, [
    ['N.º', 'Verificación', '✓'],
    ['1', 'El título dice qué falla, dónde y en qué condición.', 'Sí'],
    ['2', 'Están el entorno y la versión o fecha del sistema.', 'Sí' if _todos else 'Pendiente'],
    ['3', 'La precondición permite dejar el sistema listo para reproducir.', 'Sí'],
    ['4', 'Los pasos están numerados y son los mínimos para llegar al fallo.', 'Sí'],
    ['5', 'Todos los datos están escritos: no hay nada que inventar.', 'Sí'],
    ['6', 'El resultado esperado cita el requisito.', 'Sí'],
    ['7', 'El resultado real describe lo observado, sin interpretarlo.', 'Sí' if _todos else 'Pendiente'],
    ['8', 'La frecuencia está medida (siempre, o n de m intentos).', 'Sí' if _todos else 'Pendiente'],
    ['9', 'La severidad está justificada.', 'Sí'],
    ['10', 'La prioridad está justificada y puede diferir de la severidad.', 'Sí'],
    ['11', 'La evidencia existe, está nombrada con el identificador y corresponde al fallo.', 'Sí' if _ev else 'Pendiente'],
    ['12', 'El defecto enlaza con su caso de prueba o con la sesión exploratoria que lo encontró.', 'Sí'],
], anchos=[1.0, 13.0, 1.8], fuente=9)

# ===== Anexo F: capturas de los ocho defectos =====
titulo_en_pagina_nueva(doc, 'Anexo F. Evidencia de los ocho defectos', nivel=1)
parrafo(doc, 'Aquí están las capturas que cita el campo «Evidencia» de cada reporte, en el mismo orden de la '
             'sección 4. Son las de quien ejecutó en Railway: en cada una se ven la barra de direcciones y la '
             'hora de Windows.', size=10.5)
for d in elegidos:
    doc.add_heading(f"{d['id']} · {d['titulo']}", level=3)
    for nombre, ruta in zip(d['evidencias'], d['rutas']):
        if ruta:
            assert proxima_figura() == FIG[nombre], 'la numeración de figuras se desfasó'
            figura(doc, ruta, f"{d['id']} · {nombre}. Captura de {d['reporta']} en Railway"
                   + (f", {d['fecha']}" if d['fecha'] else ''))
        else:
            recuadro_captura(doc, f'Falta la captura {nombre}\nLa toma {d["reporta"]} en Railway', alto_cm=4.5)

salida = os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2', 'IS071_T4_EquipoF.docx')
doc.save(salida)
print('Guardado', salida)
