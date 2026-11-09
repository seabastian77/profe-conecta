process.env.NODE_ENV = 'test';

const hayBase = Boolean(process.env.DATABASE_URL);
const describeSiHayBase = hayBase ? describe : describe.skip;

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const bcrypt = require('bcrypt');
const { crearBaseTemporal, huellas } = require('./basesTemporales');
const {
  crearTablas, crearIndices, ajustarColumnas, corregirClavesForaneas, endurecerEsquema
} = require('../src/config/esquema');
const { crearRespaldo, verificarRespaldo, restaurarRespaldo, rotarRespaldos, listarTablas } = require('../scripts/lib/respaldo');
const { ejecutarDiagnostico, COMPROBACIONES } = require('../scripts/lib/diagnostico');
const { planificarReparaciones, aplicarReparaciones, fechaReal } = require('../scripts/lib/reparaciones');
const { leerArgumentos, resolverUrl, describirDestino, esConexionLocal, marcaDeTiempo } = require('../scripts/lib/comun');

const HASH_FALSO = `$2b$04$${'a'.repeat(53)}`;
const ESQUEMA_COMPLETO = async (c) => {
  await crearTablas(c);
  await crearIndices(c);
  await ajustarColumnas(c);
  await corregirClavesForaneas(c);
};

// Inserta una fila y devuelve su id.
const insertar = async (c, sql, params) => (await c.query(`${sql} RETURNING id`, params)).rows[0].id;

// Carga datos variados, con los casos incómodos para un respaldo: comillas, saltos de línea, emojis, nulos y textos muy largos.
async function sembrarDatosVariados(c) {
  const admin = await insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ('Ada','Admin','ada@amigo.edu.co',$1,'admin')", [HASH_FALSO]);
  const docente = await insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ($1,$2,'doc@amigo.edu.co',$3,'docente')", ['Mónica "La Profe"', "O'Brien \\ Peña\ncon salto\ty tab 🔔", HASH_FALSO]);
  const est1 = await insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ('Ñandú','Pérez','est1@amigo.edu.co',NULL,'estudiante')", []);
  const est2 = await insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol, google_id, activo) VALUES ('Zoé','Ruiz','est2@amigo.edu.co',NULL,'estudiante','g-123',0)", []);

  await c.query("INSERT INTO perfiles_estudiante (usuario_id, documento, programa, semestre, promedio) VALUES ($1,'1001','Sistemas','4',3.85), ($2,'1002',NULL,NULL,NULL)", [est1, est2]);
  const perfilDocente = await insertar(c, "INSERT INTO perfiles_docente (usuario_id, cedula, facultad) VALUES ($1,'2001','Ingeniería')", [docente]);
  const materia = await insertar(c, "INSERT INTO asignaturas (nombre, area, programa) VALUES ('Cálculo I','Ciencias Básicas','Matemáticas')", []);
  await c.query('INSERT INTO docente_asignaturas (docente_id, asignatura_id) VALUES ($1,$2)', [perfilDocente, materia]);
  await c.query("INSERT INTO docente_horarios (docente_id, dia, hora_inicio, hora_fin) VALUES ($1,'Lunes','08:00','10:00')", [perfilDocente]);
  await c.query("INSERT INTO docente_programas (docente_id, programa) VALUES ($1,'Sistemas')", [perfilDocente]);

  await c.query(
    `INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, modalidad, estado, observaciones) VALUES
      ($1,$2,'Cálculo I','2027-03-01','08:00','Virtual','pendiente',NULL),
      ($1,$2,'Cálculo I','2027-03-02','09:00','Presencial','confirmada','Trae "calculadora"'),
      ($3,$2,'Cálculo I','2027-03-03','10:00','Híbrida','cancelada','')`, [est1, docente, est2]);
  await c.query("INSERT INTO notificaciones (usuario_id, icono, titulo, descripcion, leida) VALUES ($1,'📚','Hola ñ','línea 1\nlínea 2',1), ($1,'🔔','Otra',NULL,0)", [est1]);
  await c.query("INSERT INTO asignaciones (estudiante_id, docente_id) VALUES ($1,$2)", [est1, docente]);
  await c.query("INSERT INTO periodos (nombre, inicio, fin, estado) VALUES ('2027-1','2027-02-01','2027-06-01','activo')");
  await c.query("INSERT INTO configuracion (clave, valor) VALUES ('RN_MAX_ESTUDIANTES','15'), ('RN_PROMEDIO_MINIMO','3.0'), ('RN_HORAS_CANCELACION','24'), ('RN_MINUTOS_SESION','15')");
  await c.query("INSERT INTO auditoria (usuario_id, evento, detalle) VALUES ($1,'LOGIN','ok'), (NULL,'SISTEMA','sin usuario')", [est1]);
  await c.query("INSERT INTO historial_notificaciones (destinatario, tipo, asunto, mensaje, cantidad, enviado_por) VALUES ('todos','info','Asunto','Mensaje',3,$1)", [admin]);
  await c.query("INSERT INTO clases_admin (docente_id, estudiante_id, asignatura, fecha, hora, programado_por) VALUES ($1,$2,'Cálculo I','2027-04-01','11:00',$3)", [docente, est1, admin]);
  await c.query("INSERT INTO fotos_usuario (usuario_id, foto_perfil, foto_portada) VALUES ($1,$2,NULL)", [est1, 'data:image/png;base64,' + 'QUJD'.repeat(150000)]);
  return { admin, docente, est1, est2 };
}

// Escribe un archivo de respaldo a mano, con su huella correcta, para probar cabeceras manipuladas.
function escribirRespaldoManual(archivo, lineas, { huellaFalsa } = {}) {
  const texto = lineas.map(l => JSON.stringify(l) + '\n').join('');
  const huella = huellaFalsa || crypto.createHash('sha256').update(texto).digest('hex');
  fs.writeFileSync(archivo, zlib.gzipSync(texto + JSON.stringify({ t: 'fin', sha256: huella }) + '\n'));
}

