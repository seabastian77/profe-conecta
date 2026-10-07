# -*- coding: utf-8 -*-
"""Genera el informe del Entregable 2 (E2_F_Equipo.docx) con lo que el equipo ejecutó a mano en
Railway: el registro (xlsx) y las capturas de pruebas/e2/evidencias-equipo/. Donde todavía falta un
dato o una captura, el documento lo deja marcado en vez de inventarlo."""
import json
import os
import re
from collections import Counter

from docxutil import (nuevo_doc, tabla, ficha, recuadro, parrafo, numerada, codigo, figura, proxima_figura,
                      recuadro_captura, salto, titulo_portada, titulo_en_pagina_nueva, pie_de_pagina, TEAL)
from datos import (EQUIPO, CASOS, EJEC, DEFECTOS, REPRO, SESIONES, NOTAS, M, COMPLETO, v, entorno)
from textos import PASOS, PRECOND, ESPERADO, SEV_JUST, PRIO_JUST, MISIONES

BUILD = os.path.dirname(os.path.abspath(__file__))
GRAFICO = os.path.join(BUILD, 'grafico_defectos.png')
doc = nuevo_doc()
pie_de_pagina(doc, 'ConectaProfe · Entregable 2 · Equipo F')

POR_CASO = {(e['caso'], e['ciclo']): e for e in EJEC}
POR_DEF = {d['id']: d for d in DEFECTOS}


def ids(lista):
    lista = list(lista)
    if not lista:
        return ''
    return lista[0] if len(lista) == 1 else ', '.join(lista[:-1]) + ' y ' + lista[-1]


def num(valor, ciclo):
    """Un conteo del ciclo solo se escribe cuando el ciclo está completo; si no, queda la raya."""
    return str(valor) if M[f'pend{ciclo}'] == 0 else '__'


def mas_comun(valores):
    valores = [x for x in valores if x]
    return Counter(valores).most_common(1)[0][0] if valores else ''


def resumen_real(texto, limite=240):
    """Frases completas del resultado real hasta el límite, sin cortar palabras."""
    if not texto:
        return 'Pendiente'
    frases = re.split(r'(?<=[.;])\s+(?=[A-ZÁÉÍÓÚÑ«(])', texto.strip())
    salida = ''
    for f in frases:
        if len(salida) + len(f) + 1 > limite:
            break
        salida = (salida + ' ' + f).strip()
    return salida or texto[:limite].rsplit(' ', 1)[0].rstrip(',;:') + '…'


NAV1 = mas_comun(e['navegador'] for e in EJEC if e['ciclo'] == 1)
NAV2 = mas_comun(e['navegador'] for e in EJEC if e['ciclo'] == 2)
SO = mas_comun(e['so'] for e in EJEC)
BLOQ1 = [e['caso'] for e in EJEC if e['ciclo'] == 1 and e['estado'] == 'Bloqueado']
FALL1 = [e['caso'] for e in EJEC if e['ciclo'] == 1 and e['estado'] == 'Fallido']
FALL2 = [e['caso'] for e in EJEC if e['ciclo'] == 2 and e['estado'] == 'Fallido']
C2 = [e for e in EJEC if e['ciclo'] == 2]


def estado_de(caso, ciclo=1):
    e = POR_CASO.get((caso, ciclo))
    return e['estado'] if e else ''


# Numeración de figuras: 1 es el gráfico; luego las capturas de cada defecto (Anexo C) y después
# las de cada ejecución que no estén ya en el Anexo C (Anexo E). Se calcula antes para poder citarlas.
FIG = {}
_n = 2
for d in DEFECTOS:
    for nombre, ruta in zip(d['evidencias'], d['rutas']):
        if ruta and nombre not in FIG:
            FIG[nombre] = _n
            _n += 1
for e in EJEC:
    for nombre, ruta in zip(e['evidencias'], e['rutas']):
        if ruta and nombre not in FIG:
            FIG[nombre] = _n
            _n += 1


def cita(nombre):
    return f'{nombre} (figura {FIG[nombre]})' if nombre in FIG else f'{nombre} (pendiente)'

# ======================= PORTADA =======================
for _ in range(2): doc.add_paragraph()
titulo_portada(doc, [
    ('UNIVERSIDAD CATÓLICA LUIS AMIGÓ', 13, None, True),
    ('Facultad de Ingenierías y Arquitectura', 11, None, False),
    ('Ingeniería de Sistemas · Tecnología en Desarrollo de Software', 10.5, None, False),
    ('Verificación y Validación de Software', 10.5, None, False),
])
for _ in range(2): doc.add_paragraph()
titulo_portada(doc, [
    ('ENTREGABLE 2', 24, TEAL, True),
    ('Ejecución manual y gestión de defectos', 14, None, True),
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
    ('Docente', EQUIPO['docente']),
    ('Fecha de entrega', EQUIPO['entrega']),
    ('Carpeta de evidencias', 'Carpeta compartida (lectura para el docente): ______________________\n'
     'Copia en el repositorio: pruebas/e2/evidencias-equipo/'),
    ('Registro de ejecución', 'E2_Registro_Ejecucion_EquipoF.xlsx (en la carpeta compartida y en docs/entrega-2/)'),
])
salto(doc)

# ======================= ANEXO A: REPARTO INTERNO =======================
doc.add_heading('Anexo A. Tabla de reparto interno', level=2)
parrafo(doc, 'Desde esta entrega el equipo es de dos integrantes, así que repartimos los 34 casos en dos '
             'bloques de 17. Nadie ejecuta en el ciclo 1 los casos que diseñó; en el ciclo 2 cada uno repite '
             'en Firefox los casos del otro, y cada defecto lo reproduce el integrante que no lo reportó.', size=10.5)
