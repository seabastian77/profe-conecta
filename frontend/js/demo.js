var DEMO = {
  USUARIOS: "cp_demo.usuarios",
  PERFILES: "cp_demo.perfiles",
  FOTOS: "cp_demo.fotos",
  TUTORIAS: "cp_demo.tutorias",
  NOTIFICACIONES: "cp_demo.notificaciones",
  ID_COUNTER: "cp_demo.id_counter",
};

// ── Utilidades internas ─────────────────────────────────
function _leer(clave, defecto) {
  var raw = localStorage.getItem(clave);
  if (!raw) return defecto;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return defecto;
  }
}

function _guardar(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
}

function _nuevoId() {
  var actual = parseInt(localStorage.getItem(DEMO.ID_COUNTER) || "0") + 1;
  localStorage.setItem(DEMO.ID_COUNTER, actual);
  return actual;
}

// Token falso — solo para demo, el backend real usa JWT firmado
function _generarTokenDemo(usuario) {
  var payload = btoa(
    JSON.stringify({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
    }),
  );
  return "DEMO." + payload;
}

function _decodificarTokenDemo(token) {
  if (!token || !token.startsWith("DEMO.")) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    return null;
  }
}

// Simular un pequeño delay de red para que se vea realista
function _esperar(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms || 150);
  });
}

