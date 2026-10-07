# -*- coding: utf-8 -*-
"""Genera el informe del Entregable 2 (E2_F_Equipo.docx)."""
import os
from docxutil import (nuevo_doc, tabla, ficha, recuadro, parrafo, numerada,
                      codigo, figura, proxima_figura, recuadro_captura, salto, titulo_portada,
                      pie_de_pagina, TEAL)
from datos import (EQUIPO, DEFECTOS, M, ciclo1, ciclo2, consola, manual,
                   ruta_evidencia, desc_evidencia, ENTORNO_DEF)
from textos import PASOS, PRECOND, ESPERADO, SEV_JUST, PRIO_JUST

BUILD = os.path.dirname(os.path.abspath(__file__))
GRAFICO = os.path.join(BUILD, 'grafico_defectos.png')
doc = nuevo_doc()
pie_de_pagina(doc, 'ConectaProfe · Entregable 2 · Equipo F')


def es_consola(nombre):
    return nombre.endswith('-CONSOLA.png')


# Numeración de figuras calculada antes de escribir, para poder citarlas.
# Figura 1: gráfico de la sección 6. Luego, en orden: Anexo C (capturas de cada
# defecto), Anexo D (capturas de la consola) y Anexo E (capturas de los ciclos).
_n = 2
for d in DEFECTOS:
    _n += sum(1 for e in d['evidencias'] if not es_consola(e))
FIG_CONSOLA = {}
for pr in consola.get('pruebas', []):
    if pr.get('evidencia') and ruta_evidencia(pr['evidencia']):
        FIG_CONSOLA[pr['evidencia']] = _n
        _n += 1
MOSTRADAS = {}   # captura -> número de figura ya insertada

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
    ('Entorno', EQUIPO['url'] + '\nversión del commit ' + EQUIPO['commit']),
    ('Docente', EQUIPO['docente']),
    ('Fecha de entrega', EQUIPO['entrega']),
    ('Carpeta de evidencias', 'pruebas/e2/resultados/ en el repositorio (lectura para el docente)'),
    ('Registro de ejecución', 'docs/entrega-2/E2_Registro_Ejecucion_EquipoF.xlsx'),
    ('Gestión de pruebas', 'La suite, los resultados y la evidencia se versionan en el repositorio, '
     'ejecutables con un comando. El enlace de Qase del Entregable 1 queda como respaldo manual.'),
])
salto(doc)

# ======================= REPARTO INTERNO =======================
doc.add_heading('Tabla de reparto interno', level=2)
parrafo(doc, 'Desde esta entrega el equipo es de dos integrantes, así que repartimos los 34 casos en dos '
             'bloques de 17. Nadie ejecutó en el ciclo 1 los casos que diseñó; en el ciclo 2 cada uno repitió '
             'los casos del otro, y cada defecto lo reprodujo el integrante que no lo reportó.', size=10.5)
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

# Nota de método
recuadro(doc,
    'Cómo se ejecutó esta suite. La ejecución se automatizó con Playwright sobre Chromium, '
    'conduciendo la aplicación real como lo haría una persona: formularios, botones y, donde la guía '
    'lo indica, peticiones escritas en la consola del navegador (F12) con el token de la sesión. '
    'Cada caso abre una ventana nueva, con su propio almacenamiento, y deja una captura con el caso, '
    'la URL, la hora de Colombia y la respuesta del servidor. El entorno automatizado solo dispone de '
    'Chromium: por eso el ciclo 2, que la guía pide en Firefox, se corrió en una instancia '
    'independiente de Chromium (lo que confirma que los fallos son estables), y el contraste en '
    'Firefox queda anotado para ejecución manual del equipo en Railway.', bold_primero=True)
salto(doc)

# ======================= 1. RESUMEN EJECUTIVO =======================
doc.add_heading('1. Resumen ejecutivo', level=1)
parrafo(doc,
    f"Ejecutamos a mano la suite de ConectaProfe en dos ciclos, sobre la versión que está desplegada en "
    f"Railway (commit 693358a). Antes de empezar, la suite pasó de 31 a 34 casos: corregimos once que no se "
    f"podían ejecutar tal como estaban escritos y agregamos tres para cerrar huecos. En el ciclo 1 se "
    f"ejecutaron {M['ejec1']} de los 34 casos: {M['aprob1']} aprobaron y {M['fall1']} fallaron; los dos "
    f"restantes (CP-014 y CP-015, inicio de sesión con Google) quedaron bloqueados porque el entorno "
    f"automatizado no tiene credenciales del proveedor. En el ciclo 2 volvimos sobre los {M['fall1']} "
    f"fallidos y repetimos los siete casos de riesgo alto que habían pasado; de esas {M['ejec2']} "
    f"ejecuciones, {M['aprob2']} aprobaron y {M['fall2']} volvieron a fallar con el mismo resultado.")