tabla(doc, [
    ['Integrante', 'Casos ejecutados (ciclo 1)', 'Defectos reportados', 'Secciones del informe', 'Firma'],
    ['Sebastián González González', 'CP-016 a CP-031 y CP-034 (17 casos)',
     'DEF-03, DEF-05, DEF-06, DEF-08, DEF-10, DEF-11, DEF-12, DEF-13',
     'Actualización del plan, ejecución, métricas y evaluación', ''],
    ['Esteban Palencia', 'CP-001 a CP-015, CP-032 y CP-033 (17 casos)',
     'DEF-01, DEF-02, DEF-04, DEF-07, DEF-09, DEF-14',
     'Resumen ejecutivo, pruebas exploratorias, lecciones y anexos', ''],
], anchos=[3.2, 4.2, 3.8, 4.3, 1.8], fuente=9)
parrafo(doc, 'Firma: ___________________________        Firma: ___________________________', size=10, space=2)

if not COMPLETO:
    faltan = []
    if M['pend1'] + M['pend2']:
        faltan.append(f"{M['pend1'] + M['pend2']} ejecuciones sin registrar")
    if M['capturas'] < M['capturas_esperadas']:
        faltan.append(f"{M['capturas_esperadas'] - M['capturas']} capturas de ejecución")
    if M['def_hechos'] < len(DEFECTOS):
        faltan.append(f"{len(DEFECTOS) - M['def_hechos']} reportes sin los datos de quien los reprodujo")
    if M['repro_hechas'] < len(DEFECTOS):
        faltan.append(f"{len(DEFECTOS) - M['repro_hechas']} reproducciones cruzadas")
    parrafo(doc, 'Borrador para el equipo (este aviso sale solo mientras falte algo): faltan ' + ids(faltan)
            + '. Todo lo que dice «____» o «pendiente» se llena con el registro y las capturas de Railway.',
            size=9.5, italic=True, resaltado=True)

recuadro(doc,
    'Cómo ejecutamos la suite. Cada caso lo ejecutamos a mano en la aplicación desplegada en Railway '
    f"({EQUIPO['url']}, commit 693358a): el ciclo 1 en {NAV1 or 'Chrome'} y el ciclo 2 en {NAV2 or 'Firefox'}, "
    f"sobre {SO or 'Windows'}. Para lo que se mira en el servidor usamos la pestaña Red de F12, con «Conservar "
    'registro» marcado, y las peticiones que la interfaz no deja hacer las pegamos en la consola con el token '
    'de la sesión. Cada ejecución tiene su captura, tomada con Windows + Shift + S, donde se ven la barra de '
    'direcciones y la hora de Windows, y su fila en el registro con fecha, navegador, estado y resultado. '
    'Aparte, armamos un script de Playwright que recorre la misma suite sobre una copia local del mismo commit; '
    'lo usamos para preparar los casos y como base para el Entregable 3, pero sus capturas no son evidencia de '
    'esta ejecución.', bold_primero=True)
salto(doc)

# ======================= 1. RESUMEN EJECUTIVO =======================
doc.add_heading('1. Resumen ejecutivo', level=1)
_bloq = f" ({ids(BLOQ1)})" if BLOQ1 and M['pend1'] == 0 else ''
_misma = (M['pend1'] == 0 and M['pend2'] == 0 and set(FALL1) <= set(FALL2))
parrafo(doc,
    f"Ejecutamos a mano la suite de ConectaProfe en dos ciclos, directamente en Railway (commit 693358a): el "
    f"ciclo 1 en {NAV1 or 'Chrome'} y el ciclo 2 en {NAV2 or 'Firefox'}. Antes de empezar, la suite pasó de 31 a "
    f"34 casos: corregimos once que no se podían ejecutar tal como estaban escritos y agregamos tres para "
    f"cerrar huecos. En el ciclo 1 ejecutamos {num(M['ejec1'], 1)} de los 34 casos: {num(M['aprob1'], 1)} "
    f"aprobaron, {num(M['fall1'], 1)} fallaron y {num(M['bloq1'], 1)} quedaron bloqueados{_bloq}. En el ciclo 2 "
    f"volvimos en Firefox sobre los fallidos y repetimos los casos de riesgo alto que habían pasado; de esas "
    f"{num(M['ejec2'], 2)} ejecuciones, {num(M['aprob2'], 2)} aprobaron y {num(M['fall2'], 2)} fallaron"
    + (', los mismos que en el ciclo 1.' if _misma else '.'))
_sev = Counter(d['severidad'] for d in DEFECTOS)
_expl = sum(1 for d in DEFECTOS if d['origen'].startswith('SE'))
_d5 = POR_DEF['DEF-05']
_abiertos = sum(1 for d in DEFECTOS if d['estado'] == 'Abierto')
parrafo(doc,
    f"Reportamos {len(DEFECTOS)} defectos: {_sev['Crítica']} crítico, {_sev['Alta']} de severidad alta, "
    f"{_sev['Media']} medios y {_sev['Baja']} bajos. {len(DEFECTOS) - _expl} salieron de la ejecución de casos y "
    f"{_expl} de las dos sesiones exploratorias. El crítico (DEF-05, código HTML que se ejecutaba desde las "
    "observaciones de una tutoría) ya estaba corregido"
    + (f" y lo verificamos en Railway el {_d5['fecha']}" if _d5['estado'] == 'Verificado' and _d5['fecha']
       else '; su verificación en Railway está pendiente')
    + f"; {_abiertos} siguen abiertos. R5, la programación de tutorías, concentra "
    f"{sum(1 for d in DEFECTOS if 'R5' in d['requisito'])} defectos y es el requisito al que el Entregable 1 le "
    "había asignado el riesgo más alto (R-03). El hallazgo que más nos sorprendió fue DEF-13: los mensajes "
    "emergentes del sistema se generan pero nunca se ven, así que el usuario no se entera de por qué se rechaza "
    "lo que intenta hacer.")