describeSiHayBase('Respaldo y restauración', () => {
  let origen, destino, carpeta, respaldo, ids;

  beforeAll(async () => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldos-prueba-'));
    origen = await crearBaseTemporal('cp_resp_origen');
    await ESQUEMA_COMPLETO(origen.cliente);
    ids = await sembrarDatosVariados(origen.cliente);
    await endurecerEsquema(origen.cliente);
    respaldo = await crearRespaldo(origen.cliente, { carpeta, etiqueta: 'prueba' });
    destino = await crearBaseTemporal('cp_resp_destino');
  });

  afterAll(async () => {
    await origen.cerrar();
    await destino.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  });

  test('el respaldo incluye todas las tablas en orden de dependencias y deja fuera los intentos de login', async () => {
    const nombres = respaldo.tablas.map(t => t.nombre);
    expect(nombres).not.toContain('intentos_login');
    expect(nombres.indexOf('usuarios')).toBeLessThan(nombres.indexOf('tutorias'));
    expect(nombres.indexOf('perfiles_docente')).toBeLessThan(nombres.indexOf('docente_asignaturas'));
    expect(nombres.indexOf('asignaturas')).toBeLessThan(nombres.indexOf('docente_asignaturas'));
    expect(respaldo.totalFilas).toBe(respaldo.tablas.reduce((s, t) => s + t.filas, 0));
    expect(await listarTablas(origen.cliente)).toEqual(nombres);
  });

  test('el archivo se verifica solo y queda con permisos privados', async () => {
    const verificado = await verificarRespaldo(respaldo.archivo);
    expect(verificado.sha256).toBe(respaldo.sha256);
    expect(verificado.conteo.usuarios).toBe(4);
    if (process.platform !== 'win32') expect(fs.statSync(respaldo.archivo).mode & 0o777).toBe(0o600);
  });

  test('restaurar en una base vacía deja cada tabla idéntica, con comillas, saltos de línea, emojis, nulos y textos largos', async () => {
    const resultado = await restaurarRespaldo(destino.cliente, respaldo.archivo, { carpeta });
    expect(resultado.respaldoPrevio).toBeNull();
    expect(resultado.totalFilas).toBe(respaldo.totalFilas);
    expect(await huellas(destino.cliente)).toEqual(await huellas(origen.cliente));

    const { rows } = await destino.cliente.query('SELECT nombres, apellidos FROM usuarios WHERE id = $1', [ids.docente]);
    expect(rows[0]).toEqual({ nombres: 'Mónica "La Profe"', apellidos: "O'Brien \\ Peña\ncon salto\ty tab 🔔" });
  });

  test('tras restaurar, las secuencias siguen después del último id y los índices únicos existen', async () => {
    const nuevo = await insertar(destino.cliente, "INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('Nueva','Persona','nueva@amigo.edu.co','estudiante')", []);
    expect(nuevo).toBe(Math.max(...Object.values(ids)) + 1);
    const { rows } = await destino.cliente.query("SELECT indexname FROM pg_indexes WHERE indexname = 'uq_usuarios_correo_minuscula'");
    expect(rows).toHaveLength(1);
    await destino.cliente.query('DELETE FROM usuarios WHERE id = $1', [nuevo]);
  });

  test('no restaura sobre una base con datos si no se pide reemplazar, y no la toca', async () => {
    const antes = await huellas(destino.cliente);
    await expect(restaurarRespaldo(destino.cliente, respaldo.archivo, { carpeta })).rejects.toThrow(/ya tiene datos/);
    expect(await huellas(destino.cliente)).toEqual(antes);
  });

  test('al reemplazar guarda primero una copia de lo que había y luego deja la base igual al respaldo', async () => {
    await destino.cliente.query("UPDATE usuarios SET nombres = 'Cambiado' WHERE id = $1", [ids.admin]);
    await destino.cliente.query("INSERT INTO usuarios (nombres, apellidos, correo, rol) VALUES ('Extra','Fila','extra@amigo.edu.co','estudiante')");
    const modificada = await huellas(destino.cliente);

    const resultado = await restaurarRespaldo(destino.cliente, respaldo.archivo, { reemplazar: true, carpeta });
    expect(await huellas(destino.cliente)).toEqual(await huellas(origen.cliente));

    // La copia previa conserva exactamente el estado anterior: restaurarla en otra base lo reproduce.
    expect(path.basename(resultado.respaldoPrevio.archivo)).toMatch(/^previo-restauracion_/);
    const otra = await crearBaseTemporal('cp_resp_previa');
    try {
      await restaurarRespaldo(otra.cliente, resultado.respaldoPrevio.archivo, { carpeta });
      expect(await huellas(otra.cliente)).toEqual(modificada);
    } finally {
      await otra.cerrar();
    }
  });

  test('si la restauración falla a medias, la base queda exactamente como estaba', async () => {
    const sucia = await crearBaseTemporal('cp_resp_sucia');
    try {
      await ESQUEMA_COMPLETO(sucia.cliente);
      const { docente, est1 } = await sembrarDatosVariados(sucia.cliente);
      await sucia.cliente.query("INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'X','2027-09-01','08:00','inventado')", [est1, docente]);
      const conProblema = await crearRespaldo(sucia.cliente, { carpeta, etiqueta: 'problema' });

      const antes = await huellas(destino.cliente);
      await expect(restaurarRespaldo(destino.cliente, conProblema.archivo, { reemplazar: true, carpeta })).rejects.toThrow(/tutorias_estado_check/);
      expect(await huellas(destino.cliente)).toEqual(antes);
    } finally {
      await sucia.cerrar();
    }
  });

  describe('Archivos dañados o manipulados', () => {
    test('un archivo que no existe, vacío o que no es un respaldo se rechaza con un mensaje claro', async () => {
      await expect(verificarRespaldo(path.join(carpeta, 'no-existe.json.gz'))).rejects.toThrow(/No existe/);
      const vacio = path.join(carpeta, 'vacio.json.gz');
      fs.writeFileSync(vacio, zlib.gzipSync(''));
      await expect(verificarRespaldo(vacio)).rejects.toThrow(/vacío o no es un respaldo/);
      const basura = path.join(carpeta, 'basura.json.gz');
      fs.writeFileSync(basura, 'esto no está comprimido');
      await expect(verificarRespaldo(basura)).rejects.toThrow(/dañado o incompleto/);
    });

    test('un archivo cortado a la mitad se detecta', async () => {
      const bytes = fs.readFileSync(respaldo.archivo);
      const cortado = path.join(carpeta, 'cortado.json.gz');
      fs.writeFileSync(cortado, bytes.subarray(0, Math.floor(bytes.length / 2)));
      await expect(verificarRespaldo(cortado)).rejects.toThrow(/dañado o incompleto/);
    });

    test('cambiar un solo dato dentro del respaldo cambia la huella y se rechaza', async () => {
      const texto = zlib.gunzipSync(fs.readFileSync(respaldo.archivo)).toString('utf8');
      const alterado = texto.replace('"Ñandú"', '"Ñandu"');
      expect(alterado).not.toBe(texto);
      const archivo = path.join(carpeta, 'alterado.json.gz');
      fs.writeFileSync(archivo, zlib.gzipSync(alterado));
      await expect(verificarRespaldo(archivo)).rejects.toThrow(/huella no coincide/);
    });

    test('un respaldo sin el cierre (copia interrumpida) se rechaza', async () => {
      const texto = zlib.gunzipSync(fs.readFileSync(respaldo.archivo)).toString('utf8');
      const sinCierre = texto.split('\n').filter(l => l && !l.includes('"t":"fin"')).join('\n') + '\n';
      const archivo = path.join(carpeta, 'sin-cierre.json.gz');
      fs.writeFileSync(archivo, zlib.gzipSync(sinCierre));
      await expect(verificarRespaldo(archivo)).rejects.toThrow(/falta el cierre/);
    });

    test('una cabecera con SQL escondido en un nombre de columna o de tipo no se acepta aunque la huella sea correcta', async () => {
      const base = { t: 'cabecera', formato: 1, app: 'conectaprofe', creado: new Date().toISOString(), base: 'x', servidor: 'x', zona: 'x', omitidas: [] };
      const casos = [
        [{ nombre: 'usuarios', filas: 1, columnas: [{ nombre: 'id"; DROP TABLE usuarios; --', tipo: 'integer' }] }, /nombre o tipo no admitido/],
        [{ nombre: 'usuarios', filas: 1, columnas: [{ nombre: 'id', tipo: 'integer); DROP TABLE usuarios; --' }] }, /nombre o tipo no admitido/],
        [{ nombre: 'usuarios"; DROP TABLE x; --', filas: 1, columnas: [{ nombre: 'id', tipo: 'integer' }] }, /tabla con datos no válidos/]
      ];
      for (const [i, [tabla, mensaje]] of casos.entries()) {
        const archivo = path.join(carpeta, `inyeccion-${i}.json.gz`);
        escribirRespaldoManual(archivo, [{ ...base, tablas: [tabla] }, { t: tabla.nombre, f: ['1'] }]);
        await expect(verificarRespaldo(archivo)).rejects.toThrow(mensaje);
      }
    });

    test('un respaldo de otra aplicación o de otro formato se rechaza', async () => {
      const archivo = path.join(carpeta, 'otra-app.json.gz');
      escribirRespaldoManual(archivo, [{ t: 'cabecera', formato: 99, app: 'otra', tablas: [] }]);
      await expect(verificarRespaldo(archivo)).rejects.toThrow(/no es un respaldo de ConectaProfe/);
    });

    test('filas de más o de menos respecto a la cabecera se detectan', async () => {
      const cabecera = { t: 'cabecera', formato: 1, app: 'conectaprofe', creado: new Date().toISOString(), base: 'x', servidor: 'x', zona: 'x', omitidas: [],
        tablas: [{ nombre: 'configuracion', filas: 2, columnas: [{ nombre: 'clave', tipo: 'text' }, { nombre: 'valor', tipo: 'text' }] }] };
      const archivo = path.join(carpeta, 'faltan-filas.json.gz');
      escribirRespaldoManual(archivo, [cabecera, { t: 'configuracion', f: ['A', '1'] }]);
      await expect(verificarRespaldo(archivo)).rejects.toThrow(/configuracion trae 1 filas y debería traer 2/);
    });
  });

  test('rotar deja los N respaldos más recientes de una etiqueta y no toca otras', () => {
    const rotacion = fs.mkdtempSync(path.join(os.tmpdir(), 'rotacion-'));
    try {
      for (const n of ['a_20260101_000000', 'a_20260102_000000', 'a_20260103_000000', 'b_20260101_000000']) fs.writeFileSync(path.join(rotacion, `${n}.json.gz`), 'x');
      const borrados = rotarRespaldos(rotacion, 'a', 2);
      expect(borrados).toEqual(['a_20260101_000000.json.gz']);
      expect(fs.readdirSync(rotacion).sort((x, y) => x.localeCompare(y))).toEqual(['a_20260102_000000.json.gz', 'a_20260103_000000.json.gz', 'b_20260101_000000.json.gz']);
      expect(rotarRespaldos(rotacion, 'a', 0)).toEqual(['a_20260102_000000.json.gz']);
    } finally {
      fs.rmSync(rotacion, { recursive: true, force: true });
    }
  });
});