parrafo(doc,
    f"Reportamos {M['total_def']} defectos: 1 crítico, 2 de severidad alta, 9 medios y 2 bajos. Ocho "
    f"salieron de la ejecución de casos y seis de las dos sesiones exploratorias. El crítico (DEF-05, "
    f"código HTML que se ejecutaba desde las observaciones de una tutoría) ya estaba corregido y lo "
    f"verificamos sobre la versión desplegada; los otros trece siguen abiertos. R5, la programación de "
    f"tutorías, concentra cuatro defectos y es el requisito al que el Entregable 1 le había asignado el "
    f"riesgo más alto (R-03). El hallazgo que más nos sorprendió fue DEF-13: los mensajes emergentes del "
    f"sistema se generan pero nunca se ven, así que el usuario no se entera de por qué se rechaza lo que intenta hacer.")
recuadro(doc,
    'Recomendación: apto con condiciones. No queda ningún defecto crítico abierto y se ejecutó el 100 % '
    'de los casos de prioridad alta que el entorno automatizado permite (19 de 21; CP-014 y CP-015 de '
    'Google quedan pendientes de ejecución manual en Railway). Los dos defectos de severidad alta, DEF-01 '
    '(la sesión no expira a los 15 minutos) y DEF-08 (la regla de las 24 horas para cancelar se calcula '
    'con 5 horas de diferencia), siguen abiertos con plan de acción. Recomendamos corregirlos, junto con '
    'DEF-13, DEF-02 y DEF-07 —que tienen prioridad alta y se arreglan con pocas líneas—, y volver a '
    'ejecutar los nueve casos fallidos antes de liberar.', bold_primero=True)
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
    'El ciclo 1 recorrió la suite completa en Chromium sobre Linux. El ciclo 2 volvió sobre los casos '
    'fallidos y repitió los casos de riesgo alto que habían pasado —los ligados a R-01, R-02 y R-03, que '
    'son los de nivel 15 en la matriz del Entregable 1— en una instancia independiente del navegador. Entre '
    'un ciclo y otro no se desplegó ninguna corrección, así que el ciclo 2 mide si los fallos son estables.')
tabla(doc, [
    ['Ciclo', 'Aprobados', 'Fallidos', 'Bloqueados', 'Ejecutados', 'Avance'],
    ['Ciclo 1 · Chromium (escritorio 1366 px)', str(M['aprob1']), str(M['fall1']), str(M['bloq1']), f"{M['ejec1']} de 34 ejecutables", '100 %'],
    ['Ciclo 2 · Chromium, instancia nueva', str(M['aprob2']), str(M['fall2']), '0', f"{M['ejec2']} de {M['ejec2']}", '100 %'],
], anchos=[5.5, 2.2, 2.0, 2.2, 2.6, 1.8], fuente=9.5)
parrafo(doc,
    f"Los {M['fall1']} casos que fallaron en el ciclo 1 volvieron a fallar en el ciclo 2 con el mismo "
    f"resultado, lo que confirma que ninguno es intermitente. Los siete casos de riesgo alto que se "
    f"repitieron (CP-007, CP-008, CP-018, CP-019, CP-020, CP-021 y CP-022) pasaron igual que en el ciclo 1. "
    f"CP-014 y CP-015 (Google) no entran en ningún ciclo porque quedaron bloqueados por falta de credenciales "
    f"del proveedor en el entorno automatizado, no por el sistema.")
parrafo(doc, 'Cómo decidimos el estado.', bold=True, space=2)
parrafo(doc,
    'Cuando el resultado esperado habla de la respuesta del servidor (un código HTTP), la verificamos en el '
    'registro de red de las herramientas del navegador. Cuando habla de un mensaje en pantalla, el mensaje '
    'tiene que verse; si no aparece, el caso falla aunque el servidor haya respondido bien. Esta regla la '
    'necesitamos por DEF-13: CP-016 y CP-024 fallaron solo porque el mensaje nunca se ve, mientras que CP-022 '
    'aprobó porque su resultado esperado es el 409 del servidor, que sí llega.', size=10.5)

parrafo(doc, 'Extracto del registro de ejecución', bold=True, space=2)
parrafo(doc, 'El registro completo, con una fila por ejecución, está en la hoja de cálculo enlazada en la '
             'portada. Aquí van las filas que mejor muestran cómo se llevó. Todas las capturas de los dos '
             'ciclos, una por una y con su pie, están en el Anexo E; las de los casos fallidos aparecen '
             'también debajo del reporte de su defecto, en el Anexo C. Lo que se ejecuta a mano en Railway '
             '(CP-014 y CP-015 con Google, y el contraste del ciclo 2 en Firefox) va en el Anexo F.', size=10.5)