_crit_abiertos = [d['id'] for d in DEFECTOS if d['severidad'] == 'Crítica' and d['estado'] != 'Verificado']
recuadro(doc,
    'Recomendación: apto con condiciones. '
    + ('No queda ningún defecto crítico abierto' if not _crit_abiertos else f'Falta verificar {ids(_crit_abiertos)}')
    + f" y ejecutamos {num(M['alta_ejec'], 1)} de los {M['alta']} casos de prioridad alta. Los dos defectos de "
    'severidad alta, DEF-01 (la sesión no expira a los 15 minutos) y DEF-08 (la regla de las 24 horas para '
    'cancelar se calcula con 5 horas de diferencia), siguen abiertos con plan de acción. Recomendamos '
    'corregirlos, junto con DEF-13, DEF-02 y DEF-07 —que tienen prioridad alta y se arreglan con pocas líneas—, '
    'y volver a ejecutar los casos fallidos antes de liberar.', bold_primero=True)
salto(doc)

# ======================= 2. ACTUALIZACIÓN DEL PLAN =======================
doc.add_heading('2. Actualización del plan', level=1)
parrafo(doc, 'Antes de abrir el ciclo 1 revisamos la suite contra la aplicación desplegada y contra la '
             'retroalimentación del Entregable 1. Varios casos no se dejaban ejecutar tal como estaban escritos. '
             'En vez de arreglarlos en silencio, los dejamos registrados aquí, porque cada uno es un hallazgo '
             'sobre nuestro propio diseño.')
tabla(doc, [
    ['Caso', 'Cambio', 'Razón', 'Origen'],
    ['CP-001, CP-003 y CP-004', 'Corregidos',
     'El resultado esperado citaba el mensaje de la API («La contraseña debe tener mínimo 8 caracteres»), '
     'pero los pasos van por el formulario, que valida antes de enviar y muestra «Mínimo 8 caracteres», '
     '«Debe incluir al menos un número» o «Debe incluir al menos una letra». RF005 pide rechazar con un '
     'mensaje de error, no un texto exacto. Ahora el resultado esperado es que el formulario no envíe nada '
     'y muestre un mensaje que nombre la regla.', 'Revisión contra la aplicación'],
    ['CP-020', 'Corregido',
     'Mismo problema: esperaba «La fecha no puede ser en el pasado», que es el texto del servidor, y el '
     'formulario muestra «La fecha debe ser a partir de mañana (RN06)» sin llegar a enviar.', 'Revisión contra la aplicación'],
    ['CP-012 y CP-013', 'Corregidos',
     'La cuenta prueba.bloqueo@amigo.edu.co no existe en los datos de semilla. Agregamos su creación como '
     'preparación, y una segunda cuenta para CP-013. Además, CP-013 pedía cinco fallos y esperaba el bloqueo '
     'en el sexto, o sea que copiaba el código; RRN01 exige bloquear después del tercero, y así quedó escrito.',
     'Revisión contra los requisitos'],
    ['CP-024, CP-025 y CP-026', 'Corregidos',
     'Las precondiciones pedían tutorías a 12 horas, a 26 horas o ya vencidas, sin decir cómo prepararlas, y '
     'el formulario del estudiante solo deja programar desde mañana. Ahora cada caso trae la preparación y la '
     'hora a la que se debe ejecutar.', 'Revisión contra la aplicación'],
    ['CP-016 y CP-030', 'Corregidos',
     'Los datos no coincidían con las opciones reales: el programa se llama «Ingeniería de Sistemas» y no '
     '«Sistemas», y no existe el destinatario «estudiantes»; el grupo más cercano es «Todos los estudiantes '
     'en alerta».', 'Revisión contra la aplicación'],
    ['CP-032', 'Agregado',
     'R5 solo se probaba desde el formulario del estudiante. El administrador también programa asesorías desde '
     '«Asignación» y ese camino no tenía caso. Verifica que no se pueda programar una asesoría con fecha de hoy.',
     'Hueco de cobertura'],
    ['CP-033', 'Agregado',
     'CP-022 cubre el choque de horario del docente, pero no el del estudiante. Verifica que un estudiante no '
     'quede con dos tutorías a la misma fecha y hora.', 'Hueco de cobertura'],
    ['CP-034', 'Agregado',
     'El Entregable 1 asoció RNF02 a la característica de seguridad, pero no le diseñó ningún caso. Verifica '
     'que la sesión se cierre tras 15 minutos sin actividad.', 'Hueco de cobertura (salió de SE-01)'],
], anchos=[2.6, 1.8, 10.0, 3.2], fuente=8.5)
parrafo(doc, 'Resultado: la suite pasó de 31 a 34 casos, con once corregidos y tres nuevos. Los ocho requisitos '
             'del alcance (R1 a R8) siguen con cobertura del 100 %, y RNF02, que estaba en la tabla de calidad '
             'del plan pero sin caso, ahora tiene uno.', size=10.5)
salto(doc)

# ======================= 3. EJECUCIÓN DE LA SUITE =======================
doc.add_heading('3. Ejecución de la suite', level=1)
parrafo(doc,
    f"El ciclo 1 recorrió la suite completa en {NAV1 or 'Chrome'} sobre {SO or 'Windows'}, en Railway. El ciclo 2 "
    f"volvió en {NAV2 or 'Firefox'} sobre los casos fallidos y repitió los de riesgo alto que habían pasado —los "
    'ligados a R-01, R-02 y R-03, que son los de nivel 15 en la matriz del Entregable 1—. Cada caso del ciclo 2 '
    'lo ejecutó el integrante que no lo tuvo en el ciclo 1. Entre un ciclo y otro no se desplegó ninguna '
    'corrección, así que el ciclo 2 mide si los fallos son estables y si algo cambia con el navegador.')


def avance(c):
    total = M[f'dis{c}']
    hechos = total - M[f'pend{c}']
    return f'{round(hechos / total * 100)} %' if total else '—'


tabla(doc, [
    ['Ciclo', 'Aprobados', 'Fallidos', 'Bloqueados', 'Sin registrar', 'Avance'],
    [f"Ciclo 1 · {NAV1 or 'Chrome'}", str(M['aprob1']), str(M['fall1']), str(M['bloq1']), str(M['pend1']), avance(1)],
    [f"Ciclo 2 · {NAV2 or 'Firefox'}", str(M['aprob2']), str(M['fall2']), str(M['bloq2']), str(M['pend2']), avance(2)],
], anchos=[5.0, 2.2, 2.0, 2.2, 2.6, 1.8], fuente=9.5)

