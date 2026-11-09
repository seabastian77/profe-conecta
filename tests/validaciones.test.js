// Comprueba que un correo aceptado en el panel de administración también lo acepte el inicio de sesión.
const { body } = require('express-validator');
const { correoValido } = require('../src/config/validaciones');

// Pasa el correo por la misma revisión de forma que usa el inicio de sesión.
async function loAceptaElInicioDeSesion(correo) {
  const resultado = await body('correo').isEmail().run({ body: { correo } });
  return resultado.isEmpty();
}

// Acorta los correos largos para que el nombre de cada prueba se lea bien.
const titulo = (correo) => [correo.length > 36 ? `${correo.slice(0, 18)}…${correo.slice(-14)}` : correo, correo];

const VALIDOS = [
  'ana@amigo.edu.co',
  'juan.perez@amigo.edu.co',
  'maria_lopez-2@amigo.edu.co',
  'ñandú@amigo.edu.co',
  'a+b@amigo.edu.co',
  `${'x'.repeat(64)}@amigo.edu.co`,
];

const INVALIDOS = [
  `${'x'.repeat(65)}@amigo.edu.co`,
  'a..b@amigo.edu.co',
  '.a@amigo.edu.co',
  'a.@amigo.edu.co',
  'a@b.c',
  'a@amigo',
  'a@-amigo.edu.co',
  'a@amigo.edu.c0',
  'ab@amigo..co',
  'a@amigo.edu.co.',
  'a b@amigo.edu.co',
  "o'brien@amigo.edu.co",
  `a@${'d'.repeat(64)}.co`,
  `${'m'.repeat(100)}@amigo.edu.co`,
];

describe('Correo de las cuentas que crea el administrador', () => {
  test.each(VALIDOS.map(titulo))('acepta %s y el inicio de sesión también', async (_nombre, correo) => {
    expect(correoValido(correo)).toBe(true);
    expect(await loAceptaElInicioDeSesion(correo)).toBe(true);
  });

  test.each(INVALIDOS.map(titulo))('rechaza %s', (_nombre, correo) => {
    expect(correoValido(correo)).toBe(false);
  });

  test('nunca acepta un correo con el que luego no se pueda iniciar sesión', async () => {
    for (const correo of [...VALIDOS, ...INVALIDOS]) {
      if (correoValido(correo)) expect(await loAceptaElInicioDeSesion(correo)).toBe(true);
    }
  });

  test('rechaza lo que no es texto', () => {
    expect(correoValido(undefined)).toBe(false);
    expect(correoValido(null)).toBe(false);
    expect(correoValido(42)).toBe(false);
  });
});
