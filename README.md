# ConectaProfe 🎓
Sistema de Seguimiento Académico — Universidad Católica Luis Amigó (FUNLAM)

## Correr localmente
```bash
cd backend
npm install
node server.js
```
Abre `http://localhost:3000`. Contraseña de todos los usuarios de prueba: **123456**

---

## Despliegue en Railway ✅ Recomendado

**Paso 1** — Sube esta carpeta a un repositorio de GitHub

**Paso 2** — En [railway.app](https://railway.app):
- New Project → Deploy from GitHub → selecciona el repo

**Paso 3** — En Railway → Variables, agrega:
```
NODE_ENV=production
JWT_SECRET=082fc809fbee7b6aed4d75bc44d6317d3d4874d1f6a27c6d19e99b2468d05db3
SESSION_SECRET=2098c3056aa00c20827fb62d05cb13148f6f747ebb751b9f8f1baa65e2637187
DOMINIO_CORREO=@funlam.edu.co
RN_PROMEDIO_MINIMO=3.0
RN_HORAS_CANCELACION=24
RN_MAX_ESTUDIANTES_POR_TUTOR=15
```

**Paso 4** — Railway despliega y te da una URL pública 🚀

---

## Despliegue en Render (alternativa gratis)
- Build Command: `cd backend && npm install`
- Start Command: `cd backend && node server.js`
- Agrega las mismas variables de entorno

---

## Stack: Node.js + Express + SQLite + HTML/CSS/JS Vanilla
