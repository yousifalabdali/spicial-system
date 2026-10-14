// Vercel serverless function: POST /api/<name>. All logic (auth, permissions, database) is in server/app.ts.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleApi } from '../server/app'

export default function handler(req: IncomingMessage & { query?: Record<string, string | string[]> }, res: ServerResponse) {
  const name = req.query?.name
  return handleApi(req, res, Array.isArray(name) ? name[0] : String(name ?? ''))
}
