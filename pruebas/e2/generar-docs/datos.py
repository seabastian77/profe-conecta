# -*- coding: utf-8 -*-
"""Datos del Entregable 2 y la Tarea 4.

La fuente es lo que el equipo ejecuta a mano en Railway:
  - docs/entrega-2/E2_Registro_Ejecucion_EquipoF.xlsx (columnas amarillas: fecha, navegador,
    estado, resultado real, intentos, evidencia, reproducción cruzada y sesiones exploratorias);
  - las capturas en pruebas/e2/evidencias-equipo/.

De pruebas/e2/resultados/ (la corrida del script sobre una copia local) solo se toman las
definiciones de los casos (título, requisito, prioridad, resultado esperado); sus capturas y
resultados son referencia y no entran a los documentos.
"""
import datetime
import json
import os

import openpyxl

from textos import DEFECTOS_BASE, EVIDENCIA_SUGERIDA, MISIONES

BUILD = os.path.dirname(os.path.abspath(__file__))
RAIZ_E2 = os.path.normpath(os.path.join(BUILD, '..'))
REGISTRO = os.path.normpath(os.path.join(BUILD, '..', '..', '..', 'docs', 'entrega-2',
                                         'E2_Registro_Ejecucion_EquipoF.xlsx'))
CAPTURAS = os.path.join(RAIZ_E2, 'evidencias-equipo')

EQUIPO = {
    'curso': 'Verificación y Validación de Software',
    'codigos': 'IS019 · IS071 · TDS004',
    'docente': 'Camilo Rendón Vinasco',
    'periodo': '2026-2 · Sede Medellín',
    'equipo': 'F',
    'integrantes': ['Sebastián González González', 'Esteban Palencia'],
    'sistema': 'ConectaProfe · plataforma de gestión de tutorías académicas',
    'url': 'https://profe-conecta-production-e40c.up.railway.app',
    'commit': '693358a (rama main)',
    'entrega': 'Martes 13 de octubre de 2026 · sesión 12',
}
PENDIENTE = '____'

# --- Definición de los casos (del diseño de la suite) --------------------------
with open(os.path.join(RAIZ_E2, 'resultados', 'ciclo-1', 'resultados.json'), encoding='utf-8') as _f:
    CASOS = {c['id']: {k: c[k] for k in ('id', 'titulo', 'requisito', 'riesgo', 'tecnica', 'prioridad',
                                          'responsable', 'esperado')}
             for c in json.load(_f)['casos']}


def _texto(v):
    if v is None:
        return ''
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%d/%m/%Y')
    return str(v).strip()


def _lista(v):
    return [x.strip() for x in _texto(v).replace(';', ',').split(',') if x.strip()]


# --- Capturas del equipo ----------------------------------------------------------
_ARCHIVOS = {}
if os.path.isdir(CAPTURAS):
    for _a in os.listdir(CAPTURAS):
        if _a.lower().endswith(('.png', '.jpg', '.jpeg')):
            _ARCHIVOS[os.path.splitext(_a)[0].lower()] = os.path.join(CAPTURAS, _a)


def ruta_captura(nombre):
    """Ruta de una captura del equipo; acepta .png, .jpg o .jpeg con el mismo nombre."""
    return _ARCHIVOS.get(os.path.splitext(nombre)[0].lower())


# --- Registro del equipo ----------------------------------------------------------
def _hoja(wb, nombre):
    if nombre not in wb.sheetnames:
        return []
    ws = wb[nombre]
    cab = [_texto(c.value) for c in ws[1]]
    filas = []
    for fila in ws.iter_rows(min_row=2, values_only=True):
        if not any(v not in (None, '') for v in fila):
            continue
        filas.append({cab[j]: fila[j] for j in range(min(len(cab), len(fila)))})
    return filas


if not os.path.exists(REGISTRO):
    raise SystemExit(f'Falta el registro {REGISTRO}; créelo con plantilla_registro.py')
_wb = openpyxl.load_workbook(REGISTRO, data_only=True)

EJEC = []
for f in _hoja(_wb, 'Registro de ejecución'):
    caso = _texto(f.get('Caso'))
    if not caso.startswith('CP-'):
        continue
    evid = _lista(f.get('Evidencia'))
    e = dict(
        caso=caso, ciclo=int(f.get('Ciclo') or 1), que=_texto(f.get('Qué prueba')), ejecuta=_texto(f.get('Lo ejecuta')),
        navegador=_texto(f.get('Navegador y versión')), so=_texto(f.get('Sistema operativo')),
        fecha=_texto(f.get('Fecha')), estado=_texto(f.get('Estado')), real=_texto(f.get('Resultado real')),
        evidencias=evid, defecto=_texto(f.get('Defecto')),
        esperado_hoy=_texto(f.get('Estado esperado hoy')), defecto_esperado=_texto(f.get('Defecto esperado')),
    )
    e['rutas'] = [ruta_captura(x) for x in evid]
    e['hecho'] = e['estado'] in ('Aprobado', 'Fallido', 'Bloqueado')
    EJEC.append(e)

