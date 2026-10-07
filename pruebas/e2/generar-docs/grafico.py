# -*- coding: utf-8 -*-
"""Genera el gráfico de defectos por requisito y severidad del Entregable 2."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from collections import defaultdict
from textos import DEFECTOS_BASE as DEFECTOS

# Agrupa el requisito a su etiqueta corta (R1..R8, RNF, transversal).
def grupo(req):
    r = req.split('·')[0].strip()
    if r.startswith('RNF'): return 'RNF02'
    if r.startswith('RF028') or 'transversal' in req: return 'Transversal'
    return r

SEVERIDADES = ['Crítica', 'Alta', 'Media', 'Baja']
COLORES = {'Crítica': '#7f1d1d', 'Alta': '#dc2626', 'Media': '#f59e0b', 'Baja': '#0ea5e9'}

conteo = defaultdict(lambda: defaultdict(int))
for d in DEFECTOS:
    conteo[grupo(d['requisito'])][d['severidad']] += 1

orden = ['R2', 'R4', 'R5', 'R6', 'R7', 'R8', 'RNF02', 'Transversal']
reqs = [r for r in orden if r in conteo] + [r for r in conteo if r not in orden]

fig, ax = plt.subplots(figsize=(8.2, 3.6), dpi=150)
abajo = [0] * len(reqs)
for sev in SEVERIDADES:
    valores = [conteo[r].get(sev, 0) for r in reqs]
    if sum(valores) == 0:
        continue
    ax.bar(reqs, valores, bottom=abajo, label=sev, color=COLORES[sev], edgecolor='white', linewidth=0.6)
    for i, v in enumerate(valores):
        if v:
            ax.text(i, abajo[i] + v / 2, str(v), ha='center', va='center', color='white', fontsize=9, fontweight='bold')
    abajo = [a + b for a, b in zip(abajo, valores)]

ax.set_ylabel('Número de defectos', fontsize=10)
ax.set_title('Defectos por requisito y severidad', fontsize=12, fontweight='bold')
ax.legend(title='Severidad', fontsize=9, title_fontsize=9, frameon=False, loc='upper right')
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.set_axisbelow(True)
ax.yaxis.grid(True, color='#e5e7eb', linewidth=0.8)
ax.set_ylim(0, max(abajo) + 1)
plt.tight_layout()
salida = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grafico_defectos.png')
plt.savefig(salida, bbox_inches='tight')
print('Guardado', salida, '→ conteo:', {r: dict(conteo[r]) for r in reqs})
