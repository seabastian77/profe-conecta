# -*- coding: utf-8 -*-
"""Crea E2_Registro_Ejecucion_EquipoF.xlsx para que el equipo lo llene a mano.

Las columnas amarillas son las que llena quien ejecuta en Railway: navegador, sistema
operativo, fecha, estado, resultado real, intentos, evidencia y la reproducción cruzada.
Lo demás (casos, quién ejecuta, nombres de captura sugeridos) ya viene escrito.

No sobrescribe un registro que ya tenga datos del equipo, salvo con --forzar.
"""
import json
import os
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
# Ciclo 2 en Firefox: cada caso lo hace quien no lo tuvo en el ciclo 1 (guía de ejecución).
CICLO2 = [('CP-007', SEB), ('CP-008', SEB), ('CP-013', SEB), ('CP-016', EST), ('CP-017', EST),
          ('CP-018', EST), ('CP-019', EST), ('CP-020', EST), ('CP-021', EST), ('CP-022', EST),
          ('CP-024', EST), ('CP-025', EST), ('CP-031', EST), ('CP-032', SEB), ('CP-033', SEB),
          ('CP-034', EST)]

TEAL = '0F766E'; AMARILLO = 'FFF59D'; GRIS = 'F3F4F6'
borde = Border(*[Side(style='thin', color='D1D5DB')] * 4)
wrap = Alignment(wrap_text=True, vertical='top')


def encabezar(ws, titulos, anchos, amarillas=()):
    for j, (t, a) in enumerate(zip(titulos, anchos), 1):
        c = ws.cell(1, j, t)
        c.font = Font(bold=True, color='111827' if j in amarillas else 'FFFFFF')
        c.fill = PatternFill('solid', fgColor=AMARILLO if j in amarillas else TEAL)
        c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center')
        c.border = borde
        ws.column_dimensions[get_column_letter(j)].width = a
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = 'C2'


def fila(ws, r, valores, amarillas=(), gris=()):
    for j, v in enumerate(valores, 1):
        c = ws.cell(r, j, v)
        c.border = borde
        c.alignment = wrap
        if j in amarillas:
            c.fill = PatternFill('solid', fgColor='FFFDE7')
        elif j in gris:
            c.fill = PatternFill('solid', fgColor=GRIS)
            c.font = Font(color='6B7280', italic=True)
        if j == 1:
            c.font = Font(bold=True)


