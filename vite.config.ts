import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// For GitHub Pages *project* pages the site is served from /<repo>/.
// Override with BASE_PATH env (e.g. "/open-alliance-awards/") at build time;
// defaults to "/" so `npm run dev` and user/org pages work unchanged.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
})
