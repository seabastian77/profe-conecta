// Respaldo y restauración lógicos: un solo archivo comprimido con todas las tablas, que se verifica solo y no depende de pg_dump.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { pipeline } = require('stream');
const { StringDecoder } = require('string_decoder');
const { once } = require('events');
const { CARPETA_RESPALDOS, marcaDeTiempo } = require('./comun');
const {
  crearTablas, crearIndices, ajustarColumnas, corregirClavesForaneas, endurecerEsquema
} = require('../../src/config/esquema');

const FORMATO = 1;
const TABLAS_EXCLUIDAS = ['intentos_login'];
const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/;
const TIPO_SQL = /^[a-z][a-z ]*(\(\d{1,4}(,\d{1,4})?\))?$/;
const FILAS_POR_LECTURA = 200;
const BYTES_POR_LECTURA = 8 * 1024 * 1024;
const BYTES_POR_INSERT = 4 * 1024 * 1024;
const PARAMETROS_POR_INSERT = 20000;

// Calcula cuánto pesa una fila de texto.
function pesoDeFila(fila) {
  return fila.reduce((suma, valor) => suma + (valor === null ? 1 : valor.length + 1), 0);
}

// Lista las tablas de la aplicación con las que otras dependen primero, para poder cargarlas en orden.
async function listarTablas(c) {
  const { rows: tablas } = await c.query('SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename');
  const nombres = tablas.map(t => t.tablename).filter(n => !TABLAS_EXCLUIDAS.includes(n));
  for (const n of nombres) {
    if (!IDENTIFICADOR.test(n)) throw new Error(`La tabla «${n}» tiene un nombre que el respaldo no admite`);
  }

  const { rows: dependencias } = await c.query(`
    SELECT hija.relname AS hija, padre.relname AS padre
      FROM pg_constraint k
      JOIN pg_class hija  ON hija.oid  = k.conrelid
      JOIN pg_class padre ON padre.oid = k.confrelid
     WHERE k.contype = 'f' AND hija.oid <> padre.oid
       AND hija.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`);

  const pendientes = new Map(nombres.map(n => [n, new Set()]));
  for (const { hija, padre } of dependencias) {
    if (pendientes.has(hija) && pendientes.has(padre)) pendientes.get(hija).add(padre);
  }

  const orden = [];
  while (pendientes.size) {
    const listas = [...pendientes].filter(([, deps]) => deps.size === 0).map(([n]) => n);
    if (!listas.length) throw new Error('Las tablas tienen dependencias circulares: no se puede ordenar el respaldo');
    for (const n of listas) { pendientes.delete(n); orden.push(n); }
    for (const deps of pendientes.values()) listas.forEach(n => deps.delete(n));
  }
  return orden;
}

// Devuelve las columnas de una tabla con su tipo exacto, para volver a crear cada valor con el mismo tipo.
async function describirTabla(c, nombre) {
  const { rows } = await c.query(
    `SELECT a.attname AS nombre, format_type(a.atttypid, a.atttypmod) AS tipo
       FROM pg_attribute a
      WHERE a.attrelid = ($1::text)::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      ORDER BY a.attnum`,
    [`"${nombre}"`]
  );
  return rows;
}

// Lee un archivo comprimido línea por línea; un archivo dañado hace fallar la lectura.
async function* leerLineas(archivo) {
  const descompresor = zlib.createGunzip();
  pipeline(fs.createReadStream(archivo), descompresor, () => { /* el error llega por la iteración */ });

  const decodificador = new StringDecoder('utf8');
  let resto = '';
  for await (const bloque of descompresor) {
    const partes = (resto + decodificador.write(bloque)).split('\n');
    resto = partes.pop();
    for (const parte of partes) if (parte) yield parte;
  }
  resto += decodificador.end();
  if (resto) yield resto;
}