if M['pend1'] == 0 and M['pend2'] == 0:
    _repetidos = [c for c in FALL1 if (c, 2) in POR_CASO]
    _siguen = [c for c in _repetidos if estado_de(c, 2) == 'Fallido']
    _alto = [e['caso'] for e in C2 if e['caso'] not in FALL1]
    _alto_ok = [c for c in _alto if estado_de(c, 2) == 'Aprobado']
    texto = (f"De los {len(_repetidos)} casos que fallaron en el ciclo 1, {len(_siguen)} volvieron a fallar en "
             "Firefox con el mismo resultado" + (', así que ninguno es intermitente.' if len(_siguen) == len(_repetidos)
                                                 else f"; {ids(sorted(set(_repetidos) - set(_siguen)))} cambió.")
             + f" De los {len(_alto)} casos de riesgo alto que repetimos, {len(_alto_ok)} pasaron igual que en el ciclo 1.")
    if BLOQ1:
        texto += (f" {ids(BLOQ1)} {'quedó bloqueado' if len(BLOQ1) == 1 else 'quedaron bloqueados'} por el "
                  'entorno, no por el sistema; el motivo está en su fila del registro y en su captura.')
    parrafo(doc, texto)
else:
    parrafo(doc, 'Faltan ejecuciones por registrar; esta lectura se completa cuando los dos ciclos estén en el '
                 'registro.', size=10, italic=True)

parrafo(doc, 'Cómo decidimos el estado.', bold=True, space=2)
parrafo(doc,
    'Cuando el resultado esperado habla de la respuesta del servidor (un código HTTP), la verificamos en la '
    'pestaña Red de F12. Cuando habla de un mensaje en pantalla, el mensaje tiene que verse; si no aparece, el '
    'caso falla aunque el servidor haya respondido bien. Esta regla la necesitamos por DEF-13: los mensajes '
    'emergentes se generan pero no se ven, así que un caso cuyo resultado esperado es un mensaje falla, y uno '
    'cuyo resultado esperado es el código del servidor (como el 409 de CP-022) se puede aprobar.', size=10.5)

parrafo(doc, 'Extracto del registro de ejecución', bold=True, space=2)
parrafo(doc, 'El registro completo, con una fila por ejecución, está en la hoja de cálculo que citamos en la '
             'portada; aquí van las filas que mejor muestran cómo lo llevamos. La evidencia de cada ejecución '
             'está en el Anexo E; las capturas que respaldan un defecto van además debajo de su reporte, en el '
             'Anexo C.', size=10.5)
filas_ext = [['Caso', 'Fecha y quién', 'Estado', 'Resultado real (resumen)', 'Evidencia', 'Defecto']]
for cid in ['CP-001', 'CP-013', 'CP-016', 'CP-017', 'CP-022', 'CP-025', 'CP-029', 'CP-032', 'CP-034']:
    e = POR_CASO[(cid, 1)]
    filas_ext.append([cid, f"{v(e['fecha'])}\n{e['ejecuta']}", v(e['estado'], 'Pendiente'), resumen_real(e['real']),
                      '\n'.join(e['evidencias']) or '—', e['defecto'] or '—'])
tabla(doc, filas_ext, anchos=[1.6, 2.8, 1.7, 6.6, 3.3, 1.5], fuente=8.2)
salto(doc)

# ======================= 4. REPORTE DE DEFECTOS =======================
doc.add_heading('4. Reporte de defectos', level=1)
parrafo(doc, f'Los {len(DEFECTOS)} defectos están registrados con los trece campos del formato. Aquí va la tabla '
             'resumen; los reportes completos están en el Anexo C, con sus capturas. Usamos las escalas de '
             'severidad y prioridad del curso y en cada reporte justificamos las dos por separado.')
filas_def = [['ID', 'Título', 'Requisito', 'Severidad', 'Prioridad', 'Origen', 'Estado']]
for d in DEFECTOS:
    filas_def.append([d['id'], d['titulo'], d['requisito'], d['severidad'], d['prioridad'], d['origen'], d['estado']])
tabla(doc, filas_def, anchos=[1.5, 6.6, 2.0, 1.5, 1.5, 1.6, 1.6], fuente=8.2)
parrafo(doc, 'Cómo leemos el estado.', bold=True, space=2)
parrafo(doc,
    '«Abierto» quiere decir que un segundo integrante lo reprodujo siguiendo solo el reporte y que todavía no se '
    'ha corregido. ConectaProfe es nuestro, así que el ciclo de vida del defecto no se queda en «confirmado»: '
    'DEF-05 se corrigió el 29 de septiembre (commits 938bc53 y 693358a) y pasa a «Verificado» cuando repetimos '
    'sus pasos en Railway' + (f" (lo hicimos el {_d5['fecha']})" if _d5['fecha'] else '') + '. Para los abiertos, '
    'la corrección y la reejecución quedan programadas en las sesiones 14 y 15 del cronograma del Entregable 1.',
    size=10.5)
parrafo(doc, 'Severidad y prioridad no siempre coinciden.', bold=True, space=2)
parrafo(doc,
    f"En {sum(1 for d in DEFECTOS if d['severidad'] != d['prioridad'])} de los {len(DEFECTOS)} defectos son "
    'distintas. DEF-13 es de severidad media, porque el servidor acepta o rechaza bien cada acción, pero su '
    'prioridad es alta: afecta a todos los usuarios en todas las pantallas y se corrige cambiando el nombre de una '
    'clase. DEF-10 va al revés: guarda fechas que no existen, pero solo se llega por la API, así que su prioridad '
    'es baja.', size=10.5)
salto(doc)

# ======================= 5. PRUEBAS EXPLORATORIAS =======================
doc.add_heading('5. Pruebas exploratorias', level=1)
parrafo(doc, 'Cada integrante hace una sesión de 45 a 60 minutos, con la misión escrita antes de empezar y '
             'cronómetro, anotando con el minuto lo que hace y lo que ve. La hoja de cada sesión sale tal cual '
             'de sus notas.')
