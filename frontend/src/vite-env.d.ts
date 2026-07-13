/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ACCESS_FORM_ACTION: string;
  readonly VITE_ACCESS_FORM_NOMBRE: string;
  readonly VITE_ACCESS_FORM_EMAIL: string;
  readonly VITE_ACCESS_FORM_TELEFONO: string;
  readonly VITE_ACCESS_FORM_EMPRESA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