_def_eq = {_texto(f.get('ID')): f for f in _hoja(_wb, 'Defectos')}
DEFECTOS = []
for base in DEFECTOS_BASE:
    f = _def_eq.get(base['id'], {})
    d = dict(base)
    d.update(fecha=_texto(f.get('Fecha')), navegador=_texto(f.get('Navegador y versión')),
             so=_texto(f.get('Sistema operativo')), intentos=_texto(f.get('Intentos')),
             resultado_real=_texto(f.get('Resultado real')),
             evidencias=_lista(f.get('Evidencia')) or list(EVIDENCIA_SUGERIDA[base['id']]))
    d['estado'] = _texto(f.get('Estado')) or base['estado']
    d['rutas'] = [ruta_captura(x) for x in d['evidencias']]
    d['hecho'] = bool(d['fecha'] and d['resultado_real'])
    DEFECTOS.append(d)

REPRO = {}
for f in _hoja(_wb, 'Reproducción cruzada'):
    REPRO[_texto(f.get('Defecto'))] = dict(fecha=_texto(f.get('Fecha')), resultado=_texto(f.get('Resultado')),
                                           falto=_texto(f.get('Qué faltó o qué se observó')))

SESIONES = {}
NOTAS = {'SE-01': [], 'SE-02': []}
if 'Sesiones exploratorias' in _wb.sheetnames:
    _ws = _wb['Sesiones exploratorias']
    for r in (2, 3):
        sid = _texto(_ws.cell(r, 1).value)
        if sid:
            SESIONES[sid] = dict(integrante=_texto(_ws.cell(r, 2).value),
                                 mision=_texto(_ws.cell(r, 3).value) or MISIONES.get(sid, ''),
                                 fecha=_texto(_ws.cell(r, 4).value), duracion=_texto(_ws.cell(r, 5).value),
                                 defectos=_texto(_ws.cell(r, 6).value), preguntas=_texto(_ws.cell(r, 7).value),
                                 distribucion=_texto(_ws.cell(r, 8).value))
    for r in range(7, _ws.max_row + 1):
        sid = _texto(_ws.cell(r, 1).value)
        minuto, hice, vi = (_texto(_ws.cell(r, j).value) for j in (2, 3, 4))
        if sid in NOTAS and (minuto or hice or vi):
            NOTAS[sid].append((minuto, hice, vi))


# --- Métricas (solo con lo que el equipo ya ejecutó) -----------------------------
def _contar(ciclo, estado):
    return sum(1 for e in EJEC if e['ciclo'] == ciclo and e['estado'] == estado)


def metricas():
    m = {}
    for c in (1, 2):
        m[f'aprob{c}'] = _contar(c, 'Aprobado')
        m[f'fall{c}'] = _contar(c, 'Fallido')
        m[f'bloq{c}'] = _contar(c, 'Bloqueado')
        m[f'ejec{c}'] = m[f'aprob{c}'] + m[f'fall{c}']
        m[f'dis{c}'] = sum(1 for e in EJEC if e['ciclo'] == c)
        m[f'pend{c}'] = sum(1 for e in EJEC if e['ciclo'] == c and not e['hecho'])
    alta = [e for e in EJEC if e['ciclo'] == 1 and CASOS.get(e['caso'], {}).get('prioridad') == 'Alta']
    m['alta'] = len(alta)
    m['alta_ejec'] = sum(1 for e in alta if e['estado'] in ('Aprobado', 'Fallido'))
    m['total_def'] = len(DEFECTOS)
    m['def_hechos'] = sum(1 for d in DEFECTOS if d['hecho'])
    m['repro_hechas'] = sum(1 for d in DEFECTOS if REPRO.get(d['id'], {}).get('resultado'))
    m['capturas'] = sum(1 for e in EJEC for r in e['rutas'] if r)
    m['capturas_esperadas'] = sum(len(e['evidencias']) for e in EJEC)
    return m


M = metricas()
COMPLETO = (M['pend1'] == 0 and M['pend2'] == 0 and M['def_hechos'] == len(DEFECTOS)
            and M['repro_hechas'] == len(DEFECTOS) and M['capturas'] == M['capturas_esperadas'])


def v(x, raya=PENDIENTE):
    """El dato del equipo o una raya para llenar."""
    return x if x not in (None, '') else raya


def entorno(navegador, so):
    """Entorno de una ejecución manual en Railway."""
    partes = [p for p in (navegador, so) if p]
    return 'Railway (commit 693358a) · ' + (' · '.join(partes) if partes else
                                            'navegador y versión: ____ · sistema operativo: ____')


if __name__ == '__main__':
    print('Ejecuciones:', len(EJEC), '· pendientes', M['pend1'] + M['pend2'])
    print('Defectos con datos del equipo:', M['def_hechos'], 'de', len(DEFECTOS))
    print('Reproducciones cruzadas:', M['repro_hechas'], '· capturas', M['capturas'], 'de', M['capturas_esperadas'])