tabla(doc, [['Sesión', 'Misión', 'Integrante', 'Fecha y duración', 'Defectos']] + [
    [sid, MISIONES[sid], quien, f"{v(SESIONES.get(sid, {}).get('fecha'))} · {v(SESIONES.get(sid, {}).get('duracion'))} min",
     v(SESIONES.get(sid, {}).get('defectos'))]
    for sid, quien in (('SE-01', 'Esteban Palencia'), ('SE-02', 'Sebastián González González'))
], anchos=[1.6, 8.0, 3.2, 2.4, 2.4], fuente=8.8)
for sid, quien in (('SE-02', 'Sebastián González González'), ('SE-01', 'Esteban Palencia')):
    s = SESIONES.get(sid, {})
    parrafo(doc, f'Hoja de sesión · {sid}', bold=True, space=2)
    ficha(doc, [
        ('Identificador', sid),
        ('Integrante, fecha y duración', f"{quien} · {v(s.get('fecha'))} · {v(s.get('duracion'))} minutos"),
        ('Misión', MISIONES[sid]),
        ('Defectos', v(s.get('defectos'))),
        ('Preguntas y riesgos', v(s.get('preguntas'))),
        ('Distribución del tiempo', v(s.get('distribucion'), '____ % explorando la misión · ____ % investigando y documentando')),
    ])
    notas = NOTAS.get(sid) or [('', '', '')] * 4
    tabla(doc, [['Minuto', 'Qué hice', 'Qué vi']] + [[v(a, ''), v(b, ''), v(c, '')] for a, b, c in notas],
          anchos=[1.8, 7.4, 7.4], fuente=8.8)
    doc.add_paragraph()
salto(doc)

# ======================= 6. MÉTRICAS =======================
doc.add_heading('6. Métricas', level=1)


def pct(a, b):
    return f'{round(a / b * 100)} %' if b else '—'


_req = sum(1 for d in DEFECTOS if re.search(r'\bR[1-8]\b', d['requisito']))
tabla(doc, [
    ['Métrica', 'Cómo se calculó', 'Valor', 'Meta del plan'],
    ['Cobertura de requisitos', '8 requisitos con casos ÷ 8 del alcance', '100 %', '100 %'],
    ['Avance de ejecución · ciclo 1', f"{M['dis1'] - M['pend1']} registrados ÷ {M['dis1']}",
     pct(M['dis1'] - M['pend1'], M['dis1']), '100 %'],
    ['Prioridad alta ejecutada', f"{M['alta_ejec']} ejecutados ÷ {M['alta']}", pct(M['alta_ejec'], M['alta']), '100 %'],
    ['Tasa de aprobación · ciclo 1', f"{M['aprob1']} aprobados ÷ {M['ejec1']} ejecutados", pct(M['aprob1'], M['ejec1']), 'Se lee con el riesgo'],
    ['Tasa de aprobación · ciclo 2', f"{M['aprob2']} aprobados ÷ {M['ejec2']} ejecutados", pct(M['aprob2'], M['ejec2']), 'Se lee con el riesgo'],
    ['Tasa de bloqueo', f"{M['bloq1']} bloqueados ÷ 34 diseñados", pct(M['bloq1'], 34), 'Menos de 10 %'],
    ['Defectos reportados', 'Identificadores distintos', str(len(DEFECTOS)), '10 o más'],
    ['Defectos por severidad', 'Conteo por nivel',
     f"{_sev['Crítica']} crítica · {_sev['Alta']} altas · {_sev['Media']} medias · {_sev['Baja']} bajas", 'Sin críticos abiertos'],
    ['Densidad por requisito', f'{_req} defectos de R1 a R8 ÷ 8 requisitos', f'{_req / 8:.1f}'.replace('.', ','), '—'],
    ['Defectos verificados', 'Corregidos y comprobados ÷ reportados',
     f"{sum(1 for d in DEFECTOS if d['estado'] == 'Verificado')} de {len(DEFECTOS)}", '—'],
    ['Reproducción cruzada', 'Defectos reproducidos por el otro integrante ÷ reportados',
     f"{M['repro_hechas']} de {len(DEFECTOS)}", '100 %'],
    ['Evidencia registrada', 'Capturas de ejecución ÷ ejecuciones', pct(M['capturas'], M['capturas_esperadas']), '100 %'],
], anchos=[4.5, 6.5, 3.2, 3.4], fuente=8.6)
doc.add_paragraph()
figura(doc, GRAFICO, 'Defectos por requisito y severidad. Fuente: registro de defectos del equipo.',
       ancho_cm=15.5, comprimir=False)
parrafo(doc, 'La lectura.', bold=True, space=2)
if M['pend1'] == 0 and M['pend2'] == 0 and M['ejec1']:
    _por13 = [e['caso'] for e in EJEC if e['ciclo'] == 1 and e['estado'] == 'Fallido' and e['defecto'] == 'DEF-13']
    parrafo(doc,
        f"El {pct(M['aprob1'], M['ejec1'])} de aprobación del ciclo 1 parece aceptable, pero hay que mirar qué falló: "
        f"de los {M['fall1']} casos fallidos, {len(_por13)} fallaron solo porque el sistema no muestra sus mensajes "
        f"(DEF-13){' (' + ids(_por13) + ')' if _por13 else ''}, y el resto toca reglas que el estudiante y el docente "
        f"usan a diario o la seguridad de la sesión. El {pct(M['aprob2'], M['ejec2'])} del ciclo 2 no significa que "
        'el sistema empeorara: ese ciclo se armó justamente con lo que había fallado.', size=10.5)
else:
    parrafo(doc, 'Las tasas se leen cuando los dos ciclos estén completos en el registro.', size=10, italic=True)
