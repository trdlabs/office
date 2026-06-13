/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_OFFICE_MODE?: 'mock' | 'connected';
  readonly VITE_OFFICE_GATEWAY_URL?: string;
  readonly VITE_OFFICE_GATEWAY_WS_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
