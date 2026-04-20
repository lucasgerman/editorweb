import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND = 'https://illustrious-acceptance-production-0357.up.railway.app'

export default defineConfig({
  plugins: [react()],
  base: '/editorweb/',
  server: {
    port: 5174,
    proxy: {
      '/api': BACKEND
    }
  },
  define: {
    __BACKEND_URL__: JSON.stringify(BACKEND)
  }
})
