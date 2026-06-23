/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FORMFLOW_BASE_URL?: string;
  readonly VITE_FORMFLOW_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
