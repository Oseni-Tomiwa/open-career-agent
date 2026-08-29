import { parseBrowserConfig } from '@oca/config/browser';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

export const browserConfig = parseBrowserConfig(
  apiBaseUrl ? { VITE_API_BASE_URL: apiBaseUrl } : {},
);