// Comprueba que la cabecera sea de un respaldo de esta aplicación y que sus nombres y tipos sean seguros de usar en SQL.
function validarCabecera(cabecera) {
  if (cabecera.formato !== FORMATO || cabecera.app !== 'conectaprofe') {
    throw new Error('El archivo no es un respaldo de ConectaProfe o es de un formato que esta versión no entiende');
  }
  if (!Array.isArray(cabecera.tablas) || !cabecera.tablas.length) throw new Error('El respaldo no trae ninguna tabla');

  for (const tabla of cabecera.tablas) {
    if (!IDENTIFICADOR.test(tabla.nombre) || !Number.isInteger(tabla.filas) || tabla.filas < 0) {
      throw new Error('La cabecera del respaldo tiene una tabla con datos no válidos');
    }
    if (!Array.isArray(tabla.columnas) || !tabla.columnas.length) throw new Error(`La tabla ${tabla.nombre} no trae columnas`);
    for (const columna of tabla.columnas) {
      if (!IDENTIFICADOR.test(columna.nombre) || !TIPO_SQL.test(columna.tipo)) {
        throw new Error(`La columna ${tabla.nombre}.${columna.nombre} tiene un nombre o tipo no admitido`);
      }
    }
  }
}

// Crea el respaldo de todas las tablas dentro de una sola transacción de lectura, así todas quedan del mismo instante.
async function crearRespaldo(c, { carpeta = CARPETA_RESPALDOS, etiqueta = 'respaldo', destino } = {}) {
  const archivo = destino || path.join(carpeta, `${etiqueta}_${marcaDeTiempo()}.json.gz`);
  fs.mkdirSync(path.dirname(archivo), { recursive: true });

  const huella = crypto.createHash('sha256');
  const gzip = zlib.createGzip();
  const salida = fs.createWriteStream(archivo, { mode: 0o600 });
  const cerrado = new Promise((resolver, rechazar) => {
    salida.on('finish', resolver);
    salida.on('error', rechazar);
    gzip.on('error', rechazar);
  });
  cerrado.catch(() => { /* se informa por la rama que espera el cierre */ });
  gzip.pipe(salida);

  const escribir = async (objeto, enHuella = true) => {
    const linea = JSON.stringify(objeto) + '\n';
    if (enHuella) huella.update(linea);
    if (!gzip.write(linea)) await once(gzip, 'drain');
  };

  let abierta = false;
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    abierta = true;

    const tablas = [];
    for (const nombre of await listarTablas(c)) {
      const columnas = await describirTabla(c, nombre);
      const { rows } = await c.query(`SELECT COUNT(*)::text AS n FROM "${nombre}"`);
      tablas.push({ nombre, columnas, filas: Number(rows[0].n) });
    }
    const { rows: [info] } = await c.query("SELECT version() AS version, current_database() AS base, current_setting('TimeZone') AS zona");
    await escribir({
      t: 'cabecera', formato: FORMATO, app: 'conectaprofe', creado: new Date().toISOString(),
      base: info.base, servidor: info.version, zona: info.zona, omitidas: TABLAS_EXCLUIDAS, tablas
    });

    let totalFilas = 0;
    for (const tabla of tablas) {
      const lista = tabla.columnas.map(k => `"${k.nombre}"::text`).join(', ');
      await c.query(`DECLARE cursor_respaldo NO SCROLL CURSOR FOR SELECT ${lista} FROM "${tabla.nombre}" ORDER BY "${tabla.columnas[0].nombre}"`);
      let leidas = 0;
      let porLectura = FILAS_POR_LECTURA;
      for (;;) {
        const { rows } = await c.query({ text: `FETCH ${porLectura} FROM cursor_respaldo`, rowMode: 'array' });
        if (!rows.length) break;
        let bytes = 0;
        for (const fila of rows) {
          await escribir({ t: tabla.nombre, f: fila });
          bytes += pesoDeFila(fila);
        }
        leidas += rows.length;
        // Las tablas con filas pesadas (fotos en base64) se leen en lotes pequeños para no llenar la memoria.
        porLectura = Math.min(5000, Math.max(20, Math.floor(BYTES_POR_LECTURA / Math.max(1, bytes / rows.length))));
      }
      await c.query('CLOSE cursor_respaldo');
      if (leidas !== tabla.filas) throw new Error(`La tabla ${tabla.nombre} cambió durante la copia (${leidas} de ${tabla.filas} filas)`);
      totalFilas += leidas;
    }

    await c.query('COMMIT');
    abierta = false;

    const sha256 = huella.digest('hex');
    await escribir({ t: 'fin', sha256, filas: totalFilas }, false);
    gzip.end();
    await cerrado;

    return { archivo, bytes: fs.statSync(archivo).size, sha256, tablas: tablas.map(({ nombre, filas }) => ({ nombre, filas })), totalFilas };
  } catch (err) {
    if (abierta) await c.query('ROLLBACK').catch(() => { /* la conexión ya se perdió */ });
    gzip.destroy();
    salida.destroy();
    if (!salida.closed) await once(salida, 'close').catch(() => { /* ya estaba cerrada */ });
    fs.rmSync(archivo, { force: true });
    throw err;
  }
}

