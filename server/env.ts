// Read a local .env file (if there is one) before anything else looks at process.env,
// so `npm run local` works with the same variables as Railway / Vercel.
import fs from 'node:fs'

if (fs.existsSync('.env')) {
  try { process.loadEnvFile('.env') } catch (e) { console.warn('Could not read .env:', (e as Error).message) }
}