describeSiHayBase('Diagnóstico de la base', () => {
  let limpia, sucia;

  beforeAll(async () => {
    limpia = await crearBaseTemporal('cp_diag_limpia');
    await ESQUEMA_COMPLETO(limpia.cliente);
    await sembrarDatosVariados(limpia.cliente);
    await endurecerEsquema(limpia.cliente);

    sucia = await crearBaseTemporal('cp_diag_sucia');
    await ESQUEMA_COMPLETO(sucia.cliente);
  });

  afterAll(async () => {
    await limpia.cerrar();
    await sucia.cerrar();
  });

  const porId = (resultado, id) => resultado.resultados.find(r => r.id === id);

  test('una base sana no tiene errores y todas las comprobaciones corren', async () => {
    const r = await ejecutarDiagnostico(limpia.cliente, { carpetaRespaldos: os.tmpdir() + '/no-existe-nunca' });
    expect(r.resultados).toHaveLength(COMPROBACIONES.length);
    expect(r.resultados.filter(x => x.falla).map(x => `${x.id}: ${x.falla}`)).toEqual([]);
    expect(r.resumen.error).toBe(0);
    expect(porId(r, 'claves-foraneas').nivel).toBe('ok');
    expect(porId(r, 'protecciones-faltantes').nivel).toBe('ok');
    expect(porId(r, 'huerfanos').nivel).toBe('ok');
  });

  test('es de solo lectura: no cambia ni una fila', async () => {
    const antes = await huellas(limpia.cliente);
    await ejecutarDiagnostico(limpia.cliente, { profundo: true });
    expect(await huellas(limpia.cliente)).toEqual(antes);
  });

  test('detecta duplicados, valores inválidos, fechas imposibles y contraseñas sin cifrar en una base con problemas', async () => {
    const c = sucia.cliente;
    const u = (correo, rol, contrasena = HASH_FALSO) => insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ('N','A',$1,$2,$3)", [correo, contrasena, rol]);
    const docente = await u('d@amigo.edu.co', 'docente');
    const e1 = await u('e1@amigo.edu.co', 'estudiante');
    const e2 = await u('e2@amigo.edu.co', 'estudiante', 'contraseña en texto plano');
    await u('Dup@amigo.edu.co', 'estudiante');
    await u('dup@amigo.edu.co', 'estudiante');
    await u('sin-credencial@amigo.edu.co', 'estudiante', null);
    await c.query("INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'X','2027-05-05','10:00','pendiente'), ($3,$2,'X','2027-05-05','10:00','pendiente'), ($1,$2,'X','2027-02-31','09:00','pendiente'), ($1,$2,'X','mañana','25:99','pendiente'), ($1,$2,'X','2027-13-45','09:00','cancelada')", [e1, docente, e2]);
    await c.query("INSERT INTO perfiles_estudiante (usuario_id, documento, promedio) VALUES ($1,'777',9), ($2,'777',3)", [e1, e2]);

    const r = await ejecutarDiagnostico(c, { carpetaRespaldos: os.tmpdir() + '/no-existe-nunca' });
    expect(r.resultados.filter(x => x.falla).map(x => `${x.id}: ${x.falla}`)).toEqual([]);

    expect(porId(r, 'duplicados-uq_usuarios_correo_minuscula')).toMatchObject({ nivel: 'error', total: 1 });
    expect(porId(r, 'duplicados-uq_tutorias_docente_horario')).toMatchObject({ nivel: 'error', total: 1 });
    expect(porId(r, 'duplicados-uq_perfiles_estudiante_documento')).toMatchObject({ nivel: 'error', total: 1 });
    expect(porId(r, 'valores-tutorias_fecha_check').nivel).toBe('error');
    expect(porId(r, 'valores-perfiles_estudiante_promedio_check')).toMatchObject({ nivel: 'error', total: 1 });
    expect(porId(r, 'fechas-imposibles')).toMatchObject({ nivel: 'aviso', total: 1 });
    expect(porId(r, 'contrasenas-sin-cifrar')).toMatchObject({ nivel: 'error', total: 1 });
    expect(porId(r, 'sin-credencial')).toMatchObject({ nivel: 'aviso', total: 1 });
    expect(porId(r, 'sin-administrador').nivel).toBe('error');
    expect(porId(r, 'protecciones-faltantes').total).toBeGreaterThanOrEqual(5);
    expect(r.resumen.error).toBeGreaterThanOrEqual(6);
  });

  test('con --profundo encuentra las cuentas que usan la contraseña publicada, y sin él no las busca', async () => {
    const c = limpia.cliente;
    const hash = await bcrypt.hash('123456', 4);
    const id = await insertar(c, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ('Demo','Cuenta','demo@amigo.edu.co',$1,'estudiante')", [hash]);

    expect(porId(await ejecutarDiagnostico(c), 'contrasenas-publicas').nivel).toBe('omitida');
    const profundo = porId(await ejecutarDiagnostico(c, { profundo: true }), 'contrasenas-publicas');
    expect(profundo.nivel).toBe('aviso');
    expect(profundo.muestra.map(f => f.id)).toEqual([id]);
    await c.query('DELETE FROM usuarios WHERE id = $1', [id]);
  });

  test('avisa si no hay respaldo reciente y deja de avisar cuando existe uno', async () => {
    const carpetaRespaldos = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-respaldos-'));
    try {
      expect(porId(await ejecutarDiagnostico(limpia.cliente, { carpetaRespaldos }), 'respaldo-reciente').nivel).toBe('aviso');
      await crearRespaldo(limpia.cliente, { carpeta: carpetaRespaldos });
      expect(porId(await ejecutarDiagnostico(limpia.cliente, { carpetaRespaldos }), 'respaldo-reciente').nivel).toBe('ok');
    } finally {
      fs.rmSync(carpetaRespaldos, { recursive: true, force: true });
    }
  });
});

describeSiHayBase('Reparación guiada de datos', () => {
  let base, carpeta, c, datos;

  // Prepara una base con los problemas típicos: tutorías repetidas, fechas inválidas, asignaciones y documentos repetidos.
  async function prepararBaseConProblemas() {
    const b = await crearBaseTemporal('cp_rep');
    await ESQUEMA_COMPLETO(b.cliente);
    const k = b.cliente;
    const u = (correo, rol) => insertar(k, "INSERT INTO usuarios (nombres, apellidos, correo, contrasena, rol) VALUES ('N','A',$1,$2,$3)", [correo, HASH_FALSO, rol]);
    const docente = await u('d@amigo.edu.co', 'docente');
    const otroDocente = await u('d2@amigo.edu.co', 'docente');
    const e1 = await u('e1@amigo.edu.co', 'estudiante');
    const e2 = await u('e2@amigo.edu.co', 'estudiante');
    const e3 = await u('e3@amigo.edu.co', 'estudiante');
    const tutoria = (est, doc, fecha, hora, estado) => insertar(k, "INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'Cálculo',$3,$4,$5)", [est, doc, fecha, hora, estado]);

    const t = {};
    t.conservada = await tutoria(e1, docente, '2027-06-01', '10:00', 'confirmada');
    t.repetidaDocente = await tutoria(e2, docente, '2027-06-01', '10:00', 'pendiente');
    t.repetidaHoraLarga = await tutoria(e3, docente, '2027-06-01', '10:00:00', 'pendiente');
    t.estudiante1 = await tutoria(e1, otroDocente, '2027-07-01', '08:00', 'pendiente');
    t.repetidaEstudiante = await tutoria(e1, docente, '2027-07-01', '08:00', 'pendiente');
    t.completadaA = await tutoria(e2, otroDocente, '2027-01-10', '09:00', 'completada');
    t.completadaB = await tutoria(e3, otroDocente, '2027-01-10', '09:00', 'completada');
    t.fechaFormato = await tutoria(e1, docente, 'mañana', '25:99', 'pendiente');
    t.fechaImposible = await tutoria(e2, docente, '2027-02-31', '09:00', 'confirmada');
    t.canceladaYaExistente = await tutoria(e1, docente, '2027-06-01', '10:00', 'cancelada');
    t.valida = await tutoria(e3, otroDocente, '2027-08-01', '15:30', 'pendiente');

    await k.query("INSERT INTO asignaciones (estudiante_id, docente_id, estado) VALUES ($1,$2,'activa'), ($1,$2,'activa'), ($3,$2,'activa')", [e1, docente, e2]);
    await k.query("INSERT INTO perfiles_estudiante (usuario_id, documento) VALUES ($1,'555'), ($2,'555'), ($3,'999')", [e1, e2, e3]);
    return { b, datos: { docente, otroDocente, e1, e2, e3, t } };
  }

  beforeAll(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'reparacion-'));
  });
  afterAll(() => fs.rmSync(carpeta, { recursive: true, force: true }));

  beforeEach(async () => {
    ({ b: base, datos } = await prepararBaseConProblemas());
    c = base.cliente;
  });
  afterEach(() => base.cerrar());

  const tutoriaDe = async (id) => (await c.query('SELECT estado, observaciones FROM tutorias WHERE id = $1', [id])).rows[0];
  const cuenta = async (sql, params = []) => Number((await c.query(sql, params)).rows[0].n);

  test('el plan elige qué conservar y qué cancelar, y deja para decisión humana lo que no puede resolver solo', async () => {
    const plan = await planificarReparaciones(c);

    expect(plan.acciones.map(a => a.reparacion).sort((x, y) => x.localeCompare(y))).toEqual([
      'asignaciones-repetidas', 'tutorias-invalidas', 'tutorias-invalidas', 'tutorias-repetidas', 'tutorias-repetidas', 'tutorias-repetidas'
    ]);
    expect(plan.acciones.map(a => a.resumen).join('\n')).toMatch(/Cancelar la tutoría #\d+ de Cálculo .*repetía la tutoría #/);
    expect(plan.manuales.map(m => m.id)).toEqual(expect.arrayContaining(['tutorias-completadas-repetidas', 'uq_perfiles_estudiante_documento']));
    expect(plan.manuales.find(m => m.id === 'uq_perfiles_estudiante_documento').ayuda).toMatch(/--limpiar-documentos/);
  });

  test('planificar no modifica nada', async () => {
    const antes = await huellas(c);
    await planificarReparaciones(c, { limpiarDocumentos: true });
    expect(await huellas(c)).toEqual(antes);
  });

  test('al aplicar cancela solo lo planificado, avisa a las personas, deja auditoría y crea una copia previa', async () => {
    const { t, e1, e2, e3 } = datos;
    const plan = await planificarReparaciones(c);
    const antes = await huellas(c);
    const resultado = await aplicarReparaciones(c, plan, { carpeta });

    expect(resultado.aplicadas).toBe(6);
    expect(resultado.omitidas).toBe(0);
    expect(path.basename(resultado.respaldo.archivo)).toMatch(/^previo-reparacion_/);

    // Se conserva la de mejor estado y menor id; las repetidas quedan canceladas con su motivo.
    expect((await tutoriaDe(t.conservada)).estado).toBe('confirmada');
    for (const id of [t.repetidaDocente, t.repetidaHoraLarga]) {
      const fila = await tutoriaDe(id);
      expect(fila.estado).toBe('cancelada');
      expect(fila.observaciones).toContain(`repetía la tutoría #${t.conservada}`);
    }
    expect((await tutoriaDe(t.estudiante1)).estado).toBe('pendiente');
    expect((await tutoriaDe(t.repetidaEstudiante)).estado).toBe('cancelada');
    expect((await tutoriaDe(t.fechaFormato)).estado).toBe('cancelada');
    expect((await tutoriaDe(t.fechaImposible)).estado).toBe('cancelada');

    // Lo completado, lo ya cancelado y lo válido no se toca.
    expect((await tutoriaDe(t.completadaA)).estado).toBe('completada');
    expect((await tutoriaDe(t.completadaB)).estado).toBe('completada');
    expect(await tutoriaDe(t.canceladaYaExistente)).toEqual({ estado: 'cancelada', observaciones: null });
    expect(await tutoriaDe(t.valida)).toEqual({ estado: 'pendiente', observaciones: null });

    // Nada se borró: la misma cantidad de filas en todas las tablas salvo avisos y auditoría.
    const despues = await huellas(c);
    for (const tabla of Object.keys(antes)) {
      if (!['notificaciones', 'auditoria', 'tutorias', 'asignaciones'].includes(tabla)) expect(despues[tabla]).toBe(antes[tabla]);
    }
    expect(despues.tutorias.split(':')[0]).toBe(antes.tutorias.split(':')[0]);

    expect(await cuenta("SELECT COUNT(*) AS n FROM notificaciones WHERE titulo = 'Tutoría cancelada por una revisión de datos'")).toBe(10);
    expect(await cuenta("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = $1 AND titulo LIKE 'Tutoría cancelada%'", [e2])).toBeGreaterThanOrEqual(2);
    expect(await cuenta("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = $1", [e3])).toBeGreaterThanOrEqual(1);
    expect(await cuenta("SELECT COUNT(*) AS n FROM asignaciones WHERE estudiante_id = $1 AND estado = 'activa'", [e1])).toBe(1);
    expect(await cuenta("SELECT COUNT(*) AS n FROM asignaciones WHERE estado = 'removida'")).toBe(1);

    const auditoria = (await c.query("SELECT detalle FROM auditoria WHERE evento = 'REPARACION_DATOS'")).rows;
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0].detalle).toMatch(/tutorias-repetidas=3.*tutorias-invalidas=2.*asignaciones-repetidas=1/);
  });

  test('después de aplicar no quedan cambios pendientes y las protecciones que sí se pueden crear se crean', async () => {
    const resultado = await aplicarReparaciones(c, await planificarReparaciones(c), { carpeta });
    expect(resultado.endurecimiento.fallidos).toBe(0);
    expect(resultado.endurecimiento.creados).toBeGreaterThanOrEqual(5);
    // Quedan los casos manuales (dos completadas iguales y los documentos repetidos), así que esos índices siguen pendientes.
    expect(resultado.endurecimiento.omitidos).toBeGreaterThanOrEqual(2);

    const indices = (await c.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE 'uq_%'")).rows.map(r => r.indexname);
    expect(indices).toEqual(expect.arrayContaining(['uq_asignaciones_activa', 'uq_tutorias_estudiante_horario', 'uq_usuarios_correo_minuscula']));
    expect(indices).not.toContain('uq_tutorias_docente_horario');
    expect((await c.query("SELECT 1 FROM pg_constraint WHERE conname = 'tutorias_fecha_check'")).rowCount).toBe(1);

    const verificacion = await planificarReparaciones(c);
    expect(verificacion.acciones).toEqual([]);
    expect(verificacion.manuales.map(m => m.id)).toEqual(expect.arrayContaining(['tutorias-completadas-repetidas']));
  });

  test('es reversible: restaurar la copia previa reproduce los datos tal como estaban antes de reparar', async () => {
    const antes = await huellas(c);
    const resultado = await aplicarReparaciones(c, await planificarReparaciones(c), { carpeta });
    expect(await huellas(c)).not.toEqual(antes);

    const otra = await crearBaseTemporal('cp_rep_restaurada');
    try {
      await restaurarRespaldo(otra.cliente, resultado.respaldo.archivo, { carpeta });
      expect(await huellas(otra.cliente)).toEqual(antes);
    } finally {
      await otra.cerrar();
    }
  });

  test('si algo falla en medio de la reparación no queda ningún cambio a medias', async () => {
    const { e3 } = datos;
    await c.query(`
      CREATE FUNCTION rechazar_aviso() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'aviso rechazado para la prueba'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER rechazar_aviso BEFORE INSERT ON notificaciones FOR EACH ROW WHEN (NEW.usuario_id = ${e3}) EXECUTE FUNCTION rechazar_aviso();`);
    const plan = await planificarReparaciones(c);
    const antes = await huellas(c);

    await expect(aplicarReparaciones(c, plan, { carpeta })).rejects.toThrow(/aviso rechazado/);
    expect(await huellas(c)).toEqual(antes);
  });

  test('si una tutoría cambió entre el plan y la aplicación, esa acción se omite sin avisar a nadie', async () => {
    const { t } = datos;
    const plan = await planificarReparaciones(c);
    await c.query("UPDATE tutorias SET estado = 'cancelada' WHERE id = $1", [t.repetidaDocente]);

    const resultado = await aplicarReparaciones(c, plan, { carpeta });
    expect(resultado.omitidas).toBe(1);
    expect(resultado.aplicadas).toBe(5);
    expect(await cuenta("SELECT COUNT(*) AS n FROM notificaciones WHERE titulo LIKE 'Tutoría cancelada%'")).toBe(8);
  });

  test('con notificar apagado no se crea ningún aviso', async () => {
    await aplicarReparaciones(c, await planificarReparaciones(c, { notificar: false }), { carpeta });
    expect(await cuenta('SELECT COUNT(*) AS n FROM notificaciones')).toBe(0);
  });

  test('sin cambios pendientes no se crea copia ni se escribe nada', async () => {
    await aplicarReparaciones(c, await planificarReparaciones(c), { carpeta });
    const antes = await huellas(c);
    const archivosAntes = fs.readdirSync(carpeta).length;

    const plan = await planificarReparaciones(c);
    expect(plan.acciones).toEqual([]);
    expect(await aplicarReparaciones(c, plan, { carpeta })).toEqual({ aplicadas: 0, omitidas: 0, respaldo: null });
    expect(await huellas(c)).toEqual(antes);
    expect(fs.readdirSync(carpeta)).toHaveLength(archivosAntes);
  });

  test('documentos repetidos: solo se tocan con permiso explícito, se conserva el más antiguo y queda constancia del valor anterior', async () => {
    const { e1, e2 } = datos;
    const sinPermiso = await planificarReparaciones(c);
    expect(sinPermiso.acciones.some(a => a.reparacion === 'documentos-repetidos')).toBe(false);

    const plan = await planificarReparaciones(c, { limpiarDocumentos: true });
    expect(plan.manuales.map(m => m.id)).not.toContain('uq_perfiles_estudiante_documento');
    const resultado = await aplicarReparaciones(c, plan, { carpeta });

    expect((await c.query('SELECT documento FROM perfiles_estudiante WHERE usuario_id = $1', [e1])).rows[0].documento).toBe('555');
    expect((await c.query('SELECT documento FROM perfiles_estudiante WHERE usuario_id = $1', [e2])).rows[0].documento).toBeNull();
    expect((await c.query("SELECT detalle FROM auditoria WHERE evento = 'REPARACION_DATOS' AND usuario_id = $1", [e2])).rows[0].detalle).toContain('documento 555');
    expect(await cuenta("SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = $1 AND titulo = 'Actualiza tu documento'", [e2])).toBe(1);
    expect((await c.query("SELECT 1 FROM pg_indexes WHERE indexname = 'uq_perfiles_estudiante_documento'")).rowCount).toBe(1);
    expect(resultado.aplicadas).toBe(7);
  });

  test('fechaReal distingue fechas del calendario de textos con forma de fecha', () => {
    expect(fechaReal('2027-12-31')).toBe(true);
    expect(fechaReal('2028-02-29')).toBe(true);
    expect(fechaReal('2027-02-29')).toBe(false);
    expect(fechaReal('2027-02-31')).toBe(false);
    expect(fechaReal('2027-13-45')).toBe(false);
    expect(fechaReal('mañana')).toBe(false);
  });
});

