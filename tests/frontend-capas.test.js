// Comprueba que las capas del menú lateral en celular no se pisen y que el telón nunca tape el menú.
const fs = require('fs');
const path = require('path');

// Lee una hoja de estilos del frontend.
function leerCss(nombre) {
  return fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', nombre), 'utf8');
}

const estructura = leerCss('estructura.css');

// Devuelve el valor numérico de una variable de capa definida en tokens.css.
function capa(nombre) {
  const coincidencia = new RegExp(String.raw`--z-${nombre}:\s*(\d+)`).exec(leerCss('tokens.css'));
  if (!coincidencia) throw new Error(`Falta la variable --z-${nombre}`);
  return Number(coincidencia[1]);
}

describe('Capas del menú lateral en pantallas pequeñas', () => {
  test('el telón oscuro queda debajo del menú y encima de la barra superior', () => {
    expect(capa('telon')).toBeLessThan(capa('lateral'));
    expect(capa('barra')).toBeLessThan(capa('telon'));
  });

  test('los paneles flotantes, las ventanas y las tostadas quedan por encima del menú', () => {
    expect(capa('popover')).toBeGreaterThan(capa('lateral'));
    expect(capa('modal')).toBeGreaterThan(capa('popover'));
    expect(capa('tostada')).toBeGreaterThan(capa('modal'));
  });

  test('el telón y el menú toman su capa de las variables y no de un valor fijo', () => {
    expect(estructura).toMatch(/\.telon\s*\{[^}]*z-index:\s*var\(--z-telon\)/);
    expect(estructura).toMatch(/\.lateral\s*\{[^}]*z-index:\s*var\(--z-lateral\)/);
  });

  test('el telón no se muestra en el diseño de escritorio', () => {
    expect(estructura).toMatch(/@media \(min-width: 64\.0625rem\)\s*\{\s*\.telon\s*\{\s*display:\s*none/);
  });

  test('el menú cerrado en celular queda oculto para el foco y para los toques', () => {
    const movil = estructura.slice(estructura.indexOf('@media (max-width: 64rem)'));
    expect(movil).toMatch(/\.lateral\s*\{[^}]*translateX\(-100%\)[^}]*visibility:\s*hidden/);
    expect(movil).toMatch(/\.lateral\.abierta\s*\{[^}]*visibility:\s*visible/);
  });
});