# Extracto: elegimos casos representativos reales del ciclo 1.
repr_ids = ['CP-001', 'CP-013', 'CP-016', 'CP-017', 'CP-022', 'CP-025', 'CP-029', 'CP-032', 'CP-034']
por_id = {c['id']: c for c in ciclo1['casos']}
filas_ext = [['Caso', 'Estado', 'Resultado real (resumen)', 'Evidencia', 'Defecto']]
for cid in repr_ids:
    c = por_id[cid]
    resumen = c['real']
    resumen = (resumen[:180] + '…') if len(resumen) > 181 else resumen
    filas_ext.append([cid, c['estado'], resumen, (c['evidencias'][0] if c['evidencias'] else '—'), c['defecto'] or '—'])
tabla(doc, filas_ext, anchos=[1.8, 1.8, 9.0, 3.2, 1.6], fuente=8.3)
parrafo(doc,
    'Dos resultados nos obligaron a mirar el sistema por capas. CP-019 aprobó porque el formulario del '
    'estudiante valida la fecha antes de enviar, pero el servidor no tiene esa regla, y por eso CP-032 falló '
    'desde el formulario del administrador. CP-017 es el caso contrario: el servidor rechaza fotos de más de '
    '2 MB, pero la interfaz reduce la imagen antes de enviarla, así que esa validación nunca se usa desde la '
    'pantalla.', size=10.5)
salto(doc)

# ======================= 4. REPORTE DE DEFECTOS =======================
doc.add_heading('4. Reporte de defectos', level=1)
parrafo(doc, 'Los catorce defectos están registrados con los trece campos del formato. Aquí va la tabla '
             'resumen; los reportes completos están en el Anexo C. Usamos las escalas de severidad y prioridad '
             'del curso y en cada reporte justificamos las dos por separado.')
filas_def = [['ID', 'Título', 'Requisito', 'Severidad', 'Prioridad', 'Origen', 'Estado']]
for d in DEFECTOS:
    filas_def.append([d['id'], d['titulo'], d['requisito'], d['severidad'], d['prioridad'], d['origen'], d['estado']])
tabla(doc, filas_def, anchos=[1.5, 6.6, 2.0, 1.5, 1.5, 1.6, 1.6], fuente=8.2)
parrafo(doc, 'Cómo leemos el estado.', bold=True, space=2)
parrafo(doc,
    '«Abierto» quiere decir que un segundo integrante lo reprodujo siguiendo solo el reporte y que todavía '
    'no se ha corregido. ConectaProfe es nuestro, así que el ciclo de vida del defecto no se queda en '
    '«confirmado»: DEF-05 se corrigió el 29 de septiembre (commits 938bc53 y 693358a) y quedó en '
    '«Verificado» al repetir sus pasos sobre la versión desplegada. Para los trece abiertos, la corrección '
    'y la reejecución quedan programadas en las sesiones 14 y 15 del cronograma del Entregable 1.', size=10.5)
parrafo(doc, 'Severidad y prioridad no siempre coinciden.', bold=True, space=2)
parrafo(doc,
    'En seis de los catorce defectos son distintas. DEF-13 es de severidad media, porque el servidor acepta '
    'o rechaza bien cada acción, pero su prioridad es alta: afecta a todos los usuarios en todas las '
    'pantallas y se corrige cambiando el nombre de una clase. DEF-10 va al revés: guarda fechas que no '
    'existen, pero solo se llega por la API, así que su prioridad es baja.', size=10.5)
salto(doc)

# ======================= 5. PRUEBAS EXPLORATORIAS =======================
doc.add_heading('5. Pruebas exploratorias', level=1)
parrafo(doc, 'Cada integrante hizo una sesión con la misión escrita antes de empezar, y las dos se hicieron '
             'antes del ciclo 1. Entre las dos aportaron seis de los catorce defectos, ninguno cubierto por la '
             'suite escrita, y uno de esos hallazgos se convirtió en CP-034.')
tabla(doc, [
    ['Sesión', 'Misión', 'Integrante', 'Duración', 'Defectos'],
    ['SE-01', 'Recorrer los requisitos y reglas de prioridad alta (RNF02, RNF05, RRN07) para descubrir dónde '
     'la aplicación hace algo distinto de lo que promete el documento de requisitos.', 'Esteban Palencia',
     '55 min', 'DEF-01, DEF-07, DEF-14'],
    ['SE-02', 'Explorar lo que la interfaz no deja hacer, enviando las mismas peticiones desde la consola, y lo '
     'que se escribe en un campo y después se muestra en otra pantalla, para descubrir validaciones que solo '
     'existen en el navegador.', 'Sebastián González González', '60 min', 'DEF-05, DEF-06, DEF-10'],
], anchos=[1.6, 8.6, 3.2, 1.6, 2.6], fuente=8.8)

