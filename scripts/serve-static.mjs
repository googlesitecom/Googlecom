// Servidor estático de prueba: sirve out/ bajo /Googlecom/
// (replica el comportamiento de GitHub Pages) en el puerto 4173.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', 'out')
const BASE = '/Googlecom'
const PORT = 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url ?? '/')
  if (url === BASE) url = BASE + '/'
  if (!url.startsWith(BASE)) {
    res.writeHead(404).end('no encontrado')
    return
  }
  let rel = url.slice(BASE.length) || '/'
  if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(ROOT, rel)
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('no encontrado: ' + rel)
    return
  }
  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
})

server.listen(PORT, () => {
  console.log(`estático en http://localhost:${PORT}${BASE}/`)
})
