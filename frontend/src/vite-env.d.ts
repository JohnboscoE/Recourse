/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Public origin of the Recourse backend, e.g. https://recourse-api.up.railway.app
   *
   * Leave unset for local development — the Vite proxy handles "/api" then.
   * Inlined at build time, so it must be set in the host's environment before
   * the build runs, not afterwards.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
