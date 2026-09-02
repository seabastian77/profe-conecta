// Configuración de Google OAuth con Passport
//
// NOTA: la versión anterior usaba la API síncrona de better-sqlite3
// (db.prepare(...).get(...) sin await). Con PostgreSQL esas llamadas
// devuelven una Promesa, que siempre es "truthy", así que:
//   - el `if (!usuario)` nunca se cumplía → jamás se creaba el usuario nuevo
//   - `usuario.id` era undefined → el UPDATE corría contra un id vacío
//   - se pasaba la Promesa como usuario → el token salía con id undefined
// Por eso el login con Google no funcionaba. Aquí queda con async/await.

const passport = require('passport');
const { db }   = require('./db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Debe coincidir con CONFIG.DOMINIO_CORREO del frontend (@amigo.edu.co).
const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '@amigo.edu.co';

const oauthActivo = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (oauthActivo) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;

  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
    },
    async function (accessToken, refreshToken, profile, done) {
      try {
        const correo = (profile.emails?.[0]?.value || '').toLowerCase().trim();

        // Google marca si el correo está verificado. Si no lo está, no entra.
        const verificado = profile.emails?.[0]?.verified;
        if (verificado === false) {
          return done(null, false, { message: 'Correo de Google no verificado' });
        }

        if (!correo || !correo.endsWith(DOMINIO_PERMITIDO)) {
          return done(null, false, { message: `Solo cuentas ${DOMINIO_PERMITIDO}` });
        }

        const googleId  = profile.id;
        const nombres   = profile.name?.givenName  || profile.displayName || 'Usuario';
        const apellidos = profile.name?.familyName || '';

        let usuario = await db
          .prepare('SELECT * FROM usuarios WHERE correo = ? OR google_id = ?')
          .get(correo, googleId);

        if (!usuario) {
          // RETURNING * es la forma en PostgreSQL de recuperar la fila insertada.
          // (lastInsertRowid era de better-sqlite3 y aquí siempre era undefined.)
          usuario = await db
            .prepare(
              'INSERT INTO usuarios (nombres, apellidos, correo, google_id, rol, activo) ' +
              'VALUES (?,?,?,?,?,?) RETURNING *'
            )
            .get(nombres, apellidos, correo, googleId, 'estudiante', 1);
        } else {
          if (usuario.activo !== 1) {
            return done(null, false, { message: 'Cuenta desactivada' });
          }
          // Enlazar la cuenta de Google a un usuario que ya existía por correo.
          if (!usuario.google_id) {
            await db
              .prepare('UPDATE usuarios SET google_id = ? WHERE id = ?')
              .run(googleId, usuario.id);
            usuario.google_id = googleId;
          }
        }

        if (!usuario || !usuario.id) {
          return done(new Error('No se pudo crear o recuperar el usuario'));
        }

        return done(null, usuario);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// serialize/deserialize solo hacen falta si se usan sesiones de servidor.
// Este proyecto autentica con JWT (session: false), así que no se registran.

module.exports = { passport, FRONTEND_URL, oauthActivo, DOMINIO_PERMITIDO };