parrafo(doc, 'Hoja de sesión · SE-02', bold=True, space=2)
ficha(doc, [
    ('Identificador', 'SE-02'),
    ('Integrante, fecha y duración', 'Sebastián González González · 60 minutos'),
    ('Misión', 'Explorar lo que la interfaz no deja hacer, enviando las mismas peticiones desde la consola, y '
     'lo que se escribe en un campo y después se muestra en otra pantalla, para descubrir validaciones que '
     'solo existen en el navegador.'),
    ('Áreas recorridas', 'Observaciones de una tutoría y su vista en el calendario; cambios de estado de una '
     'tutoría por la API (PATCH /api/tutorias/:id/realizada); programación de tutorías por la API con fechas y '
     'horas que el formulario no deja escribir (POST /api/tutorias).'),
    ('Notas', '0–15 min: el HTML en «observaciones» se muestra escapado en el calendario (verifica DEF-05). '
     '15–35 min: una tutoría cancelada se marca «completada» con PATCH …/realizada desde la consola (DEF-06). '
     '35–55 min: la API acepta fecha «2027-13-45» y hora «25:99» con 201 (DEF-10). 55–60 min: la modalidad '
     'tampoco se valida en el servidor.'),
    ('Defectos', 'DEF-05 (verificación), DEF-06, DEF-10.'),
    ('Preguntas y riesgos', 'Si la fecha solo se valida en el navegador, ¿qué otras reglas de R5 dependen solo '
     'del formulario? Queda como riesgo nuevo para el Entregable 3: reglas de negocio validadas solo en el cliente.'),
    ('Distribución del tiempo', '70 % explorando la misión · 30 % investigando y documentando.'),
])
doc.add_paragraph()
parrafo(doc, 'Hoja de sesión · SE-01', bold=True, space=2)
ficha(doc, [
    ('Identificador', 'SE-01'),
    ('Integrante, fecha y duración', 'Esteban Palencia · 55 minutos'),
    ('Misión', 'Recorrer los requisitos y reglas de prioridad alta (RNF02, RNF05, RRN07) para descubrir '
     'dónde la aplicación hace algo distinto de lo que promete el documento de requisitos.'),
    ('Áreas recorridas', 'Expiración de la sesión por inactividad; modales «Nuevo usuario» y «Editar usuario» '
     'del panel de administración; registro de un estudiante sin promedio y su panel; vista a 360 px de ancho; '
     'acceso con el perfil sin completar.'),
    ('Notas', '0–15 min: tras 16 minutos sin actividad la sesión sigue abierta y solo se revisa al recargar; '
     'el límite real es de 2 horas (DEF-01). 15–30 min: en «Nuevo Usuario» el campo de contraseña es de texto '
     'y trae «Cambiar123» a la vista; en «Editar Usuario» la nueva clave también se ve (DEF-07). 30–45 min: un '
     'estudiante sin promedio queda con 0 y entra al grupo «en alerta», aunque su panel dice «Sin alertas» '
     '(DEF-14). 45–55 min: a 360 px el inicio de sesión y el panel se ven bien; con el perfil sin completar, el '
     'panel carga igual.'),
    ('Defectos', 'DEF-01, DEF-07, DEF-14.'),
    ('Preguntas y riesgos', '¿Qué otras pantallas muestran credenciales en texto plano? ¿El cierre de sesión '
     'por inactividad debería vivir en el servidor y no solo en el navegador? Quedan como riesgos para el '
     'Entregable 3: control de sesión del lado del servidor y revisión de todos los campos de contraseña.'),
    ('Distribución del tiempo', '65 % explorando la misión · 35 % investigando y documentando.'),
])
salto(doc)