describe('Utilidades de los scripts', () => {
  test('leerArgumentos separa banderas, opciones con valor y argumentos sueltos', () => {
    expect(leerArgumentos(['archivo.gz', '--solo-verificar', '--url=postgresql://u@h/db', '--conservar=5'])).toEqual({
      _: ['archivo.gz'], 'solo-verificar': true, url: 'postgresql://u@h/db', conservar: '5'
    });
  });

  test('resolverUrl prioriza --url, usa la pública de Railway cuando la interna no se alcanza y cae en DATABASE_URL', () => {
    const interna = 'postgresql://u:p@postgres.railway.internal:5432/railway';
    const publica = 'postgresql://u:p@viaduct.proxy.rlwy.net:1234/railway';
    expect(resolverUrl({ url: 'postgresql://x@h/db' }, { DATABASE_URL: interna })).toBe('postgresql://x@h/db');
    expect(resolverUrl({}, { DATABASE_URL: interna, DATABASE_PUBLIC_URL: publica })).toBe(publica);
    expect(resolverUrl({}, { DATABASE_URL: 'postgresql://u@localhost/db', DATABASE_PUBLIC_URL: publica })).toBe('postgresql://u@localhost/db');
    expect(resolverUrl({}, {})).toBe('');
  });

  test('describirDestino nunca muestra la contraseña', () => {
    const texto = describirDestino('postgresql://postgres:SuperSecreta@viaduct.proxy.rlwy.net:1234/railway');
    expect(texto).toBe('viaduct.proxy.rlwy.net:1234/railway');
    expect(texto).not.toContain('SuperSecreta');
    expect(describirDestino('postgresql://postgres@localhost:5433/cp?host=/tmp')).toBe('/tmp/cp');
    expect(describirDestino('esto no es una url')).toMatch(/no válida/);
  });

  test('esConexionLocal reconoce socket, localhost y la red interna de Railway', () => {
    expect(esConexionLocal('postgresql://u@localhost:5432/db')).toBe(true);
    expect(esConexionLocal('postgresql://u@h/db?host=/tmp')).toBe(true);
    expect(esConexionLocal('postgresql://u@postgres.railway.internal:5432/db')).toBe(true);
    expect(esConexionLocal('postgresql://u@viaduct.proxy.rlwy.net:1234/db')).toBe(false);
  });

  test('marcaDeTiempo da un nombre ordenable por fecha', () => {
    expect(marcaDeTiempo(new Date(2026, 10, 4, 2, 57, 5))).toBe('20261104_025705');
  });
});

