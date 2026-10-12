const { db } = require('./db');

// Reglas que el administrador puede cambiar desde Configuración, con su valor por defecto y su rango válido.
const REGLAS = {
  RN_PROMEDIO_MINIMO:   { defecto: 3.0, min: 1, max: 5,   entero: false, nombre: 'Umbral de alerta' },
  RN_HORAS_CANCELACION: { defecto: 24,  min: 1, max: 72,  entero: true,  nombre: 'Horas mínimas para cancelar' },
  RN_MAX_ESTUDIANTES:   { defecto: 15,  min: 1, max: 100, entero: true,  nombre: 'Máximo de estudiantes por tutor' },
  RN_MINUTOS_SESION:    { defecto: 15,  min: 5, max: 480, entero: true,  nombre: 'Minutos de inactividad' },
};

// Claves que guardaba la pantalla antes y que ninguna regla leía; se traducen por si llega un navegador con la versión vieja.
const CLAVES_ANTERIORES = {
  umbral_alerta: 'RN_PROMEDIO_MINIMO',
  max_estudiantes_tutor: 'RN_MAX_ESTUDIANTES',
  horas_cancelacion: 'RN_HORAS_CANCELACION',
  minutos_sesion: 'RN_MINUTOS_SESION',
};

// Lee un valor de la tabla de configuración o devuelve el valor por defecto.
async function getConfig(clave, defecto) {
  try {
    const row = await db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
    return row?.valor || defecto;
  } catch {
    return defecto;
  }
}

// Igual que getConfig pero devuelve el valor como número; un valor dañado vuelve al defecto.
async function getConfigNum(clave, defecto) {
  const numero = parseFloat(await getConfig(clave, defecto));
  return Number.isFinite(numero) ? numero : defecto;
}

// Devuelve la clave oficial de una regla o null si no es una regla configurable.
function claveRegla(clave) {
  const oficial = CLAVES_ANTERIORES[clave] || clave;
  return REGLAS[oficial] ? oficial : null;
}

// Valida el valor de una regla y lo devuelve normalizado, o un mensaje de error.
function validarRegla(clave, valor) {
  const regla = REGLAS[clave];
  const numero = Number(String(valor).replace(',', '.'));
  if (valor === '' || valor === null || !Number.isFinite(numero)) {
    return { error: `${regla.nombre}: escribe un número` };
  }
  if (regla.entero && !Number.isInteger(numero)) {
    return { error: `${regla.nombre}: debe ser un número entero` };
  }
  if (numero < regla.min || numero > regla.max) {
    return { error: `${regla.nombre}: debe estar entre ${regla.min} y ${regla.max}` };
  }
  return { valor: regla.entero ? String(numero) : numero.toFixed(1) };
}

// Lee todas las reglas en una sola consulta, con su defecto si no están guardadas.
async function obtenerReglas() {
  const reglas = {};
  for (const [clave, regla] of Object.entries(REGLAS)) reglas[clave] = regla.defecto;
  try {
    const { rows } = await db.pool.query(
      'SELECT clave, valor FROM configuracion WHERE clave = ANY($1::text[])', [Object.keys(REGLAS)]
    );
    for (const fila of rows) {
      const numero = parseFloat(fila.valor);
      if (Number.isFinite(numero)) reglas[fila.clave] = numero;
    }
  } catch { /* sin base responde los valores por defecto */ }
  return reglas;
}

module.exports = { REGLAS, getConfig, getConfigNum, claveRegla, validarRegla, obtenerReglas };
