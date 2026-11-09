// Comprueba que los textos largos sin espacios (nombres, enlaces, materias) se partan y no ensanchen la página en celulares.
const fs = require('fs');
const path = require('path');

const RAIZ_FRONTEND = path.join(__dirname, '..', 'frontend');

// Lee un archivo del frontend.
function leer(...partes) {
  return fs.readFileSync(path.join(RAIZ_FRONTEND, ...partes), 'utf8');
}

const css = ['estructura.css', 'componentes.css', 'paginas.css'].map((n) => leer('css', n)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

// Reúne los selectores que tienen una regla con la declaración pedida.
function selectoresCon(declaracion) {
  const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return new Set(reglas.filter(([, , cuerpo]) => declaracion.test(cuerpo)).flatMap(([, selectores]) => selectores.split(',').map((s) => s.trim())));
}

const SE_PARTEN = selectoresCon(/overflow-wrap:\s*anywhere/);

describe('Texto que escribe la gente', () => {
  test.each([
    '.perfil__nombre',
    '.cabecera-pagina__titulo',
    '.kpi__detalle',
    '.ficha',
    '.horario__lugar',
    '.periodo__nombre',
    '.tutoria__meta',
    '.tutoria__nota',
    '.tutoria__nota-texto',
    '.alerta-estudiante__detalle',
    '.notif-item__titulo',
    '.notif-item__desc',
    '.actividad__texto',
    '.kpi__valor',
    '.nota-reporte',
    '.sugerencia__titulo',
    '.sugerencia__detalle',
    '.modal__titulo',
    '.modal__descripcion',
    '.tostada__texto',
    '.tabla td',
  ])('%s parte las palabras muy largas', (selector) => {
    expect(SE_PARTEN.has(selector)).toBe(true);
  });

  test('el texto de toda la página se parte antes de salirse de su caja', () => {
    expect(leer('css', 'base.css')).toMatch(/body\s*\{[^}]*overflow-wrap:\s*break-word/);
  });

  test('las ventanas y los avisos dejan que su texto se encoja dentro de la caja', () => {
    expect(css).toMatch(/\.tostada__texto\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.modal__cabecera > div,\s*\.modal__encabezado-icono > div\s*\{\s*min-width:\s*0/);
  });

  test('los botones de la zona peligrosa pueden partir el nombre del período en varias líneas', () => {
    expect(css).toMatch(/\.zona-peligrosa__botones \.btn\s*\{[^}]*white-space:\s*normal/);
  });

  test('las celdas de números, acciones y fechas no se parten', () => {
    expect(css).toMatch(/\.tabla td\.num,\s*\.tabla td\.acciones,\s*\.tabla td\.no-parte\s*\{\s*overflow-wrap:\s*normal/);
  });

  test('las etiquetas con texto de la persona pueden usar varias líneas', () => {
    expect(css).toMatch(/\.insignia--texto\s*\{[^}]*white-space:\s*normal/);
    expect(leer('js', 'perfil.js')).toMatch(/insignia--sin-punto insignia--texto/);
  });

  test('las tablas con desplazamiento contienen el texto oculto para lectores de pantalla', () => {
    expect(css).toMatch(/\.tabla-scroll\s*\{[^}]*overflow-x:\s*auto[^}]*position:\s*relative/);
  });
});

describe('Pantallas de 320 px a 390 px', () => {
  test('las franjas horarias del docente pasan a una sola columna', () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)\s*\{\s*\.horario-fila\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  });

  test('el indicador de pasos no deja líneas sueltas al partirse en dos filas', () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)\s*\{[^@]*\.paso \+ \.paso::before\s*\{\s*display:\s*none/);
  });

  test('las alertas del docente caben en una pantalla de 320 px', () => {
    expect(css).toMatch(/\.grilla--auto\s*\{[^}]*minmax\(min\(100%,\s*19rem\),\s*1fr\)/);
  });

  test('los botones de mes del calendario muestran solo el ícono en pantallas muy angostas', () => {
    expect(css).toMatch(/@media \(max-width: 24rem\)\s*\{\s*\.cal__nav-texto\s*\{\s*display:\s*none/);
    expect(leer('index.html')).toContain('<span class="cal__nav-texto">Anterior</span>');
    expect(leer('index.html')).toContain('<span class="cal__nav-texto">Siguiente</span>');
  });
});
