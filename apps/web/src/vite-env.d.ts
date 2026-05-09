/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PI_WS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
