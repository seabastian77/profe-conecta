# -*- coding: utf-8 -*-
"""Crea E2_Registro_Ejecucion_EquipoF.xlsx para que el equipo lo llene al ejecutar en Railway.

Las columnas amarillas son las que llena quien ejecuta: navegador, sistema operativo, fecha, estado,
resultado real, evidencia, defecto, intentos, la reproducción cruzada y las sesiones exploratorias.
Lo demás (casos, resultado esperado, quién ejecuta, nombres de captura sugeridos) ya viene escrito.
No trae ningún resultado del script.

No sobrescribe un registro que ya tenga algo escrito por el equipo, salvo con --forzar; en ese caso
guarda antes una copia de respaldo con la fecha.
"""
import datetime
import json
import os
import shutil
import sys

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from textos import DEFECTOS_BASE, EVIDENCIA_SUGERIDA, MISIONES

BUILD = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(BUILD, '..', 'resultados')
SALIDA = os.path.normpath(os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2',
                                       'E2_Registro_Ejecucion_EquipoF.xlsx'))

SEB, EST = 'Sebastián González González', 'Esteban Palencia'
# Ciclo 2 en Firefox, planeado: los que se espera que fallen en el ciclo 1 y los de riesgo alto que
# pasan. Cada caso lo hace quien no lo tuvo en el ciclo 1 (guía de ejecución del equipo).
CICLO2 = [('CP-007', SEB), ('CP-008', SEB), ('CP-013', SEB), ('CP-016', EST), ('CP-017', EST),
          ('CP-018', EST), ('CP-019', EST), ('CP-020', EST), ('CP-021', EST), ('CP-022', EST),
          ('CP-024', EST), ('CP-025', EST), ('CP-031', EST), ('CP-032', SEB), ('CP-033', SEB),
          ('CP-034', EST)]
CONSOLA = {'CP-008', 'CP-018', 'CP-021'}

TEAL = '0F766E'; AMARILLO = 'FFF59D'; AMARILLO_CL = 'FFFDE7'
borde = Border(*[Side(style='thin', color='D1D5DB')] * 4)
wrap = Alignment(wrap_text=True, vertical='top')

# Columnas amarillas de cada hoja (para no pisar lo que el equipo ya escribió).
AMARILLAS = {
    'Registro de ejecución': (6, 7, 8, 9, 10, 11, 12),
    'Defectos': (9, 10, 11, 12, 13, 14, 15),
    'Reproducción cruzada': (4, 5, 6),
    'Sesiones exploratorias': (4, 5, 6, 7, 8),
    'Notas de sesión': (2, 3, 4),
}


def encabezar(ws, titulos, anchos, amarillas=(), congelar='C2'):
    for j, (t, a) in enumerate(zip(titulos, anchos), 1):
        c = ws.cell(1, j, t)
        c.font = Font(bold=True, color='111827' if j in amarillas else 'FFFFFF')
        c.fill = PatternFill('solid', fgColor=AMARILLO if j in amarillas else TEAL)
        c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
        c.border = borde
        ws.column_dimensions[get_column_letter(j)].width = a
    ws.row_dimensions[1].height = 32
    if congelar:
        ws.freeze_panes = congelar


def fila(ws, r, valores, amarillas=()):
    for j, v in enumerate(valores, 1):
        c = ws.cell(r, j, v)
        c.border = borde
        c.alignment = wrap
        if j in amarillas:
            c.fill = PatternFill('solid', fgColor=AMARILLO_CL)
        if j == 1:
            c.font = Font(bold=True)


def lista(ws, opciones, rango, titulo):
    dv = DataValidation(type='list', formula1='"' + ','.join(opciones) + '"', allow_blank=True,
                        showErrorMessage=True, errorStyle='stop', errorTitle=titulo,
                        error='Escoja una opción de la lista: ' + ', '.join(opciones) + '.')
    ws.add_data_validation(dv)
    dv.add(rango)