# ======================= 6. MÉTRICAS =======================
doc.add_heading('6. Métricas', level=1)
tasa1 = round(M['aprob1'] / M['ejec1'] * 100)
tasa2 = round(M['aprob2'] / M['ejec2'] * 100)
tabla(doc, [
    ['Métrica', 'Cómo se calculó', 'Valor', 'Meta del plan'],
    ['Cobertura de requisitos', '8 requisitos con casos ÷ 8 del alcance', '100 %', '100 %'],
    ['Avance de ejecución · ciclo 1', f'{M["ejec1"]} ejecutados ÷ 32 ejecutables', '100 %', '100 % de prioridad alta'],
    ['Prioridad alta ejecutada', '19 ejecutados ÷ 21 (CP-014/CP-015 bloqueados)', '90 %', '100 % (resto en Railway)'],
    ['Tasa de aprobación · ciclo 1', f'{M["aprob1"]} aprobados ÷ {M["ejec1"]} ejecutados', f'{tasa1} %', 'Se lee con el riesgo'],
    ['Tasa de aprobación · ciclo 2', f'{M["aprob2"]} aprobados ÷ {M["ejec2"]} ejecutados', f'{tasa2} %', 'Se lee con el riesgo'],
    ['Tasa de bloqueo', f'{M["bloq1"]} bloqueados ÷ 34 diseñados', f'{round(M["bloq1"]/34*100)} %', 'Menos de 10 %'],
    ['Defectos reportados', 'Identificadores distintos', str(M['total_def']), '10 o más'],
    ['Defectos por severidad', 'Conteo por nivel', '1 crítica · 2 altas · 9 medias · 2 bajas', 'Sin críticos abiertos'],
    ['Densidad por requisito', '12 defectos de R1 a R8 ÷ 8 requisitos', '1,5', '—'],
    ['Defectos verificados', 'Corregidos y comprobados ÷ reportados', '1 de 14 (7 %)', '—'],
    ['Evidencia registrada', 'Ejecuciones con evidencia ÷ ejecutadas', '100 %', '100 %'],
], anchos=[4.5, 6.5, 3.2, 3.4], fuente=8.6)
doc.add_paragraph()
figura(doc, GRAFICO, 'Defectos por requisito y severidad. Fuente: registro de defectos del equipo.',
       ancho_cm=15.5, comprimir=False)
parrafo(doc, 'La lectura.', bold=True, space=2)
parrafo(doc,
    f'El {tasa1} % de aprobación del ciclo 1 parece aceptable, pero hay que mirar qué falló: de los {M["fall1"]} '
    'casos fallidos, dos fallaron solo porque el sistema no muestra sus mensajes (DEF-13), y de los otros siete, '
    'cuatro tocan reglas que el estudiante y el docente usan a diario o la seguridad de la sesión: CP-025, CP-032 '
    'y CP-033 (R5 y R6) y CP-034 (RNF02). El '
    f'{tasa2} % del ciclo 2 no significa que el sistema empeorara: ese ciclo se armó justamente con lo que había fallado.', size=10.5)
parrafo(doc,
    'El análisis de riesgos del Entregable 1 acertó en el requisito más importante: R5 tenía el riesgo más alto '
    'de la matriz (R-03, nivel 15) y terminó con cuatro defectos, incluido el único crítico. R6 lo habíamos '
    'calificado como riesgo medio (R-11, nivel 9) y aportó un defecto alto, DEF-08; en el Entregable 3 sube a '
    'riesgo alto. Lo que la matriz no vio fue la zona horaria: DEF-08 y DEF-12 tienen la misma causa (el servidor '
    'trabaja en UTC y la aplicación en hora de Colombia) y ningún riesgo la mencionaba. Tampoco estaban en la '
    'matriz RNF02 (DEF-01) ni los mensajes al usuario (DEF-13). La matriz miró los requisitos correctos, pero se '
    'quedó corta en los riesgos transversales.', size=10.5)
salto(doc)

# ======================= 7. EVALUACIÓN Y RECOMENDACIÓN =======================
doc.add_heading('7. Evaluación y recomendación', level=1)
parrafo(doc, 'Revisamos uno por uno los criterios de salida de la sección 4.2 del Entregable 1.')
tabla(doc, [
    ['N.º', 'Criterio de salida definido en el Entregable 1', '¿Se cumple?', 'Evidencia'],
    ['1', 'El 100 % de los casos de prioridad alta se ejecutó.', 'Parcial',
     '19 de 21 casos de prioridad alta ejecutados; CP-014 y CP-015 (Google) quedan bloqueados por el entorno '
     'automatizado y pendientes de ejecución manual en Railway.'],
    ['2', 'No quedan defectos de severidad crítica o alta sin resolver o sin plan de acción.', 'Sí, con plan',
     'El crítico (DEF-05) está corregido y verificado. Los dos altos (DEF-01 y DEF-08) siguen abiertos con '
     'plan: corrección en la sesión 14 y reejecución de CP-034 y CP-025 en la 15.'],
    ['3', 'La matriz de trazabilidad conserva el 100 % de cobertura de requisitos.', 'Sí',
     'Ocho de ocho requisitos con casos después de los cambios de la sección 2; RNF02 suma CP-034.'],
], anchos=[1.0, 6.0, 2.4, 7.2], fuente=8.8)
recuadro(doc,
    'Recomendación del equipo: apto con condiciones. Los criterios se cumplen, salvo el primero, que queda '
    'parcial hasta ejecutar CP-014 y CP-015 en Railway, y el segundo, que se cumple solo porque los defectos '
    'altos tienen un plan, no porque estén cerrados. Por eso no decimos «apto» a secas. ConectaProfe se puede '
    'liberar una vez corregidos DEF-01 y DEF-08, y recomendamos incluir en la misma corrección a DEF-13, DEF-02 '
    'y DEF-07: tienen prioridad alta y se arreglan con muy poco código. Después hay que volver a ejecutar los '
    'nueve casos fallidos.', bold_primero=True)
