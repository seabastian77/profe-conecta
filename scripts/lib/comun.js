// Utilidades compartidas por los scripts de mantenimiento de la base de datos.
const path = require('path');
const { Client } = require('pg');

const CARPETA_RESPALDOS = path.join(__dirname, '..', '..', 'respaldos');

// Convierte --bandera y --clave=valor en un objeto; lo demás queda en la lista «_».
function leerArgumentos(argv) {
  const opciones = { _: [] };
  for (const arg of argv) {
    const m = /^--([a-z0-9-]+)(?:=(.*))?$/i.exec(arg);
    if (m) opciones[m[1]] = m[2] === undefined ? true : m[2];
    else opciones._.push(arg);
  }
  return opciones;
}

// Elige la URL de conexión: la del argumento, o la pública de Railway si la interna no se alcanza desde fuera, o DATABASE_URL.
function resolverUrl(opciones = {}, entorno = process.env) {
  if (typeof opciones.url === 'string' && opciones.url) return opciones.url;
  const interna = entorno.DATABASE_URL || '';
  if (/\.railway\.internal/.test(interna) && entorno.DATABASE_PUBLIC_URL) return entorno.DATABASE_PUBLIC_URL;
  return interna || entorno.DATABASE_PUBLIC_URL || '';
}

// Describe el destino sin mostrar la contraseña.
function describirDestino(url) {
  try {
    const u = new URL(url);
    const socket = u.searchParams.get('host');
    const servidor = socket || `${u.hostname}${u.port ? ':' + u.port : ''}`;
    return `${servidor}/${u.pathname.replace(/^\//, '')}`;
  } catch {
    return '(URL de conexión no válida)';
  }
}

// Indica si la conexión es local (socket o localhost), donde no se usa SSL.
function esConexionLocal(url) {
  try {
    const u = new URL(url);
    return Boolean(u.searchParams.get('host')) || ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(u.hostname) || u.hostname.endsWith('.railway.internal');
  } catch {
    return true;
  }
}

// Abre una conexión única (necesaria para transacciones y cursores) con SSL cuando el servidor es remoto.
async function conectar(url) {
  if (!url) throw new Error('No hay URL de base de datos: define DATABASE_URL o pasa --url=postgresql://…');
  const configuracion = { connectionString: url, statement_timeout: 0 };
  if (!/sslmode=/.test(url) && !esConexionLocal(url)) configuracion.ssl = { rejectUnauthorized: false };
  const cliente = new Client(configuracion);
  cliente.on('error', () => { /* el error llega también por la consulta en curso */ });
  await cliente.connect();
  return cliente;
}

// Devuelve la fecha y hora local como AAAAMMDD_HHMMSS para nombrar archivos.
function marcaDeTiempo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}_${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`;
}

// Muestra un tamaño en bytes de forma legible.
function formatearBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Ejecuta la función principal de un script, imprime el error de forma legible y fija el código de salida.
function correrScript(principal) {
  principal().then(
    (codigo) => process.exit(codigo || 0),
    (err) => {
      console.error(`\n❌ ${err.message}`);
      if (process.env.DEPURAR) console.error(err.stack);
      process.exit(2);
    }
  );
}

module.exports = {
  CARPETA_RESPALDOS, leerArgumentos, resolverUrl, describirDestino, esConexionLocal, conectar, marcaDeTiempo, formatearBytes, correrScript
};