def lista(ws, opciones, rango):
    dv = DataValidation(type='list', formula1='"' + ','.join(opciones) + '"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(rango)


def tiene_datos(ruta):
    """True si el registro ya tiene algo escrito por el equipo en sus columnas amarillas."""
    if not os.path.exists(ruta):
        return False
    wb = openpyxl.load_workbook(ruta, data_only=True)
    if 'Registro de ejecución' not in wb.sheetnames:
        return False
    ws = wb['Registro de ejecución']
    for r in range(2, ws.max_row + 1):
        if any(ws.cell(r, j).value not in (None, '') for j in (5, 6, 7, 8, 9)):
            return True
    return False


def main():
    if tiene_datos(SALIDA) and '--forzar' not in sys.argv:
        print('El registro ya tiene datos del equipo; no se sobrescribe (use --forzar).')
        return
    with open(os.path.join(REF, 'ciclo-1', 'resultados.json'), encoding='utf-8') as f:
        ref1 = {c['id']: c for c in json.load(f)['casos']}
    with open(os.path.join(REF, 'ciclo-2', 'resultados.json'), encoding='utf-8') as f:
        ref2 = {c['id']: c for c in json.load(f)['casos']}

    wb = openpyxl.Workbook()

    # ---- Cómo llenarlo ---------------------------------------------------------
    wi = wb.active
    wi.title = 'Cómo llenarlo'
    wi.column_dimensions['A'].width = 110
    lineas = [
        ('Registro de ejecución · Entregable 2 · Equipo F', True),
        ('Sistema: ConectaProfe en https://profe-conecta-production-e40c.up.railway.app (commit 693358a).', False),
        ('', False),
        ('Las columnas amarillas las llena quien ejecuta, en Railway, con lo que vio. Lo demás ya viene escrito.', False),
        ('Estado: «Aprobado» si vieron lo esperado; «Fallido» si el sistema hace otra cosa; «Bloqueado» si no se '
         'pudo ejecutar por el entorno. Un bloqueado nunca se marca como fallido.', False),
        ('Evidencia: el nombre del archivo de la captura (ya viene sugerido). La captura se toma con Windows + Shift + S '
         'y debe mostrar la barra de direcciones y la hora de Windows.', False),
        ('Navegador y versión: por ejemplo «Chrome 141.0» (Chrome: ⋮ → Ayuda → Información de Google Chrome; '
         'Firefox: ☰ → Ayuda → Acerca de Firefox).', False),
        ('Intentos (hoja Defectos): cuántas veces les salió de cuántas lo intentaron, por ejemplo «3 de 3».', False),
        ('Las columnas grises son de referencia (lo que se espera hoy); no se entregan como resultado.', False),
    ]
    for i, (t, negrita) in enumerate(lineas, 1):
        c = wi.cell(i, 1, t)
        c.font = Font(bold=negrita, size=13 if negrita else 11)
        c.alignment = Alignment(wrap_text=True)

    # ---- Registro de ejecución -------------------------------------------------
    ws = wb.create_sheet('Registro de ejecución')
    titulos = ['Caso', 'Ciclo', 'Qué prueba', 'Lo ejecuta', 'Navegador y versión', 'Sistema operativo',
               'Fecha', 'Estado', 'Resultado real', 'Evidencia', 'Defecto', 'Estado esperado hoy',
               'Defecto esperado']
    am = (5, 6, 7, 8, 9, 10, 11)
    encabezar(ws, titulos, [9, 6, 34, 24, 18, 14, 12, 12, 60, 24, 10, 12, 10], amarillas=am)
    r = 2
    for cid in sorted(ref1):
        c = ref1[cid]
        fila(ws, r, [cid, 1, c['titulo'], c['responsable'], '', '', '', '', '',
                     f"EV-{cid.replace('-', '')}-C1-01.png", '', c['estado'], c['defecto'] or '—'],
             amarillas=am, gris=(12, 13))
        r += 1
    for cid, quien in CICLO2:
        c = ref2[cid]
        fila(ws, r, [cid, 2, c['titulo'], quien, '', '', '', '', '',
                     f"EV-{cid.replace('-', '')}-C2-01.png", '', c['estado'], c['defecto'] or '—'],
             amarillas=am, gris=(12, 13))
        r += 1
    lista(ws, ['Aprobado', 'Fallido', 'Bloqueado'], f'H2:H{r - 1}')
    ws.auto_filter.ref = f'A1:M{r - 1}'

    # ---- Defectos ---------------------------------------------------------------
    wd = wb.create_sheet('Defectos')
    titulos = ['ID', 'Título', 'Requisito', 'Severidad', 'Prioridad', 'Origen', 'Reportado por',
               'Reproducido por', 'Fecha', 'Navegador y versión', 'Sistema operativo', 'Intentos',
               'Resultado real', 'Evidencia', 'Estado']
    am = (9, 10, 11, 12, 13, 14, 15)
    encabezar(wd, titulos, [8, 50, 12, 10, 10, 14, 24, 24, 12, 18, 14, 10, 60, 30, 12], amarillas=am)
    for i, d in enumerate(DEFECTOS_BASE, 2):
        fila(wd, i, [d['id'], d['titulo'], d['requisito'], d['severidad'], d['prioridad'], d['origen'],
                     d['reporta'], d['reproduce'], '', '', '', '', '', ', '.join(EVIDENCIA_SUGERIDA[d['id']]),
                     d['estado']], amarillas=am)
    lista(wd, ['Abierto', 'Verificado', 'No reproducido'], f'O2:O{len(DEFECTOS_BASE) + 1}')

    # ---- Reproducción cruzada --------------------------------------------------
    wx = wb.create_sheet('Reproducción cruzada')
    titulos = ['Defecto', 'Reportado por', 'Reproducido por', 'Fecha', 'Resultado', 'Qué faltó o qué se observó']
    am = (4, 5, 6)
    encabezar(wx, titulos, [9, 24, 24, 12, 26, 70], amarillas=am)
    for i, d in enumerate(DEFECTOS_BASE, 2):
        fila(wx, i, [d['id'], d['reporta'], d['reproduce'], '', '', ''], amarillas=am)
    lista(wx, ['Reproducido', 'Con ayuda', 'No reproducido'], f'E2:E{len(DEFECTOS_BASE) + 1}')

    # ---- Sesiones exploratorias ------------------------------------------------
    we = wb.create_sheet('Sesiones exploratorias')
    titulos = ['Sesión', 'Integrante', 'Misión', 'Fecha', 'Duración (min)', 'Defectos encontrados',
               'Preguntas y riesgos', 'Distribución del tiempo']
    am = (4, 5, 6, 7, 8)
    encabezar(we, titulos, [8, 24, 50, 12, 10, 22, 40, 26], amarillas=am)
    for i, (sid, quien) in enumerate((('SE-01', EST), ('SE-02', SEB)), 2):
        fila(we, i, [sid, quien, MISIONES[sid], '', '', '', '', ''], amarillas=am)
    we.cell(5, 1, 'Notas de la sesión (una fila por cosa que hicieron o vieron, con el minuto)').font = Font(bold=True)
    for j, t in enumerate(['Sesión', 'Minuto', 'Qué hice', 'Qué vi'], 1):
        c = we.cell(6, j, t)
        c.font = Font(bold=True, color='111827')
        c.fill = PatternFill('solid', fgColor=AMARILLO)
        c.border = borde
    rr = 7
    for sid in ('SE-01', 'SE-02'):
        for _ in range(15):
            fila(we, rr, [sid, '', '', ''], amarillas=(2, 3, 4))
            rr += 1

    # ---- Métricas (se calculan solas con lo que se llene) ------------------------
    wm = wb.create_sheet('Métricas')
    encabezar(wm, ['Métrica', 'Valor'], [52, 14])
    reg = "'Registro de ejecución'"
    metricas = [
        ('Ciclo 1 · aprobados', f'=COUNTIFS({reg}!B:B,1,{reg}!H:H,"Aprobado")'),
        ('Ciclo 1 · fallidos', f'=COUNTIFS({reg}!B:B,1,{reg}!H:H,"Fallido")'),
        ('Ciclo 1 · bloqueados', f'=COUNTIFS({reg}!B:B,1,{reg}!H:H,"Bloqueado")'),
        ('Ciclo 1 · sin ejecutar todavía', f'=COUNTIFS({reg}!B:B,1,{reg}!H:H,"")'),
        ('Ciclo 2 (Firefox) · aprobados', f'=COUNTIFS({reg}!B:B,2,{reg}!H:H,"Aprobado")'),
        ('Ciclo 2 (Firefox) · fallidos', f'=COUNTIFS({reg}!B:B,2,{reg}!H:H,"Fallido")'),
        ('Ciclo 2 (Firefox) · sin ejecutar todavía', f'=COUNTIFS({reg}!B:B,2,{reg}!H:H,"")'),
        ('Defectos reportados', f'=COUNTA(Defectos!A2:A{len(DEFECTOS_BASE) + 1})'),
        ('Reproducciones cruzadas hechas', f"=COUNTA('Reproducción cruzada'!E2:E{len(DEFECTOS_BASE) + 1})"),
    ]
    for i, (k, v) in enumerate(metricas, 2):
        fila(wm, i, [k, v])

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    wb.save(SALIDA)
    print('Guardado', SALIDA)


if __name__ == '__main__':
    main()
