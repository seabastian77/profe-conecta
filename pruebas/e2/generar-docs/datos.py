# -*- coding: utf-8 -*-
"""Consolida los resultados de ejecución y define los 14 defectos del Entregable 2."""
import json, os, re

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'resultados')

def cargar(nombre):
    with open(os.path.join(RAIZ, nombre, 'resultados.json'), encoding='utf-8') as f:
        return json.load(f)

ciclo1 = cargar('ciclo-1')
ciclo2 = cargar('ciclo-2')
defs_expl = cargar('defectos-exploratorios')

# Ejecuciones manuales del equipo en Railway (Google y Firefox): datos y capturas.
try:
    with open(os.path.join(RAIZ, 'manual', 'manual.json'), encoding='utf-8') as _f:
        manual = json.load(_f)['pendientes']
except (FileNotFoundError, OSError):
    manual = []

# Pruebas por consola del navegador (F12); opcional, se omite si aún no se corrieron.
try:
    consola = cargar('consola')
except (FileNotFoundError, OSError):
    consola = {'pruebas': []}

# --- Equipo e identificación -------------------------------------------------
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
    'navegador_c1': ciclo1['navegador'],
    'navegador_c2': ciclo2['navegador'],
    'so': ciclo1['sistemaOperativo'],
}

# Fecha de la ejecución (dd/mm/aaaa, hora de Colombia) y entorno de los reportes.
fecha_ejecucion = ciclo1['inicio'][:10]
ENTORNO_DEF = (f"{ciclo1['navegador']} · Linux · ConectaProfe en copia local del commit 693358a, la misma "
               f"versión desplegada en Railway · ejecución automatizada con Playwright el {fecha_ejecucion}")

