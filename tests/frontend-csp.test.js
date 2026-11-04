// Comprueba que la política de contenido del servidor y la interfaz sigan siendo compatibles entre sí.
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-solo-para-pruebas';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');

const RAIZ_FRONTEND = path.join(__dirname, '..', 'frontend');

// Lista los archivos con la extensión pedida dentro de una carpeta, incluidas las subcarpetas.
function listar(carpeta, extension) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return listar(ruta, extension);
    return ruta.endsWith(extension) ? [ruta] : [];
  });
}

describe('Política de contenido (CSP)', () => {
  let politica;

  beforeAll(async () => {
    const res = await request(app).get('/api/ping');
    politica = res.headers['content-security-policy'];
  });

  // Devuelve el valor de una directiva concreta de la política.
  const directiva = (nombre) => politica.split(';').map((d) => d.trim()).find((d) => d.startsWith(nombre + ' ')) || '';

  test('los scripts solo se cargan desde el mismo origen, sin eval ni bloques en línea', () => {
    expect(directiva('script-src')).toBe("script-src 'self'");
  });

  test('los estilos solo se cargan desde el mismo origen, sin atributos style en línea', () => {
    expect(directiva('style-src')).toBe("style-src 'self'");
  });

  test('las fuentes se sirven desde el propio servidor, sin hosts externos', () => {
    expect(directiva('font-src')).toBe("font-src 'self'");
  });

  test('impide incrustar la página en otros sitios y cargar plugins', () => {
    expect(directiva('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directiva('object-src')).toBe("object-src 'none'");
  });
});

describe('Interfaz compatible con la política de contenido', () => {
  const html = fs.readFileSync(path.join(RAIZ_FRONTEND, 'index.html'), 'utf8');
  const scripts = [...listar(path.join(RAIZ_FRONTEND, 'js'), '.js')];

  test('index.html no usa estilos en línea ni bloques <style>', () => {
    expect(html).not.toMatch(/\sstyle=/i);
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  test('index.html no contiene scripts en línea', () => {
    const sinSrc = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\ssrc=/.test(m[1]));
    expect(sinSrc).toHaveLength(0);
  });

  test('todos los scripts que declara index.html existen en disco', () => {
    const declarados = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/gi)].map((m) => m[1]);
    expect(declarados.length).toBeGreaterThan(10);
    for (const ruta of declarados) {
      expect(fs.existsSync(path.join(RAIZ_FRONTEND, ruta))).toBe(true);
    }
  });

  test('ningún script del frontend escribe atributos style ni usa eval', () => {
    for (const archivo of scripts) {
      const codigo = fs.readFileSync(archivo, 'utf8');
      const nombre = path.relative(RAIZ_FRONTEND, archivo);
      expect({ nombre, estilo: /\sstyle=\\?["']|setAttribute\(\s*['"]style['"]/.test(codigo) }).toEqual({ nombre, estilo: false });
      expect({ nombre, eval: /\beval\s*\(|new Function\s*\(/.test(codigo) }).toEqual({ nombre, eval: false });
    }
  });

  test('las hojas de estilo y los scripts no apuntan a hosts externos de fuentes', () => {
    const archivos = [...listar(path.join(RAIZ_FRONTEND, 'css'), '.css'), ...scripts, path.join(RAIZ_FRONTEND, 'index.html')];
    for (const archivo of archivos) {
      const contenido = fs.readFileSync(archivo, 'utf8');
      expect({ archivo: path.basename(archivo), externo: /fonts\.googleapis|fonts\.gstatic/.test(contenido) })
        .toEqual({ archivo: path.basename(archivo), externo: false });
    }
  });
});