parrafo(doc,
    'El análisis de riesgos del Entregable 1 acertó en el requisito más importante: R5 tenía el riesgo más alto '
    'de la matriz (R-03, nivel 15) y es donde se concentran los defectos, incluido el único crítico. R6 lo '
    'habíamos calificado como riesgo medio (R-11, nivel 9) y aportó un defecto alto, DEF-08; en el Entregable 3 '
    'sube a riesgo alto. Lo que la matriz no vio fue la zona horaria: DEF-08 y DEF-12 tienen la misma causa (el '
    'servidor trabaja en UTC y la aplicación en hora de Colombia) y ningún riesgo la mencionaba. Tampoco estaban '
    'en la matriz RNF02 (DEF-01) ni los mensajes al usuario (DEF-13). La matriz miró los requisitos correctos, '
    'pero se quedó corta en los riesgos transversales.', size=10.5)
salto(doc)

# ======================= 7. EVALUACIÓN Y RECOMENDACIÓN =======================
doc.add_heading('7. Evaluación y recomendación', level=1)
parrafo(doc, 'Revisamos uno por uno los criterios de salida de la sección 4.2 del Entregable 1.')
_alta_falta = [e['caso'] for e in EJEC if e['ciclo'] == 1 and CASOS[e['caso']]['prioridad'] == 'Alta'
               and e['estado'] not in ('Aprobado', 'Fallido')]
tabla(doc, [
    ['N.º', 'Criterio de salida definido en el Entregable 1', '¿Se cumple?', 'Evidencia'],
    ['1', 'El 100 % de los casos de prioridad alta se ejecutó.', 'Sí' if not _alta_falta else 'Parcial',
     f"{M['alta_ejec']} de {M['alta']} casos de prioridad alta ejecutados"
     + (f"; faltan {ids(_alta_falta)}." if _alta_falta else '.')],
    ['2', 'No quedan defectos de severidad crítica o alta sin resolver o sin plan de acción.',
     'Sí, con plan' if not _crit_abiertos else 'Pendiente',
     'El crítico (DEF-05) está corregido' + (' y verificado en Railway.' if not _crit_abiertos else '; falta verificarlo en Railway.')
     + ' Los dos altos (DEF-01 y DEF-08) siguen abiertos con plan: corrección en la sesión 14 y reejecución de '
     'CP-034 y CP-025 en la 15.'],
    ['3', 'La matriz de trazabilidad conserva el 100 % de cobertura de requisitos.', 'Sí',
     'Ocho de ocho requisitos con casos después de los cambios de la sección 2; RNF02 suma CP-034.'],
], anchos=[1.0, 6.0, 2.4, 7.2], fuente=8.8)
recuadro(doc,
    'Recomendación del equipo: apto con condiciones. '
    + ('Los criterios se cumplen, pero el segundo solo porque los defectos altos tienen un plan, no porque estén '
       'cerrados. ' if not _alta_falta and not _crit_abiertos else
       'Hay criterios que todavía no se cumplen del todo (ver la tabla), y el segundo depende de que los defectos '
       'altos tengan un plan, no de que estén cerrados. ')
    + 'Por eso no decimos «apto» a secas. ConectaProfe se puede liberar una vez corregidos DEF-01 y DEF-08, y '
    'recomendamos incluir en la misma corrección a DEF-13, DEF-02 y DEF-07: tienen prioridad alta y se arreglan '
    'con muy poco código. Después hay que volver a ejecutar los casos fallidos.', bold_primero=True)
parrafo(doc, 'Riesgos residuales.', bold=True, space=2)
_g = [c for c in ('CP-014', 'CP-015') if estado_de(c) == 'Bloqueado']
parrafo(doc,
    (f"{ids(_g)} {'depende' if len(_g) == 1 else 'dependen'} de la configuración de Google en Railway y "
     f"{'quedó bloqueado' if len(_g) == 1 else 'quedaron bloqueados'}; hay que repetirlos cuando esa configuración "
     'esté lista. ' if _g else '')
    + 'La corrección de DEF-08 y DEF-12 debe calcular las horas en la zona de Colombia y no depender de la del '
    'servidor, porque si Railway cambia de región el desfase puede cambiar de tamaño.', size=10.5)
salto(doc)

# ======================= 8. LECCIONES Y AUTOMATIZACIÓN =======================
doc.add_heading('8. Lecciones y paso a la automatización', level=1)
parrafo(doc, 'Lo que haríamos distinto en el diseño', bold=True, space=2)
for t in [
    'Un resultado esperado tiene que decir dónde se observa. En cuatro casos citamos el mensaje de la API '
    'mientras los pasos iban por el formulario, y el formulario muestra otro texto. Desde ahora cada resultado '
    'esperado dice si se mira en la pantalla o en la red.',
    'Escribimos un caso mirando el código y no el requisito. CP-013 esperaba el bloqueo en el sexto intento '
    'porque así está programado, y por eso nunca iba a fallar. El resultado esperado sale del requisito; si el '
    'código dice otra cosa, eso es lo que la prueba tiene que encontrar.',
    'Que una regla se cumpla en la pantalla no quiere decir que se cumpla en el sistema, ni al revés. CP-019 '
    'pasó por la validación del formulario mientras el servidor acepta la fecha de hoy (DEF-02, DEF-10); en '
    'CP-017 pasa lo contrario. Las reglas de riesgo alto las vamos a probar en las dos capas.',
    'Dimos por hecho que los mensajes se veían. DEF-13 estuvo en todas las pantallas y solo lo notamos cuando un '
    'caso esperaba un mensaje concreto. Una suite también tiene que verificar lo que el usuario ve, no solo lo '
    'que el servidor responde.',
    'Las precondiciones que dependen del reloj salieron caras. CP-024, CP-025 y CP-026 necesitaban tutorías a 12 '
    'horas, a 26 horas o vencidas, y hubo que planearlas en el calendario: programarlas de noche para la mañana '
    'siguiente o un día antes. Al escribir un caso hay que pensar también cuándo se puede ejecutar.',
    'Hacer las sesiones exploratorias antes del ciclo 1 fue de lo mejor que decidimos: aportaron seis de los '
    'catorce defectos y dieron origen a CP-034.',
]:
    numerada(doc, t)
