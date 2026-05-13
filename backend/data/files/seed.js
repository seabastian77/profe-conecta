/**
 * seed.js — Aplica contraseñas reales (bcrypt) a los usuarios de prueba
 * 
 * Ejecutar UNA SOLA VEZ después de instalar dependencias:
 *   node seed.js
 * 
 * Contraseña de todos los usuarios de prueba: 12345678
 */

const bcrypt  = require('bcryptjs');
const Database = require('better-sqlite3');
const path    = require('path');

const DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'conectaprofe.db');
const db = new Database(DB_PATH);

const hash = bcrypt.hashSync('12345678', 10);

const usuarios = [
  'carlos.restrepo@amigo.edu.co',
  'valentina.lopez@amigo.edu.co',
  'andres.rios@amigo.edu.co',
  'laura.gonzalez@amigo.edu.co',
  'lina.montoya@amigo.edu.co',
  'admin@amigo.edu.co',
];

const stmt = db.prepare("UPDATE usuarios SET contrasena = ? WHERE correo = ?");

for (const correo of usuarios) {
  const info = stmt.run(hash, correo);
  console.log(`✅ ${correo} — ${info.changes > 0 ? 'OK' : 'No encontrado'}`);
}

db.close();
console.log('\n🔐 Contraseña aplicada: 12345678 para todos los usuarios');