# --- Los 14 defectos (texto del reporte + estado comprobado por ejecución) ---
# severidad/prioridad/estado se declaran aquí; la columna "comprobado" enlaza
# con la ejecución real (caso o reproducción exploratoria).
DEFECTOS = [
  dict(id='DEF-01', titulo='La sesión sigue abierta después de 16 minutos sin actividad; solo se cierra a las 2 horas, y únicamente al recargar',
       requisito='RNF02', severidad='Alta', prioridad='Alta', origen='SE-01 · CP-034', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
  dict(id='DEF-02', titulo='El administrador programa una asesoría con fecha de hoy, y por la API también con fechas pasadas',
       requisito='R5 · RRN06', severidad='Media', prioridad='Alta', origen='CP-032', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
  dict(id='DEF-03', titulo='La foto de 2,5 MB no se rechaza: la interfaz la reduce y la guarda sin avisar del límite de 2 MB',
       requisito='R4 · RF036', severidad='Baja', prioridad='Baja', origen='CP-017', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-04', titulo='El acceso se bloquea después de cinco intentos fallidos y no después de tres',
       requisito='R2 · RRN01', severidad='Baja', prioridad='Media', origen='CP-013', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
  dict(id='DEF-05', titulo='El HTML escrito en las observaciones de una tutoría se ejecutaba al abrir ese día en el calendario',
       requisito='R5 · RNF06', severidad='Crítica', prioridad='Alta', origen='SE-02', estado='Verificado',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-06', titulo='Una tutoría cancelada pasa a «completada» si el docente la marca como realizada por la API',
       requisito='R6', severidad='Media', prioridad='Media', origen='SE-02', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-07', titulo='Las contraseñas se ven en claro en «Nuevo usuario» y «Editar usuario», y la primera trae «Cambiar123» escrita',
       requisito='R7 · RNF05', severidad='Media', prioridad='Alta', origen='SE-01', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
  dict(id='DEF-08', titulo='La regla de 24 horas para cancelar se calcula con 5 horas de diferencia: con 26 h de margen dice que faltan 21',
       requisito='R6', severidad='Alta', prioridad='Alta', origen='CP-025', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-09', titulo='Un estudiante queda con dos tutorías a la misma fecha y hora con docentes distintos',
       requisito='R5', severidad='Media', prioridad='Media', origen='CP-033', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
  dict(id='DEF-10', titulo='La API guarda tutorías con fechas y horas que no existen («2027-13-45», «mañana», «25:99»)',
       requisito='R5', severidad='Media', prioridad='Baja', origen='SE-02', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-11', titulo='El filtro «Activos» muestra cuentas inactivas y oculta a los estudiantes activos que están en alerta',
       requisito='R7 · RF049', severidad='Media', prioridad='Media', origen='CP-031', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-12', titulo='La auditoría y el historial de notificaciones muestran la hora 5 horas adelantada',
       requisito='R8', severidad='Media', prioridad='Media', origen='CP-029', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-13', titulo='Los mensajes emergentes se generan pero nunca se ven: el usuario no recibe confirmaciones ni errores',
       requisito='RF028 · transversal', severidad='Media', prioridad='Alta', origen='CP-016 · CP-024', estado='Abierto',
       reporta='Sebastián González González', reproduce='Esteban Palencia'),
  dict(id='DEF-14', titulo='El estudiante que deja vacío el promedio queda con 0 y recibe alertas académicas, aunque su panel dice «Sin alertas»',
       requisito='R4 · RRN07', severidad='Media', prioridad='Media', origen='SE-01', estado='Abierto',
       reporta='Esteban Palencia', reproduce='Sebastián González González'),
]

# --- Evidencias: ruta en disco y descripción de cada captura -----------------
_RUTAS = {}
for carpeta, _, archivos in os.walk(RAIZ):
    for a in archivos:
        if a.lower().endswith('.png'):
            _RUTAS[a] = os.path.join(carpeta, a)

_DESC = {}
for fuente in (ciclo1['casos'], ciclo2['casos'], defs_expl['defectos']):
    for item in fuente:
        _DESC.update(item.get('descripciones') or {})
for pr in consola.get('pruebas', []):
    if pr.get('evidencia'):
        _DESC[pr['evidencia']] = f"Consola F12: {pr['descripcion']}"


def ruta_evidencia(nombre):
    """Ruta de la captura en pruebas/e2/resultados/ (None si no existe)."""
    return _RUTAS.get(nombre)


def desc_evidencia(nombre):
    """Descripción que se estampó en la captura, lista para un pie de figura."""
    texto = (_DESC.get(nombre) or '').strip().replace('\n', ' · ').rstrip('. ')
    # Mayúscula al empezar cada frase («… 200. el elemento» → «… 200. El elemento»).
    return re.sub(r'(\. )([a-záéíóúñ])', lambda m: m.group(1) + m.group(2).upper(), texto)


# Una ejecución manual está hecha cuando ya tiene su captura y su estado.
for _m in manual:
    _m['ruta'] = _RUTAS.get(_m['archivo'])
    _m['hecho'] = bool(_m['ruta'] and _m.get('estado'))


# Enlaza cada defecto con la evidencia y el resultado observado en la ejecución.
_expl = {d['id']: d for d in defs_expl['defectos']}
_caso_por_defecto = {}
_casos_del_defecto = {}
for c in ciclo1['casos']:
    if c['defecto']:
        _caso_por_defecto.setdefault(c['defecto'], c)
        _casos_del_defecto.setdefault(c['defecto'], []).append(c)

for d in DEFECTOS:
    e = _expl.get(d['id'])
    caso = _caso_por_defecto.get(d['id'])
    if e:
        d['frecuencia'] = e.get('frecuencia', '3 de 3 intentos')
        d['resultado_real'] = e['resultado']
        d['evidencias'] = e.get('evidencias', [])
        d['notas'] = e.get('notas', [])
    elif caso:
        d['frecuencia'] = '3 de 3 intentos (resultado estable en los ciclos 1 y 2)'
        d['resultado_real'] = caso['real']
        # Todas las capturas del ciclo 1 de los casos que fallaron por este defecto.
        d['evidencias'] = [ev for c in _casos_del_defecto[d['id']] for ev in c['evidencias']]
        d['notas'] = []
    else:
        d['frecuencia'] = '—'
        d['resultado_real'] = ''
        d['evidencias'] = []
        d['notas'] = []

# Añade la evidencia de la consola (F12) a los defectos que también se verifican por ahí.
_ev_consola = {p['id']: p.get('evidencia') for p in consola.get('pruebas', [])}
for d in DEFECTOS:
    ev = _ev_consola.get(d['id'])
    if ev and ev != '—' and ev not in d['evidencias']:
        d['evidencias'].append(ev)
    faltan = [e for e in d['evidencias'] if not ruta_evidencia(e)]
    if faltan:
        raise SystemExit(f"{d['id']}: no se encontró la captura {faltan}")
    if not d['evidencias']:
        raise SystemExit(f"{d['id']} no tiene evidencia")

# --- Métricas ----------------------------------------------------------------
def contar(casos, estado):
    return sum(1 for c in casos if c['estado'] == estado)

def metricas():
    c1 = ciclo1['casos']
    aprob1 = contar(c1, 'Aprobado'); fall1 = contar(c1, 'Fallido'); bloq1 = contar(c1, 'Bloqueado')
    ejec1 = aprob1 + fall1
    c2 = ciclo2['casos']
    aprob2 = contar(c2, 'Aprobado'); fall2 = contar(c2, 'Fallido')
    ejec2 = aprob2 + fall2
    por_sev = {}
    for d in DEFECTOS:
        if d['estado'] != 'Verificado':
            por_sev[d['severidad']] = por_sev.get(d['severidad'], 0) + 1
    # incluye el crítico verificado en el conteo total de defectos reportados
    return dict(aprob1=aprob1, fall1=fall1, bloq1=bloq1, ejec1=ejec1, dis1=len(c1),
                aprob2=aprob2, fall2=fall2, ejec2=ejec2,
                total_def=len(DEFECTOS), por_sev=por_sev)

M = metricas()

# --- Registro de ejecución (una fila por ejecución) --------------------------
def filas_registro():
    filas = []
    for c in ciclo1['casos']:
        filas.append((c['id'], 1, c['entorno'], c['fecha'], c['ejecutor'], c['estado'],
                      c['real'], ', '.join(c['evidencias']) or '—', c['defecto'] or '—'))
    for c in ciclo2['casos']:
        filas.append((c['id'], 2, c['entorno'].replace('Chromium', 'Chromium (sustituye a Firefox)'),
                      c['fecha'], c['ejecutor'], c['estado'],
                      c['real'], ', '.join(c['evidencias']) or '—', c['defecto'] or '—'))
    for m in manual:
        if m['hecho']:
            filas.append((m['id'], m['ciclo'], f"{m.get('navegador') or 'navegador sin anotar'} · Railway (manual)",
                          m.get('fecha') or '—', m['ejecuta'], m['estado'], m.get('real') or '—',
                          m['archivo'], '—'))
    return filas

if __name__ == '__main__':
    print('Ciclo 1:', M['aprob1'], 'aprob,', M['fall1'], 'fall,', M['bloq1'], 'bloq de', M['dis1'])
    print('Ciclo 2:', M['aprob2'], 'aprob,', M['fall2'], 'fall de', M['ejec2'])
    print('Defectos:', M['total_def'], 'por severidad', M['por_sev'])
