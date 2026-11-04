const fs = require('fs');
const path = require('path');

const globalesNode = {
  require: 'readonly', module: 'writable', exports: 'writable',
  process: 'readonly', console: 'readonly', __dirname: 'readonly',
  __filename: 'readonly', Buffer: 'readonly', setTimeout: 'readonly',
  clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  URL: 'readonly', fetch: 'readonly',
};

const globalesJest = {
  describe: 'readonly', test: 'readonly', it: 'readonly', expect: 'readonly',
  beforeAll: 'readonly', afterAll: 'readonly', beforeEach: 'readonly',
  afterEach: 'readonly', jest: 'readonly',
};

const globalesNavegador = Object.fromEntries([
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'performance', 'console',
  'fetch', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'URL', 'URLSearchParams', 'Blob', 'FormData', 'FileReader', 'AbortController', 'TextEncoder', 'Option', 'Image',
  'HTMLDialogElement', 'HTMLInputElement', 'Event', 'CustomEvent', 'IntersectionObserver', 'ResizeObserver', 'createImageBitmap',
].map((nombre) => [nombre, 'readonly']));

// Los scripts del frontend comparten el ámbito global: se leen sus declaraciones de primer nivel para que no-undef detecte nombres mal escritos.
function globalesDelFrontend() {
  const base = path.join(__dirname, 'frontend', 'js');
  const archivos = [base, path.join(base, 'storage')]
    .flatMap((carpeta) => fs.readdirSync(carpeta).filter((f) => f.endsWith('.js')).map((f) => path.join(carpeta, f)));
  const globales = {};
  for (const archivo of archivos) {
    const patron = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
    for (const coincidencia of fs.readFileSync(archivo, 'utf8').matchAll(patron)) {
      globales[coincidencia[1] || coincidencia[2]] = 'writable';
    }
  }
  return globales;
}

module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', 'coverage/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globalesNode,
    },
    rules: {
      'no-undef': 'error',              // variables fantasma como HORAS_CANCELACION
      'no-unused-vars': ['warn', { argsIgnorePattern: '^next$|^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'require-atomic-updates': 'warn',
      'no-return-await': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globalesNode, ...globalesJest } },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globalesNavegador, ...globalesDelFrontend() },
    },
    rules: {
      'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'require-atomic-updates': 'off',
    },
  },
];
