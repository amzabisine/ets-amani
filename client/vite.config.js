import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read PORT from the .env file at the project root, so the dev site
  // always talks to the API on whatever port the server uses.
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  return {
    plugins: [react()],
    server: { proxy: { '/api': `http://localhost:${env.PORT || 3000}` } },
  };
});
