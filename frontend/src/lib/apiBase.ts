// In production the API is served on the same domain (Vercel rewrites /api/* to the
// backend service), so the relative "/api" default works with no config. In local dev,
// default to the FastAPI dev server directly. Override with VITE_API_BASE_URL if needed
// (e.g. pointing a local frontend at a deployed backend).
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8000/api" : "/api");
