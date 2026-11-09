// Auditoría de solo lectura de la base: integridad, calidad de datos, seguridad, rendimiento y mantenimiento.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { INDICES_UNICOS, RESTRICCIONES, CLAVES_FORANEAS } = require('../../src/config/esquema');
const { CARPETA_RESPALDOS } = require('./comun');

const MUESTRA = 5;
const DIAS_MAXIMOS_SIN_RESPALDO = 7;
const CLAVES_REGLAS = ['RN_PROMEDIO_MINIMO', 'RN_HORAS_CANCELACION', 'RN_MAX_ESTUDIANTES', 'RN_MINUTOS_SESION'];
const CONTRASENAS_PUBLICAS = ['123456'];

const FECHA_VALIDA = "'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'";
const HASH_BCRYPT = "'^\\$2[aby]\\$[0-9]{2}\\$.{53}$'";
// CASE garantiza que el número de rondas solo se lea en los hashes con formato bcrypt.
const RONDAS = `(CASE WHEN contrasena ~ ${HASH_BCRYPT} THEN substring(contrasena from 5 for 2)::int END)`;

// Define una comprobación cuyo resultado son las filas que incumplen la regla.
const regla = (id, area, titulo, nivel, sql, ayuda) => ({ id, area, titulo, nivel, sql, ayuda });

// Define una consulta informativa que siempre se muestra como dato.
const informe = (id, area, titulo, sql) => ({ id, area, titulo, nivel: 'info', informe: true, sql });

// Define una comprobación que se calcula en código y devuelve las filas que incumplen la regla.
const calculada = (id, area, titulo, nivel, ejecutar, ayuda, sql = null) => ({ id, area, titulo, nivel, ejecutar, ayuda, sql });

