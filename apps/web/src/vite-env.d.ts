/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PRODUCT_DATA_SOURCE?: 'seed' | 'api';
  readonly VITE_DEVELOPMENT_CANDIDATE_ID?: string;
  readonly VITE_DEPLOYMENT_MODE?: 'development' | 'self-hosted' | 'cloud';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