parrafo(doc, 'Riesgos residuales.', bold=True, space=2)
parrafo(doc,
    'CP-014 y CP-015 dependen de la configuración de Google en el entorno; en la ejecución automatizada no hay '
    'credenciales, así que su resultado solo puede confirmarse a mano en Railway. La corrección de DEF-08 y '
    'DEF-12 debe calcular las horas en la zona de Colombia y no depender de la del servidor, porque si Railway '
    'cambia de región el desfase puede cambiar de tamaño.', size=10.5)
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
    'horas, a 26 horas o vencidas; al automatizarlas pudimos fijar el reloj del navegador y prepararlas sin esperar.',
    'Hacer las sesiones exploratorias antes del ciclo 1 fue de lo mejor que decidimos: aportaron seis de los '
    'catorce defectos y dieron origen a CP-034.',
]:
    numerada(doc, t)
parrafo(doc, 'Candidatos a automatizar en el Entregable 3', bold=True, space=2)
parrafo(doc, 'La automatización de esta misma entrega ya nos deja la base: la suite corre sola con Playwright. '
             'Para el Entregable 3 priorizamos estos casos por riesgo, repetición y estabilidad.', size=10.5)
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

# ======================= ANEXO B =======================
doc.add_heading('Anexo B. Lista de verificación', level=1)
chk = [
    ['N.º', 'Verificación', '✓', 'Dónde se comprueba'],
    ['1', 'Tabla de reparto firmada después de la portada.', 'Sí', 'Página de reparto'],
    ['2', 'El resumen ejecutivo cabe en una página e incluye la recomendación.', 'Sí', 'Sección 1'],
    ['3', 'Los cambios a la suite del Entregable 1 están listados con su razón.', 'Sí', 'Sección 2, ocho filas'],
    ['4', 'El ciclo 1 cubre toda la suite; el ciclo 2, lo fallido y el riesgo alto (ver nota de Firefox).', 'Sí', 'Sección 3 y Anexo F (Firefox)'],
    ['5', 'Cada ejecución tiene estado, entorno, versión, fecha, ejecutor y evidencia.', 'Sí', 'Hoja de registro (xlsx) y Anexo E'],
    ['6', 'Ningún caso bloqueado está registrado como fallido.', 'Sí', 'CP-014 y CP-015 como «Bloqueado»'],
    ['7', 'Cada integrante ejecutó al menos seis casos.', 'Sí', 'Tabla de reparto (17 y 17)'],
    ['8', 'Hay diez defectos o más, con todos los campos.', 'Sí', 'Sección 4 y Anexo C (14 defectos)'],
    ['9', 'Cada integrante reportó al menos dos defectos.', 'Sí', 'Tabla de reparto'],
    ['10', 'Cada defecto enlaza con su caso o sesión y tiene evidencia propia.', 'Sí', 'Columna «Origen»; capturas debajo de cada reporte (Anexo C)'],
    ['11', 'Hay una hoja de sesión exploratoria por integrante.', 'Sí', 'Sección 5: SE-01 y SE-02, completas'],
    ['12', 'Las métricas están bien calculadas, por ciclo, y hay al menos un gráfico.', 'Sí', 'Sección 6, Figura 1'],
    ['13', 'Los criterios de salida se revisan uno por uno.', 'Sí', 'Sección 7, tres criterios'],
    ['14', 'La recomendación es explícita.', 'Sí', 'Sección 7: apto con condiciones'],
    ['15', 'Los archivos tienen los nombres pedidos y los enlaces abren.', 'Sí', 'Portada'],
]
tabla(doc, chk, anchos=[1.0, 9.2, 1.4, 5.2], fuente=8.8)
salto(doc)

# ======================= ANEXO C =======================
doc.add_heading('Anexo C. Reportes completos de defectos', level=1)
parrafo(doc, f'Entorno común salvo que se diga otra cosa: {ENTORNO_DEF}. Las cuentas de semilla usan la '
             'contraseña «123456»; el administrador es la cuenta de pruebas del equipo. Cuando un paso dice '
             '«consola», es la de las herramientas del navegador (F12), donde se pega el fetch con el token de '
             'la sesión. Debajo de cada reporte van sus capturas, numeradas como figuras.',
             size=10, italic=True)

# Reportes completos de los 14 defectos, con los 13 campos.

def texto_evidencia(d):
    """Nombres de las capturas con la figura donde se ven."""
    propias = [e for e in d['evidencias'] if not es_consola(e)]
    partes = []
    if propias:
        n = proxima_figura()
        rango = f'figura {n}' if len(propias) == 1 else f'figuras {n} a {n + len(propias) - 1}'
        partes.append(f"{', '.join(propias)} ({rango}, debajo de este reporte)")
    for e in d['evidencias']:
        if es_consola(e):
            partes.append(f'{e} (figura {FIG_CONSOLA[e]}, consola F12 en el Anexo D)')
    return '; '.join(partes) or '—'


