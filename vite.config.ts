import { defineConfig, type Plugin } from 'vite'
import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// Electron hosts (e.g. VS Code) may export this; it would make Electron start as plain Node.
delete process.env.ELECTRON_RUN_AS_NODE

/**
 * `npm run dev`: the website's own API inside the dev server, on a database kept on this computer
 * (./data). No Vercel, no Supabase, no second process. Same code and rules as the live site.
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      if (fs.existsSync('.env')) process.loadEnvFile('.env') // SMTP_*, SETUP_CODE... like the host's variables
      if (!process.env.DEV_USE_REMOTE_DB) delete process.env.DATABASE_URL // always local unless asked
      process.env.DATA_DIR ||= './data'
      server.middlewares.use((req, res, next) => {
        const m = /^\/api\/([^/?#]+)/.exec(req.url ?? '')
        if (!m) return next()
        server.ssrLoadModule('/server/app.ts')
          .then((app) => app.handleApi(req, res, m[1]))
          .catch((e) => { console.error(e); if (!res.headersSent) { res.statusCode = 500; res.end('{"ok":false,"error":"Server error"}') } })
      })
      // Open the database (and print the first-time setup code) right away.
      server.ssrLoadModule('/server/app.ts').then((app) => app.ready()).catch((e) => console.error('Could not open the local database:', e))
    },
  }
}

export default defineConfig(({ command, mode }) => ({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    localApi(),
    // The desktop wrapper: built for releases, started in dev only with `npm run dev:desktop`.
    ...(command === 'build' || mode === 'desktop'
      ? [electron({ main: { entry: 'electron/main.ts' }, preload: { input: 'electron/preload.ts' } })]
      : []),
  ],
}))
