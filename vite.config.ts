import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// Electron hosts (e.g. VS Code) may export this; it would make Electron start as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: { build: { rolldownOptions: { external: ['better-sqlite3'] } } },
      },
      preload: { input: 'electron/preload.ts' },
    }),
  ],
})
