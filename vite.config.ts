import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// The config runs in Node but the project has no @types/node.
declare const process: { env: Record<string, string | undefined> }

export default defineConfig({
  plugins: [svelte()],
  // GitHub Pages serves this from /mealplan/, and the app uses hash routing,
  // so every asset path must be relative.
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5175,
    // The API is HealthLog's server. Locally that's `node server/index.js` in
    // ../healthlog; point elsewhere with VITE_DEV_API.
    proxy: {
      // A regex, not '/api': a plain prefix would also swallow /api-config.js.
      '^/api/': {
        target: process.env.VITE_DEV_API ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
