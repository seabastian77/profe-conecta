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
    // Pruebas E2 con Playwright: mezclan Node con código que corre dentro del
    // navegador (page.evaluate), así que suman los globales del navegador.
    files: ['pruebas/e2/**/*.js'],
    languageOptions: {
      globals: {
        ...globalesNode,
        document: 'readonly', window: 'readonly', localStorage: 'readonly',
        location: 'readonly', getComputedStyle: 'readonly', Image: 'readonly',
        FileReader: 'readonly', Intl: 'readonly',
        // Funciones del frontend de ConectaProfe invocadas desde page.evaluate.
        irAPagina: 'readonly', cerrarSesion: 'readonly', seleccionarDia: 'readonly',
        filtrarTablaUsuarios: 'readonly', cerrarModalNuevoUsuario: 'readonly',
      },
    },
  },
];