parrafo(doc, 'Candidatos a automatizar en el Entregable 3', bold=True, space=2)
parrafo(doc, 'Ya tenemos una base: un script de Playwright que recorre la suite sobre una copia local del mismo '
             'commit y que usamos para preparar los casos. Para el Entregable 3 priorizamos estos casos por '
             'riesgo, repetición y estabilidad.', size=10.5)
tabla(doc, [
    ['Caso', 'Qué prueba', 'Por qué se automatiza', 'Criterio'],
    ['CP-001 a CP-004', 'Reglas de la contraseña en el registro', 'Se repiten en cada versión y el resultado es un mensaje concreto', 'Repetición'],
    ['CP-008', 'Registro con rol de administrador', 'Cubre R-01, el riesgo más grave de la matriz', 'Riesgo'],
    ['CP-013', 'Bloqueo después del tercer intento', 'Cubre DEF-04; a mano obliga a esperar entre corridas', 'Riesgo · costo'],
    ['CP-018 y CP-021', 'Control de acceso y docente inexistente', 'Cubren R-02 y R-03 y se verifican solo con el código de respuesta', 'Riesgo · estabilidad'],
    ['CP-024 y CP-025', 'Antelación de 24 horas para cancelar', 'Cubren DEF-08; con el reloj del navegador se prueban varias zonas', 'Riesgo · costo'],
    ['CP-032 y CP-033', 'Fecha de hoy desde el administrador y choque del estudiante', 'Cubren DEF-02 y DEF-09 en la capa del servidor', 'Riesgo'],
    ['Nuevo', 'Visibilidad de los mensajes emergentes', 'Cubre DEF-13: comprueba que el mensaje aparezca en pantalla, no solo en el código', 'Riesgo · repetición'],
], anchos=[2.6, 5.2, 6.8, 2.4], fuente=8.6)
parrafo(doc,
    'No automatizamos CP-014 y CP-015 (Google): dependen de un proveedor externo y de cuentas reales. Tampoco '
    'CP-031 por ahora: la tabla de usuarios va a cambiar cuando se corrija DEF-11, y automatizar una pantalla '
    'que se va a rehacer es trabajo perdido.', size=10.5)
salto(doc)

# ======================= ANEXO B: LISTA DE VERIFICACIÓN =======================
doc.add_heading('Anexo B. Lista de verificación', level=1)
_por_persona = Counter(e['ejecuta'] for e in EJEC if e['hecho'])
_campos_ok = all(e['hecho'] and e['fecha'] and e['navegador'] and e['so'] and any(e['rutas']) for e in EJEC)
_def_ev = all(any(d['rutas']) for d in DEFECTOS)


def si(cond, parcial='Pendiente'):
    return 'Sí' if cond else parcial


tabla(doc, [
    ['N.º', 'Verificación', '✓', 'Dónde se comprueba'],
    ['1', 'Tabla de reparto firmada después de la portada.', 'Pendiente', 'Anexo A; falta la firma de los dos'],
    ['2', 'El resumen ejecutivo cabe en una página e incluye la recomendación.', 'Sí', 'Sección 1'],
    ['3', 'Los cambios a la suite del Entregable 1 están listados con su razón.', 'Sí', 'Sección 2, ocho filas'],
    ['4', 'El ciclo 1 cubre toda la suite; el ciclo 2, lo fallido y el riesgo alto, en Firefox.',
     si(M['pend1'] == 0 and M['pend2'] == 0), 'Sección 3 y registro'],
    ['5', 'Cada ejecución tiene estado, entorno, versión, fecha, ejecutor y evidencia.', si(_campos_ok),
     'Registro (xlsx) y Anexo E'],
    ['6', 'Ningún caso bloqueado está registrado como fallido.', 'Sí',
     (f'{ids(BLOQ1)} como «Bloqueado»' if BLOQ1 else 'Sin casos bloqueados') if M['pend1'] == 0 else 'Registro'],
    ['7', 'Cada integrante ejecutó al menos seis casos.',
     si(all(_por_persona.get(i, 0) >= 6 for i in EQUIPO['integrantes'])),
     ' · '.join(f"{i.split()[0]}: {_por_persona.get(i, 0)}" for i in EQUIPO['integrantes'])],
    ['8', 'Hay diez defectos o más, con todos los campos.', si(M['def_hechos'] == len(DEFECTOS), 'Parcial'),
     f'Sección 4 y Anexo C ({len(DEFECTOS)} defectos; {M["def_hechos"]} con los datos de Railway)'],
    ['9', 'Cada integrante reportó al menos dos defectos.', 'Sí', 'Tabla de reparto'],
    ['10', 'Cada defecto enlaza con su caso o sesión y tiene evidencia propia.', si(_def_ev, 'Parcial'),
     'Columna «Origen»; capturas debajo de cada reporte (Anexo C)'],
    ['11', 'Hay una hoja de sesión exploratoria por integrante.',
     si(all(SESIONES.get(s, {}).get('fecha') and NOTAS.get(s) for s in ('SE-01', 'SE-02'))), 'Sección 5'],
    ['12', 'Las métricas están bien calculadas, por ciclo, y hay al menos un gráfico.',
     si(M['pend1'] == 0 and M['pend2'] == 0), 'Sección 6, figura 1'],
    ['13', 'Los criterios de salida se revisan uno por uno.', 'Sí', 'Sección 7, tres criterios'],
    ['14', 'La recomendación es explícita.', 'Sí', 'Sección 7: apto con condiciones'],
    ['15', 'Los archivos tienen los nombres pedidos y los enlaces abren.', 'Pendiente',
     'Falta pegar en la portada el enlace de la carpeta compartida'],
], anchos=[1.0, 8.6, 1.8, 5.2], fuente=8.8)
salto(doc)

# ======================= ANEXO C: REPORTES COMPLETOS =======================
doc.add_heading('Anexo C. Reportes completos de defectos', level=1)
parrafo(doc, 'Cada reporte tiene los trece campos. El entorno, la fecha, la frecuencia y el resultado real son '
             'los de quien lo ejecutó en Railway; debajo de cada reporte van sus capturas, numeradas como figuras.',
        size=10, italic=True)
