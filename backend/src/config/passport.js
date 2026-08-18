// Configuración de Google OAuth con Passport
// falta por terminar 

const passport = require('passport');
const { db }   = require('./db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Solo inicializar Google OAuth si hay credenciales configuradas
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy  = require('passport-google-oauth20').Strategy;
  const { generarToken } = require('./jwt');
  const DOMINIO_PERMITIDO = process.env.DOMINIO_CORREO || '@funlam.edu.co';

  passport.use(new GoogleStrategy({
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
    },
    function(accessToken, refreshToken, profile, done) {
      const correo    = profile.emails?.[0]?.value || '';
      const googleId  = profile.id;
      const nombres   = profile.name?.givenName  || profile.displayName || 'Usuario';
      const apellidos = profile.name?.familyName || '';

      if (!correo.endsWith(DOMINIO_PERMITIDO)) {
        return done(null, false, { message: `Solo cuentas ${DOMINIO_PERMITIDO}` });
      }

      let usuario = db.prepare('SELECT * FROM usuarios WHERE correo=? OR google_id=?').get(correo, googleId);
      if (!usuario) {
        const r = db.prepare('INSERT INTO usuarios (nombres, apellidos, correo, google_id, rol) VALUES (?,?,?,?,?)').run(nombres, apellidos, correo, googleId, 'estudiante');
        usuario = db.prepare('SELECT * FROM usuarios WHERE id=?').get(r.lastInsertRowid);
      } else if (!usuario.google_id) {
        db.prepare('UPDATE usuarios SET google_id=? WHERE id=?').run(googleId, usuario.id);
      }
      return done(null, usuario);
    }
  ));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
  done(null, user);
});

module.exports = { passport, FRONTEND_URL };