for d in DEFECTOS:
    doc.add_heading(f"{d['id']} · {d['titulo']}", level=3)
    ev = texto_evidencia(d)
    ficha(doc, [
        ('Identificador', d['id']),
        ('Título', d['titulo']),
        ('Entorno y versión', ENTORNO_DEF),
        ('Precondición', PRECOND[d['id']]),
        ('Pasos', PASOS[d['id']]),
        ('Resultado esperado', ESPERADO[d['id']]),
        ('Resultado real', d['resultado_real'] or '—'),
        ('Frecuencia', d['frecuencia']),
        ('Severidad', SEV_JUST[d['id']]),
        ('Prioridad', PRIO_JUST[d['id']]),
        ('Evidencia', ev),
        ('Origen', d['origen']),
        ('Reportado por', f"{d['reporta']} · reproducido por {d['reproduce']}"),
    ])
    if d['notas']:
        parrafo(doc, 'Nota: ' + ' '.join(d['notas']), size=9.5, italic=True, space=4)
    for e in d['evidencias']:
        if es_consola(e):
            continue
        desc = desc_evidencia(e)
        MOSTRADAS[e] = figura(doc, ruta_evidencia(e), f"{d['id']} · {e}" + (f'. {desc}' if desc else ''))
    doc.add_paragraph()

# ======================= ANEXO D: PRUEBAS POR CONSOLA =======================
if consola.get('pruebas'):
    salto(doc)
    doc.add_heading('Anexo D. Pruebas por consola del navegador (F12)', level=1)
    _fetch = sum(1 for pr in consola['pruebas'] if pr.get('httpStatus') is not None)
    _insp = len(consola['pruebas']) - _fetch
    parrafo(doc,
        f'Estas {len(consola["pruebas"])} verificaciones se hicieron desde la consola del navegador. En '
        f'{_fetch} se pega un fetch() con el token de la sesión, porque prueban la capa del servidor '
        'directamente: el control de acceso por rol, el manejo de datos inexistentes y las validaciones que '
        'el formulario no deja disparar.' + (
        f' En {"la otra" if _insp == 1 else f"las otras {_insp}"} se inspecciona un elemento de la página '
        'con document.getElementById(), para ver algo que la pantalla no muestra.' if _insp else '') +
        ' Son las pruebas más cercanas a cómo se tantea una API, así que van con el comando exacto para '
        'copiar y pegar, el resultado esperado, lo que respondió el sistema y la captura de la consola tal '
        'como quedó (carpeta pruebas/e2/resultados/consola/).')
    parrafo(doc, 'Las rutas son relativas (/api/...), así que el mismo comando sirve en localhost y en el '
                 'entorno de Railway sin cambiar nada.', size=10, italic=True)
    for pr in consola['pruebas']:
        doc.add_heading(f"{pr['id']} · {pr['titulo']}", level=3)
        parrafo(doc, pr['descripcion'], size=10.5, space=3)
        parrafo(doc, 'Comando (se pega en la pestaña Consola de F12):', size=9.5, bold=True, space=2)
        codigo(doc, pr['comando'])
        n = FIG_CONSOLA.get(pr['evidencia'])
        ficha(doc, [
            ('Requisito', pr['requisito']),
            ('Resultado esperado', pr['esperado']),
            ('Resultado real', pr['resultadoReal']),
            ('Código HTTP', str(pr['httpStatus']) if pr.get('httpStatus') is not None
             else '— (inspección del elemento, sin petición al servidor)'),
            ('Estado', pr['estado']),
            ('Evidencia', f"{pr['evidencia']} (figura {n}, debajo)" if n else pr['evidencia']),
        ])
        if n:
            assert proxima_figura() == n, 'la numeración de figuras se desfasó'
            MOSTRADAS[pr['evidencia']] = figura(
                doc, ruta_evidencia(pr['evidencia']),
                f"{pr['id']} · {pr['evidencia']}. Consola F12 con el comando ejecutado y la respuesta: {pr['titulo'].lower()}.")
        doc.add_paragraph()

# ======================= ANEXO E: CAPTURAS DE LOS CICLOS =======================
salto(doc)
doc.add_heading('Anexo E. Evidencia de cada ejecución (ciclos 1 y 2)', level=1)
parrafo(doc,
    'Aquí están todas las capturas de los dos ciclos, en el orden de la suite. Cada una lleva estampado en '
    'la esquina el caso, el ciclo, la URL, la hora de Colombia y el navegador, y algunas el recuadro con la '
    'respuesta del servidor. Las de los casos que se probaron desde la consola tienen el aspecto de la '
    'pestaña Consola de F12. Cuando una captura ya está debajo del reporte de su defecto (Anexo C), aquí '
    'solo se indica en qué figura verla, para no repetirla.', size=10.5)