// ── Datos de ejemplo al iniciar demo por primera vez ────
function _inicializarDatosDemo() {
  // Marcador de versión: si los datos viejos existen pero son de una versión
  // anterior, los limpiamos para usar la estructura enriquecida nueva.
  var VERSION_DATOS = "v3";
  var versionActual = localStorage.getItem("cp_demo.version");
  if (versionActual !== VERSION_DATOS) {
    Object.values(DEMO).forEach(function (clave) {
      localStorage.removeItem(clave);
    });
    localStorage.setItem("cp_demo.version", VERSION_DATOS);
  }

  var usuarios = _leer(DEMO.USUARIOS, null);
  if (usuarios) return; // ya hay datos

  var ahora = new Date().toISOString();
  var hace2h = new Date(Date.now() - 2 * 3600000).toISOString();
  var hace5h = new Date(Date.now() - 5 * 3600000).toISOString();
  var hace1d = new Date(Date.now() - 24 * 3600000).toISOString();
  var hace3d = new Date(Date.now() - 3 * 24 * 3600000).toISOString();

  // IDs principales (para cuentas de login)
  var idDoc = _nuevoId();
  var idEst = _nuevoId();
  var idAdm = _nuevoId();

  // Docentes adicionales
  var idDoc2 = _nuevoId();
  var idDoc3 = _nuevoId();

  // Estudiantes adicionales (algunos en alerta)
  var idEst2 = _nuevoId();
  var idEst3 = _nuevoId();
  var idEst4 = _nuevoId();
  var idEst5 = _nuevoId();
  var idEst6 = _nuevoId();

  var usuariosDemo = [
    {
      id: idDoc,
      nombres: "Carlos",
      apellidos: "Restrepo",
      rol: "docente",
      correo: "carlos.restrepo@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace2h,
    },
    {
      id: idEst,
      nombres: "Valentina",
      apellidos: "López",
      rol: "estudiante",
      correo: "valentina.lopez@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace2h,
    },
    {
      id: idAdm,
      nombres: "Admin",
      apellidos: "Sistema",
      rol: "admin",
      correo: "admin@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: ahora,
    },
    {
      id: idDoc2,
      nombres: "Lina María",
      apellidos: "Montoya",
      rol: "docente",
      correo: "lina.montoya@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace5h,
    },
    {
      id: idDoc3,
      nombres: "Sandra Milena",
      apellidos: "Ríos",
      rol: "docente",
      correo: "sandra.rios@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace1d,
    },
    {
      id: idEst2,
      nombres: "Carlos Andrés",
      apellidos: "Martínez",
      rol: "estudiante",
      correo: "carlos.martinez@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace2h,
    },
    {
      id: idEst3,
      nombres: "Laura",
      apellidos: "González",
      rol: "estudiante",
      correo: "laura.gonzalez@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace1d,
    },
    {
      id: idEst4,
      nombres: "Andrés Felipe",
      apellidos: "Ríos",
      rol: "estudiante",
      correo: "andres.rios@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace5h,
    },
    {
      id: idEst5,
      nombres: "María Camila",
      apellidos: "Pérez",
      rol: "estudiante",
      correo: "maria.perez@amigo.edu.co",
      contrasena: "12345678",
      activo: true,
      ultimo_acceso: hace3d,
    },
    {
      id: idEst6,
      nombres: "Juan David",
      apellidos: "Ospina",
      rol: "estudiante",
      correo: "juan.ospina@amigo.edu.co",
      contrasena: "12345678",
      activo: false,
      ultimo_acceso: hace3d,
    },
  ];
  _guardar(DEMO.USUARIOS, usuariosDemo);

  var perfiles = {};
  // Docentes
  perfiles[idDoc] = {
    tipo: "docente",
    cedula: "10234567",
    codigo_docente: "DOC-2023-001",
    facultad: "Facultad de Ingeniería",
    telefono: "3001234567",
    asignaturas: ["Programación", "Bases de Datos", "Ing. de Software"],
  };
  perfiles[idDoc2] = {
    tipo: "docente",
    cedula: "43987654",
    codigo_docente: "DOC-2023-002",
    facultad: "Facultad de Ingeniería",
    telefono: "3009876543",
    asignaturas: ["Cálculo", "Álgebra", "Física"],
  };
  perfiles[idDoc3] = {
    tipo: "docente",
    cedula: "32145678",
    codigo_docente: "DOC-2023-003",
    facultad: "Facultad de Ciencias Sociales",
    telefono: "3012345678",
    asignaturas: ["Psicología", "Comunicación", "Estadística"],
  };

  // Estudiantes — con variedad de promedios (algunos en alerta)
  perfiles[idEst] = {
    tipo: "estudiante",
    codigo: "2024001234",
    documento: "1002345678",
    programa: "Ingeniería de Software",
    semestre: "4",
    telefono: "3009876543",
    promedio: 3.8,
    en_alerta: false,
  };
  perfiles[idEst2] = {
    tipo: "estudiante",
    codigo: "2024001235",
    documento: "1002345679",
    programa: "Ingeniería de Software",
    semestre: "5",
    telefono: "3001111111",
    promedio: 2.8, // EN ALERTA
    en_alerta: true,
  };
  perfiles[idEst3] = {
    tipo: "estudiante",
    codigo: "2024001236",
    documento: "1002345680",
    programa: "Administración de Empresas",
    semestre: "3",
    telefono: "3002222222",
    promedio: 2.6, // EN ALERTA
    en_alerta: true,
  };
  perfiles[idEst4] = {
    tipo: "estudiante",
    codigo: "2024001237",
    documento: "1002345681",
    programa: "Psicología",
    semestre: "6",
    telefono: "3003333333",
    promedio: 2.7, // EN ALERTA
    en_alerta: true,
  };
  perfiles[idEst5] = {
    tipo: "estudiante",
    codigo: "2024001238",
    documento: "1002345682",
    programa: "Trabajo Social",
    semestre: "2",
    telefono: "3004444444",
    promedio: 4.2,
    en_alerta: false,
  };
  perfiles[idEst6] = {
    tipo: "estudiante",
    codigo: "2024001239",
    documento: "1002345683",
    programa: "Derecho",
    semestre: "7",
    telefono: "3005555555",
    promedio: 3.5,
    en_alerta: false,
  };

  // Admin
  perfiles[idAdm] = {
    tipo: "admin",
    cedula: "71234567",
    cargo: "Coordinador de Tutorías",
    dependencia: "Vicerrectoría Académica",
    telefono: "6042345678",
  };
  _guardar(DEMO.PERFILES, perfiles);

  var hoy = new Date();
  function fechaRel(dias) {
    var d = new Date(hoy);
    d.setDate(hoy.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  var tutorias = [
    // Tutorías de Valentina con Carlos
    {
      id: _nuevoId(),
      estudiante_id: idEst,
      docente_id: idDoc,
      asignatura: "Programación",
      modalidad: "Virtual",
      fecha: fechaRel(3),
      hora: "14:00:00",
      estado: "pendiente",
      observaciones: "Refuerzo de POO",
      nombre_docente: "Carlos Restrepo",
      nombre_estudiante: "Valentina López",
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      estudiante_id: idEst,
      docente_id: idDoc,
      asignatura: "Bases de Datos",
      modalidad: "Presencial",
      fecha: fechaRel(-5),
      hora: "10:00:00",
      estado: "completada",
      observaciones: "Consultas SQL avanzadas",
      nombre_docente: "Carlos Restrepo",
      nombre_estudiante: "Valentina López",
      creada_en: hace3d,
    },
    // Tutorías de estudiantes en alerta
    {
      id: _nuevoId(),
      estudiante_id: idEst2,
      docente_id: idDoc,
      asignatura: "Programación",
      modalidad: "Presencial",
      fecha: fechaRel(2),
      hora: "09:00:00",
      estado: "pendiente",
      observaciones: "Reforzar algoritmos básicos",
      nombre_docente: "Carlos Restrepo",
      nombre_estudiante: "Carlos Andrés Martínez",
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      estudiante_id: idEst3,
      docente_id: idDoc2,
      asignatura: "Cálculo",
      modalidad: "Virtual",
      fecha: fechaRel(1),
      hora: "16:00:00",
      estado: "pendiente",
      observaciones: "Derivadas parciales",
      nombre_docente: "Lina María Montoya",
      nombre_estudiante: "Laura González",
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      estudiante_id: idEst4,
      docente_id: idDoc3,
      asignatura: "Psicología",
      modalidad: "Presencial",
      fecha: fechaRel(4),
      hora: "11:00:00",
      estado: "pendiente",
      observaciones: "Seguimiento académico",
      nombre_docente: "Sandra Milena Ríos",
      nombre_estudiante: "Andrés Felipe Ríos",
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      estudiante_id: idEst2,
      docente_id: idDoc,
      asignatura: "Bases de Datos",
      modalidad: "Virtual",
      fecha: fechaRel(-10),
      hora: "15:00:00",
      estado: "completada",
      observaciones: "Modelado ER",
      nombre_docente: "Carlos Restrepo",
      nombre_estudiante: "Carlos Andrés Martínez",
      creada_en: hace3d,
    },
  ];
  _guardar(DEMO.TUTORIAS, tutorias);

  var notifs = [
    {
      id: _nuevoId(),
      usuario_id: idEst,
      icono: "📅",
      titulo: "Tutoría programada",
      descripcion: "Programación el " + fechaRel(3) + " a las 14:00",
      leida: false,
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      usuario_id: idDoc,
      icono: "📅",
      titulo: "Nueva tutoría asignada",
      descripcion: "Sesión de Programación con Valentina López",
      leida: false,
      creada_en: ahora,
    },
    {
      id: _nuevoId(),
      usuario_id: idAdm,
      icono: "⚠️",
      titulo: "3 nuevas alertas académicas",
      descripcion: "Hay 3 estudiantes con promedio inferior a 3.0",
      leida: false,
      creada_en: hace2h,
    },
  ];
  _guardar(DEMO.NOTIFICACIONES, notifs);
}

// ── Router del modo demo ────────────────────────────────
// Recibe (ruta, metodo, cuerpo, tokenActual) y retorna la respuesta simulada
async function llamarAPIDemo(ruta, metodo, cuerpo, tokenActual) {
  await _esperar(120);

  _inicializarDatosDemo();

  var payload = _decodificarTokenDemo(tokenActual);
  var usuarios = _leer(DEMO.USUARIOS, []);
  var perfiles = _leer(DEMO.PERFILES, {});
  var tutorias = _leer(DEMO.TUTORIAS, []);
  var notifs = _leer(DEMO.NOTIFICACIONES, []);

  // ── AUTH ──────────────────────────────────────────────

  // POST /auth/registro
  if (ruta === "/auth/registro" && metodo === "POST") {
    var { nombres, apellidos, correo, contrasena, rol } = cuerpo;
    if (
      usuarios.find(function (u) {
        return u.correo === correo;
      })
    ) {
      throw { mensaje: "Ya existe una cuenta con ese correo" };
    }
    var nuevoUser = {
      id: _nuevoId(),
      nombres,
      apellidos,
      correo,
      contrasena,
      rol,
      activo: true,
    };
    usuarios.push(nuevoUser);
    _guardar(DEMO.USUARIOS, usuarios);
    var token = _generarTokenDemo(nuevoUser);
    return {
      mensaje: "Cuenta creada. Completa tu perfil.",
      token,
      usuario: { id: nuevoUser.id, nombres, apellidos, correo, rol },
    };
  }

  // POST /auth/login
  if (ruta === "/auth/login" && metodo === "POST") {
    var { correo: c, contrasena: p } = cuerpo;
    var user = usuarios.find(function (u) {
      return u.correo === c;
    });
    if (!user || user.contrasena !== p) {
      throw { status: 401, mensaje: "Correo o contraseña incorrectos" };
    }
    var tok = _generarTokenDemo(user);
    return {
      token: tok,
      usuario: {
        id: user.id,
        nombres: user.nombres,
        apellidos: user.apellidos,
        correo: user.correo,
        rol: user.rol,
      },
    };
  }

  // POST /auth/recuperar
  if (ruta === "/auth/recuperar" && metodo === "POST") {
    return {
      mensaje: "Si el correo existe, recibirás el enlace pronto. (Modo demo)",
    };
  }

  // GET /auth/yo
  if (ruta === "/auth/yo" && metodo === "GET") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var yo = usuarios.find(function (u) {
      return u.id === payload.id;
    });
    if (!yo) throw { status: 401, mensaje: "Usuario no encontrado" };
    return {
      id: yo.id,
      nombres: yo.nombres,
      apellidos: yo.apellidos,
      correo: yo.correo,
      rol: yo.rol,
    };
  }

  // ── PERFIL ────────────────────────────────────────────

  // GET /perfil
  if (ruta === "/perfil" && metodo === "GET") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var u = usuarios.find(function (u) {
      return u.id === payload.id;
    });
    if (!u) throw { status: 404, mensaje: "No encontrado" };
    var fotos = _leer(DEMO.FOTOS, {})[payload.id] || {};
    return {
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      correo: u.correo,
      rol: u.rol,
      perfil: perfiles[payload.id] || null,
      fotos: fotos,
    };
  }

  // POST /perfil/estudiante
  if (ruta === "/perfil/estudiante" && metodo === "POST") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var { codigo, documento, programa, semestre, telefono, promedio } = cuerpo;
    if (!codigo || !documento || !programa || !semestre) {
      throw { mensaje: "Faltan datos obligatorios" };
    }
    var prom = parseFloat(promedio) || 0;
        perfiles[payload.id] = {
      tipo: "estudiante",
      codigo,
      documento,
      programa,
      semestre,
      telefono: telefono || "",
      promedio: prom,
    };
    _guardar(DEMO.PERFILES, perfiles);
    return { mensaje: "Perfil guardado" };
  }

  // POST /perfil/docente
  if (ruta === "/perfil/docente" && metodo === "POST") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var {
      cedula,
      codigo_docente,
      facultad,
      telefono: tel,
      asignaturas,
    } = cuerpo;
    if (!cedula || !facultad) throw { mensaje: "Faltan datos obligatorios" };
    perfiles[payload.id] = {
      tipo: "docente",
      cedula,
      codigo_docente: codigo_docente || "",
      facultad,
      telefono: tel || "",
      asignaturas: asignaturas || [],
    };
    _guardar(DEMO.PERFILES, perfiles);
    return { mensaje: "Perfil guardado" };
  }

  // POST /perfil/admin
  if (ruta === "/perfil/admin" && metodo === "POST") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var { cedula: ced, cargo, dependencia, telefono: telf } = cuerpo;
    if (!ced || !cargo) throw { mensaje: "Faltan datos obligatorios" };
    perfiles[payload.id] = {
      tipo: "admin",
      cedula: ced,
      cargo,
      dependencia: dependencia || "",
      telefono: telf || "",
    };
    _guardar(DEMO.PERFILES, perfiles);
    return { mensaje: "Perfil guardado" };
  }

  // POST /perfil/foto
  if (ruta === "/perfil/foto" && metodo === "POST") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var todasFotos = _leer(DEMO.FOTOS, {});
    if (!todasFotos[payload.id]) todasFotos[payload.id] = {};
    var campo = cuerpo.tipo === "portada" ? "foto_portada" : "foto_perfil";
    todasFotos[payload.id][campo] = cuerpo.foto_base64;
    _guardar(DEMO.FOTOS, todasFotos);
    return { mensaje: "Foto guardada" };
  }

  // ── TUTORÍAS ──────────────────────────────────────────

  // GET /tutorias
  if (ruta === "/tutorias" && metodo === "GET") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var mis = [];

    if (payload.rol === "estudiante") {
      mis = tutorias.filter(function (t) {
        return t.estudiante_id === payload.id;
      });
      mis.forEach(function (t) {
        var doc = usuarios.find(function (u) {
          return u.id === t.docente_id;
        });
        if (doc) t.nombre_docente = doc.nombres + " " + doc.apellidos;
      });
    } else if (payload.rol === "docente") {
      mis = tutorias.filter(function (t) {
        return t.docente_id === payload.id;
      });
      mis.forEach(function (t) {
        var est = usuarios.find(function (u) {
          return u.id === t.estudiante_id;
        });
        if (est) t.nombre_estudiante = est.nombres + " " + est.apellidos;
        var pe = perfiles[t.estudiante_id];
        if (pe) {
          t.programa = pe.programa;
          t.semestre = pe.semestre;
        }
      });
    } else {
      // admin ve todas
      mis = tutorias.map(function (t) {
        var doc = usuarios.find(function (u) {
          return u.id === t.docente_id;
        });
        var est = usuarios.find(function (u) {
          return u.id === t.estudiante_id;
        });
        return Object.assign({}, t, {
          nombre_docente: doc ? doc.nombres + " " + doc.apellidos : "",
          nombre_estudiante: est ? est.nombres + " " + est.apellidos : "",
        });
      });
    }

    return mis.sort(function (a, b) {
      return b.fecha.localeCompare(a.fecha);
    });
  }

  // POST /tutorias
  if (ruta === "/tutorias" && metodo === "POST") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var {
      asignatura: asig,
      modalidad: mod,
      fecha: fech,
      hora: hor,
      observaciones: obs,
      docente_id: dId,
      estudiante_id: eId,
    } = cuerpo;

    if (!asig || !mod || !fech || !hor)
      throw { mensaje: "Faltan datos obligatorios" };

    var idEst2 = payload.rol === "estudiante" ? payload.id : parseInt(eId);
    var idDoc2 = payload.rol === "docente" ? payload.id : parseInt(dId);

    if (!idEst2 || !idDoc2)
      throw { mensaje: "Falta el estudiante o el docente" };

    // Verificar conflicto de horario
    var conflicto = tutorias.find(function (t) {
      return (
        t.docente_id === idDoc2 &&
        t.fecha === fech &&
        t.hora === hor &&
        t.estado !== "cancelada"
      );
    });
    if (conflicto)
      throw { mensaje: "El docente ya tiene una tutoría a esa hora" };

    if (new Date(fech + "T" + hor) < new Date()) {
      throw { mensaje: "La fecha no puede ser en el pasado" };
    }

    var nuevaTut = {
      id: _nuevoId(),
      estudiante_id: idEst2,
      docente_id: idDoc2,
      asignatura: asig,
      modalidad: mod,
      fecha: fech,
      hora: hor,
      estado: "pendiente",
      observaciones: obs || "",
      creada_en: new Date().toISOString(),
    };
    tutorias.push(nuevaTut);
    _guardar(DEMO.TUTORIAS, tutorias);

    // Notificaciones automáticas
    var nsT = _leer(DEMO.NOTIFICACIONES, []);
    nsT.push({
      id: _nuevoId(),
      usuario_id: idEst2,
      icono: "📅",
      titulo: "Tutoría programada",
      descripcion: asig + " el " + fech + " a las " + hor,
      leida: false,
      creada_en: new Date().toISOString(),
    });
    nsT.push({
      id: _nuevoId(),
      usuario_id: idDoc2,
      icono: "📅",
      titulo: "Nueva tutoría asignada",
      descripcion: "Sesión de " + asig + " el " + fech,
      leida: false,
      creada_en: new Date().toISOString(),
    });
    _guardar(DEMO.NOTIFICACIONES, nsT);

    return { mensaje: "Tutoría programada", id: nuevaTut.id };
  }

  // PATCH /tutorias/:id/cancelar
  var matchCancelar = ruta.match(/^\/tutorias\/(\d+)\/cancelar$/);
  if (matchCancelar && metodo === "PATCH") {
    if (!payload) throw { status: 401, mensaje: "Sin sesión" };
    var idCan = parseInt(matchCancelar[1]);
    var tut = tutorias.find(function (t) {
      return t.id === idCan;
    });
    if (!tut) throw { mensaje: "Tutoría no encontrada" };

    var horas = (new Date(tut.fecha + "T" + tut.hora) - new Date()) / 3600000;
    if (horas < CONFIG.HORAS_CANCELACION && payload.rol !== "admin") {
      throw {
        mensaje:
          "Solo se puede cancelar con " +
          CONFIG.HORAS_CANCELACION +
          "h de anticipación (RN03)",
      };
    }
    tut.estado = "cancelada";
    _guardar(DEMO.TUTORIAS, tutorias);
    return { mensaje: "Tutoría cancelada" };
  }

  // ── NOTIFICACIONES ────────────────────────────────────

  // GET /notificaciones
  if (ruta === "/notificaciones" && metodo === "GET") {
    if (!payload) return [];
    var misNotifs = notifs
      .filter(function (n) {
        return n.usuario_id === payload.id;
      })
      .sort(function (a, b) {
        return b.creada_en.localeCompare(a.creada_en);
      })
      .slice(0, 50);
    return misNotifs;
  }

  // PATCH /notificaciones/:id/leer
  var matchLeer = ruta.match(/^\/notificaciones\/(\d+)\/leer$/);
  if (matchLeer && metodo === "PATCH") {
    var idN = parseInt(matchLeer[1]);
    var notif = notifs.find(function (n) {
      return n.id === idN;
    });
    if (notif) {
      notif.leida = true;
      _guardar(DEMO.NOTIFICACIONES, notifs);
    }
    return { mensaje: "Notificación leída" };
  }

  // PATCH /notificaciones/leer-todas
  if (ruta === "/notificaciones/leer-todas" && metodo === "PATCH") {
    if (!payload) return { mensaje: "ok" };
    notifs.forEach(function (n) {
      if (n.usuario_id === payload.id) n.leida = true;
    });
    _guardar(DEMO.NOTIFICACIONES, notifs);
    return { mensaje: "Todas leídas" };
  }

  // ── ADMIN ──────────────────────────────────────────────

  // GET /admin/usuarios
  if (ruta === "/admin/usuarios" && metodo === "GET") {
    if (!payload || payload.rol !== "admin") throw { status: 403, mensaje: "Sin permisos" };
    return usuarios.map(function(u) {
      var p = perfiles[u.id] || {};
      return Object.assign({}, u, {
        programa: p.programa || null,
        semestre: p.semestre || null,
        promedio: p.promedio || null,
        en_alerta: p.en_alerta || 0,
        facultad: p.facultad || null,
        dependencia: p.dependencia || null
      });
    });
  }

  // POST /admin/usuarios (crear usuario)
  if (ruta === "/admin/usuarios" && metodo === "POST") {
    if (!payload || payload.rol !== "admin") throw { status: 403, mensaje: "Sin permisos" };
    var nuCorreo = cuerpo.correo;
    if (usuarios.find(function(u) { return u.correo === nuCorreo; })) throw { mensaje: "Ya existe ese correo" };
    var nuevoU = { id: _nuevoId(), nombres: cuerpo.nombres, apellidos: cuerpo.apellidos, correo: cuerpo.correo, contrasena: cuerpo.contrasena || "Cambiar123", rol: cuerpo.rol, activo: true, ultimo_acceso: new Date().toISOString() };
    usuarios.push(nuevoU);
    _guardar(DEMO.USUARIOS, usuarios);
    return { mensaje: "Usuario creado", id: nuevoU.id };
  }

  // PATCH /admin/usuarios/:id/estado
  var matchEstado = ruta.match(/^\/admin\/usuarios\/(\d+)\/estado$/);
  if (matchEstado && metodo === "PATCH") {
    if (!payload || payload.rol !== "admin") throw { status: 403, mensaje: "Sin permisos" };
    var uidE = parseInt(matchEstado[1]);
    var usr = usuarios.find(function(u) { return u.id === uidE; });
    if (usr) { usr.activo = cuerpo.activo; _guardar(DEMO.USUARIOS, usuarios); }
    return { mensaje: "Estado cambiado" };
  }

  // GET /admin/estadisticas
  if (ruta === "/admin/estadisticas" && metodo === "GET") {
    var totalU = usuarios.filter(function(u) { return u.activo; }).length;
    var alertasN = Object.values(perfiles).filter(function(p) { return p.tipo === "estudiante" && parseFloat(p.promedio) < 3.0; }).length;
    return { total_usuarios: totalU, alertas_activas: alertasN, total_tutorias: tutorias.length, tutorias_este_mes: tutorias.length, perfiles_completos: Object.keys(perfiles).length, total_asignaciones: 0, tasa_recuperacion: "83%" };
  }

  // POST /admin/notificaciones
  if (ruta === "/admin/notificaciones" && metodo === "POST") {
    if (!payload || payload.rol !== "admin") throw { status: 403, mensaje: "Sin permisos" };
    var cantN = Math.max(1, usuarios.filter(function(u) { return u.activo; }).length);
    var histDemo = _leer("cp_demo.historial_notif", []);
    histDemo.unshift({ id: _nuevoId(), destinatario: cuerpo.destinatario || "Todos", tipo: cuerpo.tipo || "General", asunto: cuerpo.asunto, mensaje: cuerpo.mensaje, cantidad: cantN, creada_en: new Date().toISOString() });
    _guardar("cp_demo.historial_notif", histDemo);
    return { mensaje: "Enviado a " + cantN + " usuarios", cantidad: cantN };
  }

  // GET /admin/notificaciones/historial
  if (ruta === "/admin/notificaciones/historial" && metodo === "GET") {
    return _leer("cp_demo.historial_notif", []);
  }

  // GET /admin/asignaciones
  if (ruta === "/admin/asignaciones" && metodo === "GET") {
    return _leer("cp_demo.asignaciones", []);
  }

  // POST /admin/asignaciones
  if (ruta === "/admin/asignaciones" && metodo === "POST") {
    var asigs = _leer("cp_demo.asignaciones", []);
    var estU = usuarios.find(function(u) { return u.id === cuerpo.estudiante_id; });
    var docU = usuarios.find(function(u) { return u.id === cuerpo.docente_id; });
    var perfilEst = perfiles[cuerpo.estudiante_id] || {};
    asigs.push({ id: _nuevoId(), nombre_estudiante: estU ? estU.nombres + " " + estU.apellidos : "Estudiante", nombre_docente: docU ? docU.nombres + " " + docU.apellidos : "Docente", programa: perfilEst.programa || "—", promedio: perfilEst.promedio || 0, creada_en: new Date().toISOString() });
    _guardar("cp_demo.asignaciones", asigs);
    return { mensaje: "Asignación creada" };
  }

  // DELETE /admin/asignaciones/:id
  var matchDelAsig = ruta.match(/^\/admin\/asignaciones\/(\d+)$/);
  if (matchDelAsig && metodo === "DELETE") {
    var asigsDel = _leer("cp_demo.asignaciones", []);
    var delId = parseInt(matchDelAsig[1]);
    _guardar("cp_demo.asignaciones", asigsDel.filter(function(a) { return a.id !== delId; }));
    return { mensaje: "Eliminada" };
  }

  // GET /admin/configuracion
  if (ruta === "/admin/configuracion" && metodo === "GET") {
    return _leer("cp_demo.config", { umbral_alerta: "3.0", max_estudiantes_tutor: "15", horas_cancelacion: "24", minutos_sesion: "120" });
  }

  // POST /admin/configuracion
  if (ruta === "/admin/configuracion" && metodo === "POST") {
    var cfg = _leer("cp_demo.config", { umbral_alerta: "3.0", max_estudiantes_tutor: "15", horas_cancelacion: "24", minutos_sesion: "120" });
    cfg[cuerpo.clave] = String(cuerpo.valor);
    _guardar("cp_demo.config", cfg);
    return { mensaje: "Guardado" };
  }

  // POST /admin/configuracion/reset
  if (ruta === "/admin/configuracion/reset" && metodo === "POST") {
    _guardar("cp_demo.config", { umbral_alerta: "3.0", max_estudiantes_tutor: "15", horas_cancelacion: "24", minutos_sesion: "120" });
    return { mensaje: "Reseteada" };
  }

  // GET /admin/periodos
  if (ruta === "/admin/periodos" && metodo === "GET") {
    return _leer("cp_demo.periodos", [{ id: 1, nombre: "2026-1", inicio: "2026-02-03", fin: "2026-06-15", estado: "activo" }]);
  }

  // POST /admin/periodos
  if (ruta === "/admin/periodos" && metodo === "POST") {
    var pers = _leer("cp_demo.periodos", [{ id: 1, nombre: "2026-1", inicio: "2026-02-03", fin: "2026-06-15", estado: "activo" }]);
    pers.push({ id: _nuevoId(), nombre: cuerpo.nombre, inicio: cuerpo.inicio, fin: cuerpo.fin, estado: "proximo" });
    _guardar("cp_demo.periodos", pers);
    return { mensaje: "Período creado" };
  }

  // GET /admin/auditoria
  if (ruta === "/admin/auditoria" && metodo === "GET") {
    return [];
  }

  // Ruta no manejada en demo
  console.warn("[DEMO] Ruta no implementada:", metodo, ruta);
  return { mensaje: "ok" };
}

// ── Limpiar datos del modo demo ─────────────────────────
// Llamar desde consola si quieres empezar de cero: limpiarDemo()
function limpiarDemo() {
  Object.values(DEMO).forEach(function (clave) {
    localStorage.removeItem(clave);
  });
  console.log("[DEMO] Datos de demo eliminados. Recarga la página.");
}
