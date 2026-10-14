// Builds the website server (server/index.ts) into dist-server/index.cjs for plain Node.
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist-server',
    target: 'node20',
    emptyOutDir: true,
    rolldownOptions: {
      external: ['postgres', '@electric-sql/pglite'],
      output: { format: 'cjs', entryFileNames: 'index.cjs' },
    },
  },
})