describeSiHayBase('Comandos de mantenimiento (como los ejecuta Sebas)', () => {
  let origen, destino, carpeta;

  const correr = (script, args = [], entorno = {}) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', script), ...args], {
      env: { ...process.env, ...entorno }, encoding: 'utf8', timeout: 120000
    });
    return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
  };

  beforeAll(async () => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-respaldos-'));
    origen = await crearBaseTemporal('cp_cli_origen');
    await ESQUEMA_COMPLETO(origen.cliente);
    await sembrarDatosVariados(origen.cliente);
    await endurecerEsquema(origen.cliente);
    destino = await crearBaseTemporal('cp_cli_destino');
  });

  afterAll(async () => {
    await origen.cerrar();
    await destino.cerrar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  });

  test('db:respaldo crea el archivo, lo verifica y muestra el resumen sin exponer la contraseña', () => {
    const r = correr('respaldo.js', [`--url=${origen.url}`, `--carpeta=${carpeta}`, '--etiqueta=cli']);
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/Copia verificada/);
    expect(r.salida).toMatch(/usuarios\s+4 filas/);
    expect(fs.readdirSync(carpeta).filter(n => n.startsWith('cli_'))).toHaveLength(1);
  });

  test('db:restaurar --solo-verificar lee el respaldo sin conectarse a ninguna base', () => {
    const archivo = path.join(carpeta, fs.readdirSync(carpeta).find(n => n.startsWith('cli_')));
    const r = correr('restaurar.js', [archivo, '--solo-verificar'], { DATABASE_URL: 'postgresql://nadie@127.0.0.1:1/ninguna' });
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/completo y su huella coincide/);
  });

  test('db:restaurar --reemplazar sin --confirmar no hace nada y avisa', async () => {
    const archivo = path.join(carpeta, fs.readdirSync(carpeta).find(n => n.startsWith('cli_')));
    const r = correr('restaurar.js', [archivo, `--url=${destino.url}`, '--reemplazar']);
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/Falta --confirmar/);
    expect((await destino.cliente.query("SELECT to_regclass('usuarios') AS t")).rows[0].t).toBeNull();
  });

  test('db:restaurar carga el respaldo en una base vacía y queda igual al origen', async () => {
    const archivo = path.join(carpeta, fs.readdirSync(carpeta).find(n => n.startsWith('cli_')));
    const r = correr('restaurar.js', [archivo, `--url=${destino.url}`, `--carpeta=${carpeta}`]);
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/Restauración completa/);
    expect(r.salida).toMatch(/JWT_SECRET/);
    expect(await huellas(destino.cliente)).toEqual(await huellas(origen.cliente));
  });

  test('db:restaurar sobre una base con datos falla con un mensaje claro y no la modifica', async () => {
    const archivo = path.join(carpeta, fs.readdirSync(carpeta).find(n => n.startsWith('cli_')));
    const antes = await huellas(destino.cliente);
    const r = correr('restaurar.js', [archivo, `--url=${destino.url}`]);
    expect(r.codigo).toBe(2);
    expect(r.salida).toMatch(/ya tiene datos/);
    expect(await huellas(destino.cliente)).toEqual(antes);
  });

  test('db:diagnostico devuelve JSON válido y código 0 en una base sana', () => {
    const r = correr('diagnostico-bd.js', [`--url=${destino.url}`, '--json', '--sin-respaldo']);
    expect(r.codigo).toBe(0);
    const resultado = JSON.parse(r.salida);
    expect(resultado.resumen.error).toBe(0);
    expect(resultado.base).not.toMatch(/@/);
    expect(resultado.resultados.length).toBeGreaterThan(30);
  });

  test('db:diagnostico --sql imprime las consultas sin conectarse', () => {
    const r = correr('diagnostico-bd.js', ['--sql'], { DATABASE_URL: 'postgresql://nadie@127.0.0.1:1/ninguna' });
    expect(r.codigo).toBe(0);
    expect(r.salida).toMatch(/SELECT/);
    expect(r.salida).toMatch(/\[Integridad\]/);
  });

  test('db:diagnostico sale con código 1 cuando encuentra problemas de integridad', async () => {
    await destino.cliente.query("DELETE FROM usuarios WHERE rol = 'admin'");
    const r = correr('diagnostico-bd.js', [`--url=${destino.url}`, '--sin-respaldo']);
    expect(r.codigo).toBe(1);
    expect(r.salida).toMatch(/no hay administradores activos|Hay al menos un administrador activo/);
  });

  test('db:reparar solo simula; con --aplicar cambia, y repetirlo no encuentra nada más', async () => {
    const k = destino.cliente;
    const { rows: [{ id: docente }] } = await k.query("SELECT id FROM usuarios WHERE rol = 'docente' LIMIT 1");
    const { rows: [{ id: est }] } = await k.query("SELECT id FROM usuarios WHERE correo = 'est1@amigo.edu.co'");
    await k.query('DROP INDEX IF EXISTS uq_tutorias_docente_horario');
    await k.query('DROP INDEX IF EXISTS uq_tutorias_estudiante_horario');
    await k.query("INSERT INTO tutorias (estudiante_id, docente_id, asignatura, fecha, hora, estado) VALUES ($1,$2,'Cálculo I','2027-03-01','08:00','pendiente')", [est, docente]);

    const antes = await huellas(k);
    const simulacion = correr('reparar-datos.js', [`--url=${destino.url}`]);
    expect(simulacion.codigo).toBe(0);
    expect(simulacion.salida).toMatch(/solo simulación/);
    expect(simulacion.salida).toMatch(/Cancelar la tutoría/);
    expect(await huellas(k)).toEqual(antes);

    const aplicada = correr('reparar-datos.js', [`--url=${destino.url}`, '--aplicar', `--carpeta=${carpeta}`]);
    expect(aplicada.codigo).toBe(0);
    expect(aplicada.salida).toMatch(/Cambios aplicados: 1/);
    expect(aplicada.salida).toMatch(/Copia previa/);
    expect(aplicada.salida).toMatch(/no quedan cambios automáticos pendientes/);

    const repetida = correr('reparar-datos.js', [`--url=${destino.url}`]);
    expect(repetida.salida).toMatch(/No hay cambios automáticos pendientes/);
  });

  test('una URL inválida o una base inalcanzable termina con código 2 y un mensaje legible', () => {
    const r = correr('diagnostico-bd.js', ['--url=postgresql://nadie@127.0.0.1:1/ninguna']);
    expect(r.codigo).toBe(2);
    expect(r.salida).toMatch(/❌/);
    expect(r.salida).not.toMatch(/at .*\.js:\d+/);
  });
});