MOSTRADAS = {}
for d in DEFECTOS:
    doc.add_heading(f"{d['id']} · {d['titulo']}", level=3)
    rep = REPRO.get(d['id'], {})
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
        ('Evidencia', '; '.join(cita(x) for x in d['evidencias'])),
        ('Origen', d['origen']),
        ('Reportado por', f"{d['reporta']} · reproducido por {d['reproduce']}"
         + (f" el {rep['fecha']} ({rep['resultado'].lower()})" if rep.get('resultado') else ' (pendiente)')),
    ])
    for nombre, ruta in zip(d['evidencias'], d['rutas']):
        if ruta:
            assert proxima_figura() == FIG[nombre], 'la numeración de figuras se desfasó'
            MOSTRADAS[nombre] = figura(doc, ruta, f"{d['id']} · {nombre}. Captura de {d['reporta']} en Railway"
                                       + (f", {d['fecha']}" if d['fecha'] else ''))
        else:
            recuadro_captura(doc, f'Falta la captura {nombre}\nLa toma {d["reporta"]} en Railway', alto_cm=3.2)
    doc.add_paragraph()

# ======================= ANEXO D: COMANDOS DE CONSOLA =======================
titulo_en_pagina_nueva(doc, 'Anexo D. Comandos para la consola del navegador (F12)', nivel=1)
parrafo(doc,
    'Estas son las pruebas que se hacen desde la consola del navegador. En cinco se pega un fetch(): cuatro con el '
    'token de la sesión y el de CP-008 sin sesión, como lo haría un visitante. En la sexta (DEF-13) se inspecciona '
    'el elemento del mensaje emergente. Van con el comando exacto para copiar y pegar; la captura de cada una es '
    'la de su ejecución en Railway, con la consola abierta y la respuesta a la vista.', size=10.5)
parrafo(doc,
    'En DEF-06 hay que cambiar ID por el número de una tutoría cancelada (se ve en la pestaña Red) y entrar como '
    'su docente; en DEF-10, docente_id tiene que ser el de un docente activo. Firefox pide escribir «permitir '
    'pegar» antes de dejar pegar en la consola, y Chrome «allow pasting».', size=10, italic=True)
with open(os.path.join(BUILD, '..', 'resultados', 'consola', 'resultados.json'), encoding='utf-8') as _f:
    _consola = json.load(_f)['pruebas']
_capturas_consola = {
    'CP-008': ['EV-CP008-C1-01.png', 'EV-CP008-C2-01.png'], 'CP-018': ['EV-CP018-C1-01.png', 'EV-CP018-C2-01.png'],
    'CP-021': ['EV-CP021-C1-01.png', 'EV-CP021-C2-01.png'], 'DEF-06': ['EV-DEF06-01.png'],
    'DEF-10': ['EV-DEF10-01.png'], 'DEF-13': ['EV-CP024-C1-01.png'],
}
for pr in _consola:
    comando = re.sub(r'/api/tutorias/\d+/realizada', '/api/tutorias/ID/realizada', pr['comando'])
    if pr['id'] == 'DEF-10':
        comando = re.sub(r'docente_id:\d+', 'docente_id:9', comando)
    doc.add_heading(f"{pr['id']} · {pr['titulo']}", level=3)
    parrafo(doc, pr['descripcion'], size=10.5, space=3)
    codigo(doc, comando)
    ficha(doc, [
        ('Requisito', pr['requisito']),
        ('Resultado esperado', pr['esperado']),
        ('Captura', '; '.join(cita(x) for x in _capturas_consola.get(pr['id'], []))),
    ])
    doc.add_paragraph()

# ======================= ANEXO E: EVIDENCIA DE CADA EJECUCIÓN =======================
titulo_en_pagina_nueva(doc, 'Anexo E. Evidencia de cada ejecución (ciclos 1 y 2)', nivel=1)
parrafo(doc,
    'Las capturas de cada ejecución en Railway, en el orden de la suite. En cada una se ven la barra de '
    'direcciones y la hora de Windows; las de consola muestran el comando y la respuesta. Cuando una captura '
    'ya está debajo del reporte de su defecto (Anexo C), aquí solo se dice en qué figura verla.', size=10.5)
_faltan = [(e, n) for e in EJEC for n, r in zip(e['evidencias'], e['rutas']) if not r]
if _faltan:
    parrafo(doc, f'Capturas que todavía faltan ({len(_faltan)})', bold=True, space=2)
    tabla(doc, [['Caso', 'Ciclo', 'Captura', 'La toma']] +
          [[e['caso'], str(e['ciclo']), n, e['ejecuta']] for e, n in _faltan],
          anchos=[2.0, 1.4, 6.0, 6.0], fuente=8.5)
for ciclo in (1, 2):
    lista = [e for e in EJEC if e['ciclo'] == ciclo and any(e['rutas'])]
    if not lista:
        continue
    doc.add_heading(f"E.{ciclo} Ciclo {ciclo} · {NAV1 if ciclo == 1 else NAV2}", level=2)
    for e in lista:
        for nombre, ruta in zip(e['evidencias'], e['rutas']):
            if not ruta:
                continue
            if nombre in MOSTRADAS:
                parrafo(doc, f"{nombre} ({e['caso']}, ciclo {ciclo}, {e['estado']}): se ve en la figura "
                             f"{MOSTRADAS[nombre]}, en el Anexo C.", size=9.5, italic=True, space=8)
                continue
            assert proxima_figura() == FIG[nombre], 'la numeración de figuras se desfasó'
            MOSTRADAS[nombre] = figura(doc, ruta,
                f"{e['caso']} · ciclo {ciclo} · {v(e['estado'], 'sin estado')} · {nombre}. {CASOS[e['caso']]['titulo']}. "
                f"{e['ejecuta']}, {v(e['fecha'])}, {v(e['navegador'])}", ancho_cm=12.5)

salida = os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2', 'E2_F_Equipo.docx')
os.makedirs(os.path.dirname(salida), exist_ok=True)
doc.save(salida)
print('Guardado', salida)
