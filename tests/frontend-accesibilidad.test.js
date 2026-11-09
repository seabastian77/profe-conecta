// Comprueba detalles de accesibilidad de la interfaz: contraste del texto tenue, nombres de botones y estructura de la página.
const fs = require('fs');
const path = require('path');

const RAIZ_FRONTEND = path.join(__dirname, '..', 'frontend');

// Lee un archivo del frontend.
function leer(...partes) {
  return fs.readFileSync(path.join(RAIZ_FRONTEND, ...partes), 'utf8');
}

const tokens = leer('css', 'tokens.css');
const html = leer('index.html');

// Devuelve el color hexadecimal de una variable definida en tokens.css.
function color(nombre) {
  const coincidencia = new RegExp(String.raw`--${nombre}:\s*(#[0-9a-fA-F]{6})`).exec(tokens);
  if (!coincidencia) throw new Error(`Falta la variable --${nombre}`);
  return coincidencia[1];
}

// Calcula la luminancia relativa de un color hexadecimal según WCAG.
function luminancia(hex) {
  const canales = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = canales.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Calcula la relación de contraste entre dos colores.
function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

describe('Contraste del texto tenue', () => {
  test.each(['papel', 'tinta-50', 'tinta-100', 'tinta-150', 'marca-50', 'marca-100'])(
    'el texto tenue se lee sobre el fondo %s (mínimo 4,5:1)',
    (fondo) => {
      expect(contraste(color('tinta-500'), color(fondo))).toBeGreaterThanOrEqual(4.5);
    }
  );
});

describe('Estructura y nombres accesibles', () => {
  test('los botones de mes del calendario conservan su nombre aunque se oculte el texto', () => {
    expect(html).toMatch(/aria-label="Mes anterior"[^>]*onclick="calNavegar\(-1\)"/);
    expect(html).toMatch(/aria-label="Mes siguiente"[^>]*onclick="calNavegar\(1\)"/);
  });

  test('el botón del usuario dice de quién es la sesión y se limpia al cerrarla', () => {
    const auth = leer('js', 'auth.js');
    expect(auth).toMatch(/getElementById\('botonUsuario'\)\.setAttribute\('aria-label', 'Menú de usuario: ' \+ nombreCompleto\)/);
    expect(auth).toMatch(/getElementById\('botonUsuario'\)\.removeAttribute\('aria-label'\)/);
  });

  test('las próximas actividades son una sección de la página y no un complemento aparte', () => {
    expect(html).toMatch(/<section[^>]*aria-labelledby="tituloProximas"/);
    expect(html).not.toMatch(/<aside[^>]*aria-labelledby="tituloProximas"/);
  });

  test('la leyenda de colores del calendario es un grupo con nombre', () => {
    expect(html).toMatch(/<div class="leyenda" role="group" aria-label="Leyenda de colores">/);
  });

  test('la foto de portada oculta no deja una imagen sin origen', () => {
    expect(html).toMatch(/<img[^>]*id="perfilPortadaImg"[^>]*src="data:image\/gif;base64,/);
  });

  test('el título del calendario nunca queda vacío mientras carga', () => {
    expect(html).toMatch(/<h2[^>]*data-cal="calTitulo"[^>]*>\S[^<]*<\/h2>/);
  });
});