def tiene_datos(ruta):
    """True si alguna columna amarilla de cualquier hoja ya tiene algo escrito."""
    if not os.path.exists(ruta):
        return False
    wb = openpyxl.load_workbook(ruta, data_only=True)
    for hoja, cols in AMARILLAS.items():
        if hoja not in wb.sheetnames:
            continue
        ws = wb[hoja]
        for r in range(2, ws.max_row + 1):
            if any(ws.cell(r, j).value not in (None, '') for j in cols):
                # Evidencia viene sugerida desde la plantilla: solo cuenta si no es la sugerida.
                if hoja in ('Registro de ejecución', 'Defectos') and \
                        [j for j in cols if ws.cell(r, j).value not in (None, '')] == [11 if hoja == 'Registro de ejecución' else 14]:
                    continue
                if hoja in ('Notas de sesión',) and all(ws.cell(r, j).value in (None, '') for j in cols):
                    continue
                return True
    return False


def main():
    if os.path.exists(SALIDA) and tiene_datos(SALIDA):
        if '--forzar' not in sys.argv:
            print('El registro ya tiene datos del equipo; no se sobrescribe (use --forzar, que guarda un respaldo).')
            return
        respaldo = SALIDA.replace('.xlsx', f"_respaldo_{datetime.datetime.now():%Y%m%d_%H%M}.xlsx")
        shutil.copy2(SALIDA, respaldo)
        print('Respaldo en', respaldo)

    with open(os.path.join(REF, 'ciclo-1', 'resultados.json'), encoding='utf-8') as f:
        casos = {c['id']: c for c in json.load(f)['casos']}

    wb = openpyxl.Workbook()

    # ---- Cómo llenarlo ---------------------------------------------------------
    wi = wb.active
    wi.title = 'Cómo llenarlo'
    wi.column_dimensions['A'].width = 120
    lineas = [
        ('Registro de ejecución · Entregable 2 · Equipo F', 'titulo'),
        ('Sistema: ConectaProfe en https://profe-conecta-production-e40c.up.railway.app (commit 693358a).', ''),
        ('', ''),
        ('En general', 'sub'),
        ('Las columnas amarillas las llena quien ejecuta, en Railway, con lo que vio. Lo demás ya viene escrito.', ''),
        ('Ciclo 1 en Chrome y ciclo 2 en Firefox, los dos en Windows. La versión del navegador: Chrome ⋮ → Ayuda → '
         'Información de Google Chrome; Firefox ☰ → Ayuda → Acerca de Firefox. Se escribe, por ejemplo, «Chrome 141.0».', ''),
        ('Capturas: con Windows + Shift + S, mostrando la barra de direcciones (la dirección de Railway) y la hora de '
         'Windows. Se guardan con el nombre exacto de la columna «Evidencia», en la carpeta compartida y en '
         'pruebas/e2/evidencias-equipo/ del repositorio. Si un caso necesita dos capturas, se escriben las dos '
         'separadas por coma (EV-CP013-C1-01.png, EV-CP013-C1-02.png).', ''),
        ('Pruebas de consola (CP-008, CP-018 y CP-021, y DEF-06, DEF-10 y DEF-13): la captura tiene que mostrar la '
         'consola abierta (F12) con el comando y la respuesta. Los comandos están en pruebas-consola.md.', ''),
        ('', ''),
        ('Hoja «Registro de ejecución»', 'sub'),
        ('Estado: «Aprobado» si vieron lo esperado; «Fallido» si el sistema hace otra cosa; «Bloqueado» si no se pudo '
         'ejecutar por el entorno (por ejemplo, Google no configurado). Un bloqueado nunca se marca como fallido.', ''),
        ('Defecto: si el caso falló, el identificador del defecto (DEF-01 a DEF-14). Si es un fallo nuevo, escriban '
         '«NUEVO» y cuéntenlo para reportarlo.', ''),
        ('La lista del ciclo 2 es la planeada. Si en el ciclo 1 falla o se bloquea un caso que no está en ella, '
         'agreguen su fila al final con ciclo 2.', ''),
        ('', ''),
        ('Hoja «Defectos»', 'sub'),
        ('Cada fila la llena quien aparece en «Reportado por», con su propia prueba en Railway: fecha, navegador, '
         'sistema operativo, intentos (cuántas veces le salió de cuántas lo intentó, por ejemplo «3 de 3»), resultado '
         'real con sus palabras y el nombre de la captura.', ''),
        ('DEF-05 ya está corregido en el código que corre Railway: lo que se hace es verificarlo. Si las observaciones '
         'se ven como texto, en «Estado» se escribe «Verificado».', ''),
        ('', ''),
        ('Hoja «Reproducción cruzada»', 'sub'),
        ('La llena quien aparece en «Reproducido por», siguiendo solo el reporte del otro, sin preguntarle nada. '
         'Resultado: «Reproducido» (salió solo con el reporte), «Con ayuda» (hubo que preguntar) o «No reproducido». '
         'En los dos últimos se escribe qué le faltaba al reporte. Para DEF-05 lo esperado es «No reproducido», '
         'porque ya está corregido.', ''),
        ('', ''),
        ('Hojas «Sesiones exploratorias» y «Notas de sesión»', 'sub'),
        ('Una sesión de 45 a 60 minutos por integrante, con cronómetro. En «Notas de sesión» va una fila por cada cosa '
         'que hicieron o vieron, con el minuto.', ''),
        ('', ''),
        ('La hoja «Métricas» se calcula sola con lo que se llene.', ''),
    ]
    for i, (t, tipo) in enumerate(lineas, 1):
        c = wi.cell(i, 1, t)
        c.font = Font(bold=tipo != '', size=14 if tipo == 'titulo' else 11, color=TEAL if tipo == 'sub' else '111827')
        c.alignment = Alignment(wrap_text=True)

    # ---- Registro de ejecución -------------------------------------------------
    ws = wb.create_sheet('Registro de ejecución')
    titulos = ['Caso', 'Ciclo', 'Qué prueba', 'Resultado esperado', 'Lo ejecuta', 'Navegador y versión',
               'Sistema operativo', 'Fecha', 'Estado', 'Resultado real', 'Evidencia', 'Defecto']
    am = AMARILLAS['Registro de ejecución']
    encabezar(ws, titulos, [9, 6, 30, 40, 24, 18, 14, 12, 12, 60, 26, 10], amarillas=am)
    r = 2
    filas = [(cid, 1, casos[cid]['responsable']) for cid in sorted(casos)] + [(cid, 2, q) for cid, q in CICLO2]
    for cid, ciclo, quien in filas:
        c = casos[cid]
        que = c['titulo'] + (' (consola F12)' if cid in CONSOLA else '')
        fila(ws, r, [cid, ciclo, que, c['esperado'], quien, '', '', '', '', '',
                     f"EV-{cid.replace('-', '')}-C{ciclo}-01.png", ''], amarillas=am)
        r += 1
    lista(ws, ['Aprobado', 'Fallido', 'Bloqueado'], f'I2:I{r + 20}', 'Estado')
    lista(ws, [d['id'] for d in DEFECTOS_BASE] + ['NUEVO'], f'L2:L{r + 20}', 'Defecto')
    ws.auto_filter.ref = f'A1:L{r - 1}'

    # ---- Defectos ---------------------------------------------------------------
    wd = wb.create_sheet('Defectos')
    titulos = ['ID', 'Título', 'Requisito', 'Severidad', 'Prioridad', 'Origen', 'Reportado por (llena esta fila)',
               'Reproducido por', 'Fecha', 'Navegador y versión', 'Sistema operativo', 'Intentos',
               'Resultado real', 'Evidencia', 'Estado']
    am = AMARILLAS['Defectos']
    encabezar(wd, titulos, [8, 50, 12, 10, 10, 10, 24, 24, 12, 18, 14, 10, 60, 30, 14], amarillas=am)
    for i, d in enumerate(DEFECTOS_BASE, 2):
        fila(wd, i, [d['id'], d['titulo'], d['requisito'], d['severidad'], d['prioridad'], d['origen'],
                     d['reporta'], d['reproduce'], '', '', '', '', '', ', '.join(EVIDENCIA_SUGERIDA[d['id']]), ''],
             amarillas=am)
    lista(wd, ['Abierto', 'Verificado', 'No reproducido'], f'O2:O{len(DEFECTOS_BASE) + 1}', 'Estado')

    # ---- Reproducción cruzada --------------------------------------------------
    wx = wb.create_sheet('Reproducción cruzada')
    titulos = ['Defecto', 'Reportado por', 'Reproducido por (llena esta fila)', 'Fecha', 'Resultado',
               'Qué faltó o qué se observó']
    am = AMARILLAS['Reproducción cruzada']
    encabezar(wx, titulos, [9, 24, 26, 12, 18, 70], amarillas=am)
    for i, d in enumerate(DEFECTOS_BASE, 2):
        fila(wx, i, [d['id'], d['reporta'], d['reproduce'], '', '', ''], amarillas=am)
    lista(wx, ['Reproducido', 'Con ayuda', 'No reproducido'], f'E2:E{len(DEFECTOS_BASE) + 1}', 'Resultado')

    # ---- Sesiones exploratorias y sus notas -------------------------------------
    we = wb.create_sheet('Sesiones exploratorias')
    titulos = ['Sesión', 'Integrante', 'Misión', 'Fecha', 'Duración (min)', 'Defectos encontrados',
               'Preguntas y riesgos', 'Distribución del tiempo']
    am = AMARILLAS['Sesiones exploratorias']
    encabezar(we, titulos, [8, 24, 50, 12, 10, 22, 40, 26], amarillas=am, congelar=None)
    for i, (sid, quien) in enumerate((('SE-01', EST), ('SE-02', SEB)), 2):
        fila(we, i, [sid, quien, MISIONES[sid], '', '', '', '', ''], amarillas=am)

    wn = wb.create_sheet('Notas de sesión')
    am = AMARILLAS['Notas de sesión']
    encabezar(wn, ['Sesión', 'Minuto', 'Qué hice', 'Qué vi'], [8, 8, 55, 55], amarillas=am, congelar='A2')
    rr = 2
    for sid in ('SE-01', 'SE-02'):
        for _ in range(20):
            fila(wn, rr, [sid, '', '', ''], amarillas=am)
            rr += 1

    # ---- Métricas (se calculan solas con lo que se llene) ------------------------
    wm = wb.create_sheet('Métricas')
    encabezar(wm, ['Métrica', 'Valor'], [52, 14], congelar=None)
    reg = "'Registro de ejecución'"
    n = len(DEFECTOS_BASE) + 1
    metricas = [('Ciclo 1 · aprobados', f'=COUNTIFS({reg}!B:B,1,{reg}!I:I,"Aprobado")'),
                ('Ciclo 1 · fallidos', f'=COUNTIFS({reg}!B:B,1,{reg}!I:I,"Fallido")'),
                ('Ciclo 1 · bloqueados', f'=COUNTIFS({reg}!B:B,1,{reg}!I:I,"Bloqueado")'),
                ('Ciclo 1 · sin registrar', f'=COUNTIFS({reg}!B:B,1,{reg}!I:I,"")'),
                ('Ciclo 2 (Firefox) · aprobados', f'=COUNTIFS({reg}!B:B,2,{reg}!I:I,"Aprobado")'),
                ('Ciclo 2 (Firefox) · fallidos', f'=COUNTIFS({reg}!B:B,2,{reg}!I:I,"Fallido")'),
                ('Ciclo 2 (Firefox) · bloqueados', f'=COUNTIFS({reg}!B:B,2,{reg}!I:I,"Bloqueado")'),
                ('Ciclo 2 (Firefox) · sin registrar', f'=COUNTIFS({reg}!B:B,2,{reg}!I:I,"")'),
                ('Defectos con datos de Railway (fecha y resultado real)',
                 f'=COUNTIFS(Defectos!I2:I{n},"<>",Defectos!M2:M{n},"<>")'),
                ('Reproducciones cruzadas registradas', f"=COUNTA('Reproducción cruzada'!E2:E{n})")]
    for i, (k, v) in enumerate(metricas, 2):
        fila(wm, i, [k, v])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    wb.save(SALIDA)
    print('Guardado', SALIDA)


if __name__ == '__main__':
    main()