const COMPROBACIONES = [
  // ── Integridad ────────────────────────────────────────────────────────────────
  calculada('claves-foraneas', 'Integridad', 'Claves foráneas presentes y con la acción de borrado esperada', 'error', async (c) => {
    const { rows } = await c.query("SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f'");
    const actuales = new Map(rows.map(r => [r.conname, r.confdeltype]));
    return CLAVES_FORANEAS.flatMap(([tabla, columna, nombre, accion]) => {
      if (!actuales.has(nombre)) return [{ tabla, columna, problema: 'falta la clave foránea' }];
      const esperado = accion === 'CASCADE' ? 'c' : 'n';
      return actuales.get(nombre) === esperado ? [] : [{ tabla, columna, problema: `al borrar un usuario debería hacer ${accion}` }];
    });
  }, 'Reinicia la aplicación: la migración las corrige sola.', "SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f'"),

  calculada('huerfanos', 'Integridad', 'Registros que apuntan a un usuario o perfil que ya no existe', 'error', async (c) => {
    const { rows: claves } = await c.query(`
      SELECT k.conname, hija.relname AS tabla, ah.attname AS columna, padre.relname AS tabla_padre, ap.attname AS columna_padre
        FROM pg_constraint k
        JOIN pg_class hija  ON hija.oid  = k.conrelid
        JOIN pg_class padre ON padre.oid = k.confrelid
        JOIN pg_attribute ah ON ah.attrelid = k.conrelid  AND ah.attnum = k.conkey[1]
        JOIN pg_attribute ap ON ap.attrelid = k.confrelid AND ap.attnum = k.confkey[1]
       WHERE k.contype = 'f' AND array_length(k.conkey, 1) = 1
         AND hija.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`);
    const huerfanos = [];
    for (const k of claves) {
      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM "${k.tabla}" h WHERE h."${k.columna}" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "${k.tabla_padre}" p WHERE p."${k.columna_padre}" = h."${k.columna}")`);
      if (rows[0].n) huerfanos.push({ tabla: k.tabla, columna: k.columna, huerfanos: rows[0].n });
    }
    return huerfanos;
  }, 'Revisa los registros listados; no se borran solos.'),

  calculada('protecciones-faltantes', 'Integridad', 'Índices únicos y restricciones de integridad creados', 'aviso', async (c) => {
    const [{ rows: indices }, { rows: restricciones }] = await Promise.all([
      c.query('SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()'),
      c.query("SELECT conname FROM pg_constraint WHERE contype = 'c'")
    ]);
    const indicesActuales = new Set(indices.map(r => r.indexname));
    const restriccionesActuales = new Set(restricciones.map(r => r.conname));
    return [
      ...INDICES_UNICOS.filter(i => !indicesActuales.has(i.nombre)).map(i => ({ protección: i.nombre, motivo: i.motivo })),
      ...RESTRICCIONES.filter(([, nombre]) => !restriccionesActuales.has(nombre)).map(([tabla, nombre]) => ({ protección: nombre, motivo: `hay filas de ${tabla} que no la cumplen` }))
    ];
  }, 'Corrige los datos con «npm run db:reparar» y reinicia: la migración las crea cuando ya no hay conflictos.'),

  ...INDICES_UNICOS.map(i => regla(
    `duplicados-${i.nombre}`, 'Integridad', `Sin duplicados: ${i.motivo.replace(/^hay /, 'no ')}`, 'error',
    i.duplicados, 'Corrige o reasigna los casos; «npm run db:reparar» muestra qué se puede resolver sin perder datos.'
  )),

  ...RESTRICCIONES.map(([tabla, nombre, expresion]) => regla(
    `valores-${nombre}`, 'Integridad', `Valores válidos en ${tabla} (${nombre})`, 'error',
    `SELECT id FROM ${tabla} WHERE NOT (${expresion})`, 'Estas filas incumplen la regla; no se modifican solas.'
  )),

  calculada('fechas-imposibles', 'Integridad', 'Tutorías vigentes con fecha de formato correcto que no existe en el calendario (por ejemplo 2027-02-31)', 'aviso', async (c) => {
    const imposibles = [];
    // Una tutoría cancelada es historia: su fecha ya no afecta a nadie.
    for (const [tabla, vigente] of [['tutorias', "estado <> 'cancelada'"], ['clases_admin', 'TRUE']]) {
      const { rows } = await c.query(`SELECT DISTINCT fecha FROM ${tabla} WHERE ${vigente} AND fecha ~ ${FECHA_VALIDA}`);
      for (const { fecha } of rows) {
        const dia = new Date(`${fecha}T00:00:00Z`);
        if (Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== fecha) {
          const ids = await c.query(`SELECT id FROM ${tabla} WHERE ${vigente} AND fecha = $1 LIMIT 20`, [fecha]);
          ids.rows.forEach(f => imposibles.push({ tabla, id: f.id, fecha }));
        }
      }
    }
    return imposibles;
  }, 'Pide corregir la fecha a quien la registró o cancela la tutoría.'),

  // ── Calidad de los datos ──────────────────────────────────────────────────────
  regla('correos-invalidos', 'Calidad de datos', 'Todos los correos tienen formato válido', 'aviso',
    "SELECT id, correo FROM usuarios WHERE correo !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'",
    'Corrige el correo desde el panel de administración.'),

  regla('nombres-vacios', 'Calidad de datos', 'Todos los usuarios tienen nombres y apellidos', 'aviso',
    "SELECT id, correo FROM usuarios WHERE btrim(nombres) = '' OR btrim(apellidos) = ''",
    'Completa los datos desde el panel de administración.'),

  regla('perfil-faltante', 'Calidad de datos', 'Cada usuario tiene su perfil según el rol', 'info', `
    SELECT u.id, u.rol FROM usuarios u
     WHERE (u.rol = 'estudiante' AND NOT EXISTS (SELECT 1 FROM perfiles_estudiante p WHERE p.usuario_id = u.id))
        OR (u.rol = 'docente'    AND NOT EXISTS (SELECT 1 FROM perfiles_docente    p WHERE p.usuario_id = u.id))
        OR (u.rol = 'admin'      AND NOT EXISTS (SELECT 1 FROM perfiles_admin      p WHERE p.usuario_id = u.id))`,
    'El perfil se crea cuando la persona lo guarda por primera vez.'),

  regla('docentes-sin-materias', 'Calidad de datos', 'Todo docente activo ofrece al menos una asignatura', 'info', `
    SELECT u.id, u.correo FROM usuarios u
     WHERE u.rol = 'docente' AND u.activo = 1
       AND NOT EXISTS (SELECT 1 FROM perfiles_docente p JOIN docente_asignaturas da ON da.docente_id = p.id WHERE p.usuario_id = u.id)`,
    'Sin asignaturas no aparece al agendar tutorías.'),

  regla('roles-cruzados', 'Calidad de datos', 'Estudiante y docente de cada tutoría, asignación y clase tienen el rol que corresponde', 'aviso', `
    SELECT 'tutorias' AS tabla, t.id, 'el estudiante ya no tiene rol estudiante' AS problema FROM tutorias t JOIN usuarios u ON u.id = t.estudiante_id WHERE u.rol <> 'estudiante'
    UNION ALL SELECT 'tutorias', t.id, 'el docente ya no tiene rol docente' FROM tutorias t JOIN usuarios u ON u.id = t.docente_id WHERE u.rol <> 'docente'
    UNION ALL SELECT 'asignaciones', a.id, 'el estudiante ya no tiene rol estudiante' FROM asignaciones a JOIN usuarios u ON u.id = a.estudiante_id WHERE u.rol <> 'estudiante'
    UNION ALL SELECT 'asignaciones', a.id, 'el docente ya no tiene rol docente' FROM asignaciones a JOIN usuarios u ON u.id = a.docente_id WHERE u.rol <> 'docente'
    UNION ALL SELECT 'clases_admin', k.id, 'el estudiante ya no tiene rol estudiante' FROM clases_admin k JOIN usuarios u ON u.id = k.estudiante_id WHERE u.rol <> 'estudiante'
    UNION ALL SELECT 'clases_admin', k.id, 'el docente ya no tiene rol docente' FROM clases_admin k JOIN usuarios u ON u.id = k.docente_id WHERE u.rol <> 'docente'`,
    'Suele ocurrir cuando un administrador cambió el rol de la persona después de la tutoría; no es corrupción.'),

  regla('cupo-excedido', 'Calidad de datos', 'Ningún docente supera el máximo de estudiantes asignados', 'aviso', `
    SELECT a.docente_id, COUNT(*)::int AS activas
      FROM asignaciones a WHERE a.estado = 'activa'
     GROUP BY a.docente_id
    HAVING COUNT(*) > COALESCE((SELECT CASE WHEN valor ~ '^[0-9]+$' THEN valor::int END FROM configuracion WHERE clave = 'RN_MAX_ESTUDIANTES'), 15)`,
    'Remueve asignaciones desde el panel de administración.'),

  regla('periodo-activo', 'Calidad de datos', 'Hay exactamente un período académico activo', 'aviso',
    "SELECT COUNT(*)::int AS periodos_activos FROM periodos WHERE estado = 'activo' HAVING COUNT(*) <> 1",
    'Activa o cierra períodos desde el panel de administración.'),

  calculada('configuracion', 'Calidad de datos', 'Las reglas de negocio están configuradas con valores numéricos', 'aviso', async (c) => {
    const { rows } = await c.query('SELECT clave, valor FROM configuracion');
    const valores = new Map(rows.map(r => [r.clave, r.valor]));
    return CLAVES_REGLAS.flatMap(clave => {
      if (!valores.has(clave)) return [{ clave, problema: 'no existe (se usa el valor por defecto)' }];
      return Number.isFinite(Number(valores.get(clave))) && valores.get(clave) !== '' ? [] : [{ clave, problema: `«${valores.get(clave)}» no es un número` }];
    });
  }, 'Guarda la configuración desde el panel de administración.', 'SELECT clave, valor FROM configuracion'),

  regla('tutorias-completadas-futuras', 'Calidad de datos', 'Ninguna tutoría futura figura como completada', 'aviso',
    "SELECT id, fecha, hora FROM tutorias WHERE estado = 'completada' AND fecha > to_char(NOW(), 'YYYY-MM-DD')",
    'El flujo de demostración permite marcarlas; en uso real conviene revisarlas.'),

  informe('tutorias-vencidas', 'Calidad de datos', 'Tutorías pendientes o confirmadas con fecha ya pasada (sin cerrar)',
    "SELECT estado, COUNT(*)::int AS cantidad FROM tutorias WHERE estado IN ('pendiente', 'confirmada') AND fecha < to_char(NOW(), 'YYYY-MM-DD') GROUP BY estado"),

  regla('sin-administrador', 'Calidad de datos', 'Hay al menos un administrador activo', 'error',
    "SELECT 'no hay administradores activos' AS problema WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE rol = 'admin' AND activo = 1)",
    'Define ADMIN_INICIAL_CORREO y ADMIN_INICIAL_CONTRASENA y reinicia.'),

  // ── Seguridad ─────────────────────────────────────────────────────────────────
  regla('contrasenas-sin-cifrar', 'Seguridad', 'Todas las contraseñas están guardadas como hash bcrypt', 'error',
    `SELECT id, correo FROM usuarios WHERE contrasena IS NOT NULL AND contrasena !~ ${HASH_BCRYPT}`,
    'Una contraseña sin cifrar es un riesgo grave: restablécela desde el panel.'),

  regla('rondas-bcrypt-bajas', 'Seguridad', 'Ningún hash usa menos de 10 rondas de bcrypt', 'aviso',
    `SELECT id, correo, ${RONDAS} AS rondas FROM usuarios WHERE ${RONDAS} < 10`,
    'Pide a esas personas que cambien su contraseña.'),

  informe('costos-bcrypt', 'Seguridad', 'Rondas de bcrypt por cuenta (la aplicación usa 12; las cuentas de ejemplo, 10)',
    `SELECT ${RONDAS} AS rondas, COUNT(*)::int AS cuentas FROM usuarios WHERE ${RONDAS} IS NOT NULL GROUP BY 1 ORDER BY 1`),

  regla('sin-credencial', 'Seguridad', 'Toda cuenta puede iniciar sesión (tiene contraseña o Google)', 'aviso',
    'SELECT id, correo FROM usuarios WHERE contrasena IS NULL AND google_id IS NULL',
    'Restablece la contraseña desde el panel de administración.'),

  calculada('contrasenas-publicas', 'Seguridad', 'Ninguna cuenta usa una contraseña publicada en la documentación (solo con --profundo)', 'aviso', async (c, contexto) => {
    if (!contexto.profundo) return null;
    const { rows } = await c.query(
      `SELECT id, correo, contrasena FROM usuarios WHERE ${RONDAS} <= 10 ORDER BY id LIMIT 200`);
    const expuestas = [];
    for (const u of rows) {
      for (const clave of CONTRASENAS_PUBLICAS) {
        if (await bcrypt.compare(clave, u.contrasena)) { expuestas.push({ id: u.id, correo: u.correo }); break; }
      }
    }
    return expuestas;
  }, 'Cambia la contraseña de esas cuentas o desactívalas; si son de ejemplo, no deberían existir en producción.'),

  regla('intentos-sin-purgar', 'Seguridad', 'La tabla de intentos de login no guarda IPs de más de un día', 'aviso',
    "SELECT COUNT(*)::int AS intentos_viejos FROM intentos_login WHERE creado_en < NOW() - INTERVAL '2 days' HAVING COUNT(*) > 0",
    'El servidor purga esta tabla cada hora; si quedan registros, el servidor no ha estado corriendo.'),

  informe('fotos', 'Seguridad', 'Fotos guardadas en la base (en base64) y su peso',
    `SELECT COUNT(*)::int AS usuarios_con_foto,
            pg_size_pretty(COALESCE(SUM(COALESCE(length(foto_perfil), 0) + COALESCE(length(foto_portada), 0)), 0)::bigint) AS peso_total
       FROM fotos_usuario WHERE foto_perfil IS NOT NULL OR foto_portada IS NOT NULL`),

  // ── Rendimiento y escalabilidad ───────────────────────────────────────────────
  informe('tamano-tablas', 'Rendimiento', 'Tablas: filas aproximadas y tamaño en disco',
    `SELECT relname AS tabla, n_live_tup AS filas_aprox, pg_size_pretty(pg_total_relation_size(relid)) AS tamano
       FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`),

  regla('fk-sin-indice', 'Rendimiento', 'Toda clave foránea tiene un índice que acelera los borrados y las uniones', 'aviso', `
    SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
       AND c.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
       AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])`,
    'Crea un índice sobre esa columna.'),

  regla('indices-duplicados', 'Rendimiento', 'No hay índices repetidos sobre las mismas columnas', 'aviso', `
    SELECT i.indrelid::regclass::text AS tabla, array_agg(i.indexrelid::regclass::text ORDER BY i.indexrelid) AS indices
      FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid
     WHERE t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
     GROUP BY i.indrelid, i.indkey::text, i.indclass::text, COALESCE(i.indexprs::text, ''), COALESCE(i.indpred::text, '')
    HAVING COUNT(*) > 1`,
    'Borra uno de los dos: cada índice extra enlentece las escrituras.'),

  informe('indices-sin-uso', 'Rendimiento', 'Índices que no se han usado desde el último reinicio de estadísticas (solo orientativo)', `
    SELECT s.relname AS tabla, s.indexrelname AS indice, pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamano
      FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
     WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
     ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 10`),

  regla('espacio-muerto', 'Rendimiento', 'Las tablas no acumulan filas muertas pendientes de limpiar', 'aviso', `
    SELECT relname AS tabla, n_live_tup AS vivas, n_dead_tup AS muertas FROM pg_stat_user_tables
     WHERE n_dead_tup > 1000 AND n_dead_tup > 0.2 * GREATEST(n_live_tup, 1)`,
    'Ejecuta VACUUM ANALYZE sobre esas tablas.'),

  regla('auditoria-creciendo', 'Rendimiento', 'La auditoría activa no supera 50 000 eventos', 'aviso',
    'SELECT COUNT(*)::int AS eventos_activos FROM auditoria WHERE archivada = 0 HAVING COUNT(*) > 50000',
    'Archiva los eventos antiguos desde el panel de administración.'),

  informe('base', 'Rendimiento', 'Base de datos: versión, tamaño, zona horaria y conexiones', `
    SELECT split_part(version(), ' on ', 1) AS version, pg_size_pretty(pg_database_size(current_database())) AS tamano,
           current_setting('TimeZone') AS zona_horaria, current_setting('max_connections') AS max_conexiones,
           (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS conexiones_ahora`),

  informe('cache', 'Rendimiento', 'Porcentaje de lecturas servidas desde la memoria (por encima de 95 % es sano)',
    `SELECT round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 1) AS porcentaje_en_memoria
       FROM pg_stat_database WHERE datname = current_database()`),

  // ── Mantenimiento ─────────────────────────────────────────────────────────────
  calculada('respaldo-reciente', 'Mantenimiento', `Hay un respaldo de menos de ${DIAS_MAXIMOS_SIN_RESPALDO} días en la carpeta de respaldos`, 'aviso', async (c, contexto) => {
    const carpeta = contexto.carpetaRespaldos || CARPETA_RESPALDOS;
    const archivos = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter(n => n.endsWith('.json.gz')) : [];
    if (!archivos.length) return [{ problema: 'no hay respaldos en esta carpeta (si los guardas en otro equipo, ignora este aviso)' }];
    const reciente = Math.max(...archivos.map(n => fs.statSync(path.join(carpeta, n)).mtimeMs));
    const dias = (Date.now() - reciente) / 86400000;
    return dias > DIAS_MAXIMOS_SIN_RESPALDO ? [{ problema: `el último respaldo tiene ${Math.floor(dias)} días` }] : [];
  }, 'Ejecuta «npm run db:respaldo».')
];

// Corre las comprobaciones en una sesión de solo lectura y devuelve el resultado de cada una.
async function ejecutarDiagnostico(c, { profundo = false, carpetaRespaldos } = {}) {
  const contexto = { profundo, carpetaRespaldos };
  const resultados = [];

  await c.query('BEGIN READ ONLY');
  try {
    await c.query("SET LOCAL TIME ZONE 'America/Bogota'");

    for (const comprobacion of COMPROBACIONES) {
      const base = { id: comprobacion.id, area: comprobacion.area, titulo: comprobacion.titulo, ayuda: comprobacion.ayuda || null };
      await c.query('SAVEPOINT comprobacion');
      try {
        let filas;
        if (comprobacion.ejecutar) {
          filas = await comprobacion.ejecutar(c, contexto);
        } else {
          filas = (await c.query(comprobacion.sql)).rows;
        }
        await c.query('RELEASE SAVEPOINT comprobacion');

        if (filas === null) {
          resultados.push({ ...base, nivel: 'omitida', total: 0, muestra: [] });
        } else if (comprobacion.informe) {
          resultados.push({ ...base, nivel: 'info', informe: true, total: filas.length, muestra: filas });
        } else {
          resultados.push({ ...base, nivel: filas.length ? comprobacion.nivel : 'ok', total: filas.length, muestra: filas.slice(0, MUESTRA) });
        }
      } catch (err) {
        await c.query('ROLLBACK TO SAVEPOINT comprobacion');
        resultados.push({ ...base, nivel: 'aviso', total: 0, muestra: [], falla: err.message });
      }
    }
  } finally {
    await c.query('ROLLBACK');
  }

  const resumen = { ok: 0, info: 0, aviso: 0, error: 0, omitida: 0 };
  resultados.forEach(r => { resumen[r.nivel]++; });
  return { resultados, resumen };
}

module.exports = { COMPROBACIONES, ejecutarDiagnostico };
