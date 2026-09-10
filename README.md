# Skynet

ERP interno de gestión operativa: usuarios y roles con RBAC granular, CMMS de
mantenimiento, ausencias, daños, requerimientos, notificaciones (email + web
push), backups cifrados, auditoría, copiloto con IA (Gemini) y el módulo de
preguntas del día (SIG), entre otros. Backend Node/Express + MongoDB, frontend
Vite/React.

## Estructura del repo

- `Backend/` — API REST (Node.js + Express + MongoDB/Mongoose, ESM). Cada
  dominio de negocio vive en `Backend/src/modules/<nombre>/`.
- `frontend/` — SPA (Vite + React 19 + Tailwind + Radix UI).
- `deploy/` — configuración de despliegue en el VPS (nginx, PM2).
- `DOCUMENTACION/` — documentación funcional/técnica adicional.

## Requisitos

- Node.js 20+
- Una base de datos MongoDB (Atlas o local)

## Arranque en local

### Backend

```bash
cd Backend
cp .env.example .env   # completa MONGO_URI y JWT_SECRET como mínimo
npm install
npm run dev
```

El backend levanta en `http://localhost:3001`. En desarrollo (`NODE_ENV`
distinto de `production`), la documentación interactiva de la API queda
disponible en `http://localhost:3001/api-docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend levanta con Vite (por defecto `http://localhost:5173`) y apunta
al backend local.

## Tests

```bash
cd Backend && npm test    # Vitest + mongodb-memory-server (no toca Atlas real)
cd frontend && npm test   # Vitest + Testing Library
```

## Lint

```bash
cd Backend && npm run lint
cd frontend && npm run lint
```

Ambos usan [oxlint](https://oxc.rs/docs/guide/usage/linter.html).

## CI

Cada push/PR a `main` corre lint + tests en Backend y lint + build en
frontend — ver `.github/workflows/ci.yml`.

## Docker (opcional)

```bash
docker compose up --build
```

Levanta backend (`:3001`) y frontend servido por nginx (`:5173`), reutilizando
`Backend/.env` — ver comentario en `docker-compose.yml` para usar un Mongo
100% local en vez del Atlas de desarrollo.

## Más documentación

- `Backend/.env.example` — todas las variables de entorno soportadas,
  documentadas una por una (cuáles son obligatorias y cuáles opcionales).
- `frontend/README.md` — detalles específicos del frontend.
- `DOCUMENTACION/` — documentación funcional del proyecto.
