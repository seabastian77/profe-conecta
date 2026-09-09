// Configura la estrategia de Google OAuth con Passport.
const passport = require('passport');
const { db }   = require('./db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
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

        // Rechaza el correo de Google que no esté verificado.
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
          // Crea el usuario como estudiante en su primer ingreso con Google.
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
          // Enlaza la cuenta de Google a un usuario que ya existía por correo.
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

module.exports = { passport, FRONTEND_URL, oauthActivo, DOMINIO_PERMITIDO };