// Lee el respaldo completo sin tocar la base y confirma que está entero: huella, filas por tabla y estructura.
async function verificarRespaldo(archivo) {
  if (!fs.existsSync(archivo)) throw new Error(`No existe el archivo de respaldo: ${archivo}`);

  const huella = crypto.createHash('sha256');
  const conteo = {};
  let cabecera = null;
  let fin = null;
  let columnasPorTabla = {};
  let numero = 0;

  try {
    for await (const linea of leerLineas(archivo)) {
      numero++;
      let objeto;
      try { objeto = JSON.parse(linea); } catch { throw new Error(`La línea ${numero} del respaldo no se puede leer`); }

      if (objeto.t === 'fin') { fin = objeto; continue; }
      if (fin) throw new Error('Hay contenido después del cierre del respaldo');
      huella.update(linea + '\n');

      if (objeto.t === 'cabecera') {
        if (cabecera) throw new Error('El respaldo trae dos cabeceras');
        validarCabecera(objeto);
        cabecera = objeto;
        columnasPorTabla = Object.fromEntries(cabecera.tablas.map(t => [t.nombre, t.columnas.length]));
        continue;
      }

      if (!cabecera) throw new Error('El archivo no empieza con la cabecera de un respaldo');
      if (!(objeto.t in columnasPorTabla)) throw new Error(`La línea ${numero} es de una tabla que la cabecera no declara`);
      if (!Array.isArray(objeto.f) || objeto.f.length !== columnasPorTabla[objeto.t] || objeto.f.some(v => v !== null && typeof v !== 'string')) {
        throw new Error(`La línea ${numero} (${objeto.t}) no tiene la forma esperada`);
      }
      conteo[objeto.t] = (conteo[objeto.t] || 0) + 1;
    }
  } catch (err) {
    if (/^Z_|incorrect header check|unexpected end of file|invalid/i.test(`${err.code} ${err.message}`)) {
      throw new Error('El archivo está dañado o incompleto: no se pudo descomprimir');
    }
    throw err;
  }

  if (!cabecera) throw new Error('El archivo está vacío o no es un respaldo de ConectaProfe');
  if (!fin) throw new Error('El respaldo está incompleto: falta el cierre (la copia se interrumpió)');
  if (fin.sha256 !== huella.digest('hex')) throw new Error('El respaldo fue modificado o está dañado: su huella no coincide');
  for (const tabla of cabecera.tablas) {
    if ((conteo[tabla.nombre] || 0) !== tabla.filas) {
      throw new Error(`La tabla ${tabla.nombre} trae ${conteo[tabla.nombre] || 0} filas y debería traer ${tabla.filas}`);
    }
  }
  return { cabecera, conteo, sha256: fin.sha256, bytes: fs.statSync(archivo).size };
}

// Cuenta las filas que ya hay en las tablas del respaldo; una tabla que aún no existe cuenta cero.
async function contarFilasDestino(c, tablas) {
  const cuentas = {};
  for (const { nombre } of tablas) {
    const existe = await c.query('SELECT to_regclass($1) IS NOT NULL AS existe', [`"${nombre}"`]);
    cuentas[nombre] = existe.rows[0].existe ? Number((await c.query(`SELECT COUNT(*)::text AS n FROM "${nombre}"`)).rows[0].n) : null;
  }
  return cuentas;
}

// Inserta un grupo de filas restaurando cada valor con el tipo que tenía al copiarlo.
async function insertarLote(c, tabla, filas) {
  const n = tabla.columnas.length;
  const columnas = tabla.columnas.map(k => `"${k.nombre}"`).join(', ');
  const valores = filas
    .map((_, i) => `(${tabla.columnas.map((k, j) => `$${i * n + j + 1}::${k.tipo}`).join(', ')})`)
    .join(', ');
  await c.query(`INSERT INTO "${tabla.nombre}" (${columnas}) VALUES ${valores}`, filas.flat());
}

