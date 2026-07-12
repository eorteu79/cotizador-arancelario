# Deploy en Vercel

Este repo se despliega como **un solo proyecto de Vercel** usando `services` en
`vercel.json` (raíz del repo):

- `frontend` (`frontend/`) — build estático de Vite (`dist/`).
- `backend` (`backend/`) — función Python con la app FastAPI (`backend/app/main.py`),
  `maxDuration: 60`.
- `rewrites`: `/api/*` → servicio `backend`; todo lo demás → servicio `frontend`.

Un solo dominio: el frontend llama a `/api/...` de forma relativa y Vercel lo enruta
internamente al backend. No hace falta configurar CORS entre dominios para producción.

## Variables de entorno a cargar en el panel de Vercel

Configurar en **Project Settings → Environment Variables**. Los nombres deben
coincidir exactamente; los valores salen de `backend/.env` / `frontend/.env` locales
(no commiteados).

### Backend (secretas — no exponer en el cliente)

| Variable | Secreta |
|---|---|
| `SUPABASE_URL` | No (es una URL pública del proyecto), pero se carga igual junto a las demás |
| `SUPABASE_SECRET_KEY` | **Sí** |
| `GEMINI_API_KEY` | **Sí** |

### Frontend (inyectadas en el bundle del cliente — no son secretas, no pongas ahí una key con permisos de escritura/admin)

| Variable | Notas |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Key pública (anon/publishable) de Supabase |
| `VITE_API_BASE_URL` | Opcional. En Vercel dejar sin definir (o `/api`) para que use la ruta relativa del mismo dominio. Solo se setea a otra cosa en casos especiales (ej. frontend apuntando a un backend desplegado aparte). |

## Notas

- `Fluid Compute` se activa manualmente en el dashboard del proyecto (no es parte de
  `vercel.json`).
- El CSV de aranceles (`backend/app/modules/cotizador/data/aranceles_base_3b.csv`) se
  incluye explícitamente en la función del backend vía `includeFiles` en `vercel.json`
  y se carga con una ruta relativa al módulo (no ruta absoluta local), así que funciona
  igual en local y en Vercel.
