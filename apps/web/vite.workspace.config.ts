import { mergeConfig } from 'vite';
import base from './vite.config.js';
// Builds/tests never read the user's root .env files.
export default mergeConfig(base, {
  envDir: false,
  build: { outDir: 'dist/workspace', emptyOutDir: true },
});
