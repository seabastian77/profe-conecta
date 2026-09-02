// Pruebas que no necesitan base de datos: verifican la lógica de seguridad
// pura (tokens y códigos OAuth). Corren en cualquier máquina y en el CI.

process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-no-usar-en-produccion';

const { generarToken, verificarToken } = require('../src/config/jwt');
const { crearCodigo, canjearCodigo }   = require('../src/config/codigosOauth');
const jwt = require('jsonwebtoken');

describe('JWT', () => {
  const usuario = { id: 7, correo: 'sebas@amigo.edu.co', rol: 'admin' };

  test('genera y verifica un token válido', () => {
    const payload = verificarToken(generarToken(usuario));
    expect(payload.id).toBe(7);
    expect(payload.rol).toBe('admin');
  });

  test('rechaza un token firmado con otro secreto', () => {
    const falso = jwt.sign({ id: 1, rol: 'admin' }, 'otro-secreto');
    expect(() => verificarToken(falso)).toThrow();
  });

  test('rechaza el algoritmo "none" (token sin firma)', () => {
    const sinFirma = jwt.sign({ id: 1, rol: 'admin' }, '', { algorithm: 'none' });
    expect(() => verificarToken(sinFirma)).toThrow();
  });

  test('rechaza un token con emisor distinto', () => {
    const ajeno = jwt.sign(
      { id: 1, rol: 'admin' },
      process.env.JWT_SECRET,
      { issuer: 'otra-app', audience: 'conectaprofe-app' }
    );
    expect(() => verificarToken(ajeno)).toThrow();
  });

  test('rechaza un token vencido', () => {
    const vencido = jwt.sign(
      { id: 1, rol: 'admin' },
      process.env.JWT_SECRET,
      { issuer: 'conectaprofe', audience: 'conectaprofe-app', expiresIn: '-1s' }
    );
    expect(() => verificarToken(vencido)).toThrow();
  });
});

describe('Códigos OAuth de un solo uso', () => {
  test('se canjea una vez y queda inservible', () => {
    const codigo = crearCodigo({ token: 'abc', usuario: { id: 1 } });
    expect(canjearCodigo(codigo).token).toBe('abc');
    expect(canjearCodigo(codigo)).toBeNull(); // segunda vez: nada
  });

  test('un código inventado no sirve', () => {
    expect(canjearCodigo('codigo-que-no-existe')).toBeNull();
    expect(canjearCodigo(undefined)).toBeNull();
    expect(canjearCodigo(12345)).toBeNull();
  });

  test('los códigos son largos e impredecibles', () => {
    const a = crearCodigo({ token: 'x' });
    const b = crearCodigo({ token: 'y' });
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});