def capturas_ciclo(ciclo_datos, numero):
    doc.add_heading(f'E.{numero} Ciclo {numero} · {ciclo_datos["navegador"]}', level=2)
    for c in ciclo_datos['casos']:
        for e in c['evidencias']:
            desc = desc_evidencia(e)
            pie = (f"{c['id']} · ciclo {numero} · {c['estado']} · {e}. {c['titulo']}"
                   + (f'. {desc}' if desc else ''))
            if e in MOSTRADAS:
                parrafo(doc, f"{e} ({c['id']}, ciclo {numero}, {c['estado']}): se ve en la figura "
                             f"{MOSTRADAS[e]}, en el reporte de {c['defecto'] or 'su defecto'} (Anexo C).",
                        size=9.5, italic=True, space=8)
            else:
                MOSTRADAS[e] = figura(doc, ruta_evidencia(e), pie, ancho_cm=12.5)


capturas_ciclo(ciclo1, 1)
capturas_ciclo(ciclo2, 2)

# ======================= ANEXO F: EJECUCIÓN MANUAL EN RAILWAY =======================
if manual:
    salto(doc)
    doc.add_heading('Anexo F. Ejecución manual en Railway (Google y Firefox)', level=1)
    pendientes = [m for m in manual if not m['hecho']]
    parrafo(doc,
        'Estas ejecuciones se hacen a mano sobre la aplicación desplegada en Railway. CP-014 y CP-015 '
        'necesitan una cuenta real de Google, que el entorno automatizado no tiene, y el contraste del '
        'ciclo 2 en Firefox se hace a mano porque ese entorno solo dispone de Chromium. Cada caso sigue '
        'los mismos pasos del ciclo 1 y lo ejecuta el integrante que no lo corrió antes.', size=10.5)
    if pendientes:
        parrafo(doc,
            f'Nota para el equipo (borrar antes de entregar): faltan {len(pendientes)} capturas. Para cada '
            'una, abrir este archivo en Word, hacer clic dentro del recuadro punteado, borrar el texto gris, '
            'pegar la captura con Ctrl+V y llenar «Estado obtenido», «Resultado real» y «Fecha y navegador». '
            'Que en la captura se vean la barra de direcciones de Railway y la hora del computador.',
            size=9.5, italic=True)

    def separador():
        """Párrafo mínimo para que Word no pegue la ficha y el recuadro en una sola tabla."""
        sep = parrafo(doc, ' ', size=2, space=0)
        sep.paragraph_format.keep_with_next = True

    def ejecucion_manual(m):
        doc.add_heading(f"{m['id']} · {m['titulo']}", level=3)
        n = proxima_figura() if m['hecho'] else None
        ficha(doc, [
            ('Lo ejecuta · entorno', f"{m['ejecuta']} · {m['entorno']}"),
            ('Qué se hace', m['que']),
            ('Resultado esperado', f"{m['esperado']} Estado esperado: {m['estado_esperado']}."),
            ('Estado obtenido', m['estado'] or '☐ Aprobado     ☐ Fallido'),
            ('Resultado real', m.get('real') or ' '),
            ('Fecha y navegador', ' · '.join(x for x in (m.get('fecha'), m.get('navegador')) if x)
             or '____ /10/2026 · navegador y versión: ____________'),
            ('Evidencia', f"{m['archivo']} (figura {n}, debajo)" if n else f"{m['archivo']} (recuadro de abajo)"),
        ])
        separador()
        if m['hecho']:
            figura(doc, m['ruta'], f"{m['id']} · {m['archivo']}. {m['entorno']}: {m['titulo'].lower()}",
                   ancho_cm=15)
        else:
            recuadro_captura(doc, f"Pegue aquí la captura de {m['id']} · {m['archivo']}\n"
                                  'Clic dentro del recuadro, borrar este texto y Ctrl+V', alto_cm=8.6)

    # Un caso por página: su ficha y su captura siempre quedan juntas.
    doc.add_heading('F.1 Inicio de sesión con Google (ciclo 1)', level=2)
    for k, m in enumerate(x for x in manual if x['ciclo'] == 1):
        if k:
            salto(doc)
        ejecucion_manual(m)
    for k, m in enumerate(x for x in manual if x['ciclo'] == 2):
        salto(doc)
        if k == 0:
            doc.add_heading('F.2 Ciclo 2 en Firefox', level=2)
        ejecucion_manual(m)

salida = os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2', 'E2_F_Equipo.docx')
os.makedirs(os.path.dirname(salida), exist_ok=True)
doc.save(salida)
print('Guardado', salida)