// Restaura un respaldo verificado en una sola transacción: si algo falla no queda ningún cambio.
async function restaurarRespaldo(c, archivo, { reemplazar = false, carpeta = CARPETA_RESPALDOS } = {}) {
  const { cabecera } = await verificarRespaldo(archivo);

  const antes = await contarFilasDestino(c, cabecera.tablas);
  const conDatos = Object.entries(antes).filter(([, n]) => n > 0);
  if (conDatos.length && !reemplazar) {
    throw new Error(
      `La base de destino ya tiene datos (${conDatos.map(([t, n]) => `${t}: ${n}`).join(', ')}). ` +
      'Para reemplazarlos usa --reemplazar --confirmar; antes se hace una copia de seguridad automática.'
    );
  }

  // Regla de oro: nunca se sobrescribe información sin una copia previa.
  let respaldoPrevio = null;
  if (conDatos.length) respaldoPrevio = await crearRespaldo(c, { carpeta, etiqueta: 'previo-restauracion' });

  await crearTablas(c);
  await crearIndices(c);
  await ajustarColumnas(c);
  await corregirClavesForaneas(c);

  const porNombre = Object.fromEntries(cabecera.tablas.map(t => [t.nombre, t]));
  await c.query('BEGIN');
  try {
    await c.query(`TRUNCATE ${cabecera.tablas.map(t => `"${t.nombre}"`).join(', ')} RESTART IDENTITY`);

    let tabla = null;
    let lote = [];
    let pesoLote = 0;
    const volcar = (destino, filas) => (destino && filas.length ? insertarLote(c, destino, filas) : Promise.resolve());

    for await (const linea of leerLineas(archivo)) {
      const objeto = JSON.parse(linea);
      if (objeto.t === 'cabecera' || objeto.t === 'fin') continue;

      // Cada vez que cambia la tabla se vacía el lote anterior; el estado se reinicia antes de esperar al servidor.
      if (porNombre[objeto.t] !== tabla) {
        const anterior = { destino: tabla, filas: lote };
        tabla = porNombre[objeto.t];
        lote = [];
        pesoLote = 0;
        await volcar(anterior.destino, anterior.filas);
      }

      lote.push(objeto.f);
      pesoLote += pesoDeFila(objeto.f);
      if (lote.length >= Math.max(1, Math.floor(PARAMETROS_POR_INSERT / tabla.columnas.length)) || pesoLote >= BYTES_POR_INSERT) {
        const llenas = lote;
        lote = [];
        pesoLote = 0;
        await volcar(tabla, llenas);
      }
    }
    await volcar(tabla, lote);

    for (const t of cabecera.tablas) {
      if (!t.columnas.some(k => k.nombre === 'id')) continue;
      await c.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM "${t.nombre}"), 0) + 1, false)
          WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL`,
        [`"${t.nombre}"`]
      );
    }

    const despues = await contarFilasDestino(c, cabecera.tablas);
    for (const t of cabecera.tablas) {
      if (despues[t.nombre] !== t.filas) throw new Error(`Tras restaurar, ${t.nombre} tiene ${despues[t.nombre]} filas y debería tener ${t.filas}`);
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK').catch(() => { /* la conexión ya se perdió */ });
    throw err;
  }

  const endurecimiento = await endurecerEsquema(c);
  const total = cabecera.tablas.reduce((suma, t) => suma + t.filas, 0);
  return { tablas: cabecera.tablas.map(({ nombre, filas }) => ({ nombre, filas })), totalFilas: total, respaldoPrevio, endurecimiento };
}

// Borra los respaldos más antiguos de una etiqueta y conserva los N más recientes; solo actúa si se pide.
function rotarRespaldos(carpeta, etiqueta, conservar) {
  if (!fs.existsSync(carpeta)) return [];
  const archivos = fs.readdirSync(carpeta)
    .filter(n => n.startsWith(`${etiqueta}_`) && n.endsWith('.json.gz'))
    .sort()
    .reverse();
  const sobrantes = archivos.slice(Math.max(1, conservar));
  sobrantes.forEach(n => fs.rmSync(path.join(carpeta, n), { force: true }));
  return sobrantes;
}

module.exports = {
  FORMATO, TABLAS_EXCLUIDAS, listarTablas, describirTabla, crearRespaldo, verificarRespaldo, restaurarRespaldo, rotarRespaldos, leerLineas
};
