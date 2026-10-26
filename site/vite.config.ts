import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// No GitHub Pages o site fica em /<repositório>/; o workflow passa o caminho em BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
})
