/**
 * A static file server that behaves like GitHub Pages, for verifying the built
 * app the way it is actually served.
 *
 * The two behaviours that matter, and that `vite preview` does not reproduce:
 *
 * - Files live under a base path, not at the root.
 * - There is no SPA rewrite. An unmatched path gets `404.html` with a real 404
 *   status, which is the whole reason `vite.config.ts` writes that file.
 */

import { createServer, type Server } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import type { AddressInfo } from 'node:net'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

export interface PagesServer {
  /** Origin the server is listening on, e.g. `http://127.0.0.1:51234`. */
  origin: string
  /** Every request served, as `<status> <path>`, in order. */
  requests: readonly string[]
  close(): Promise<void>
}

export interface PagesServerOptions {
  /** Directory to serve — the build output. */
  root: string
  /** Base path the files are mounted under, e.g. `/oll-trainer/`. */
  basePath: string
}

export async function startPagesServer({
  root,
  basePath,
}: PagesServerOptions): Promise<PagesServer> {
  const requests: string[] = []

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://placeholder').pathname

      if (!path.startsWith(basePath)) {
        // Pages would serve the user's site index here; nothing under test
        // should ever ask for it, so make that loud rather than silent.
        requests.push(`404 ${path} (outside base path)`)
        res.writeHead(404, { 'content-type': 'text/plain' }).end('outside base path')
        return
      }

      let relative = path.slice(basePath.length) || 'index.html'
      if (relative.endsWith('/')) relative += 'index.html'

      // `normalize` collapses any `..` before it can escape the served root.
      const file = join(root, normalize('/' + relative))

      try {
        if (!(await stat(file)).isFile()) throw new Error('not a file')
        const body = await readFile(file)
        requests.push(`200 ${path}`)
        res
          .writeHead(200, {
            'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
            // The service worker, not the HTTP cache, is what is under test.
            'cache-control': 'no-cache',
          })
          .end(body)
      } catch {
        const body = await readFile(join(root, '404.html'))
        requests.push(`404 ${path}`)
        res.writeHead(404, { 'content-type': 'text/html', 'cache-control': 'no-cache' }).end(body)
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    // Port 0: let the OS pick, so a stale process cannot make this flaky.
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // `close` waits for open connections to end, and a browser killed
        // mid-session leaves its keep-alive sockets dangling, so drop those
        // first or this never resolves.
        server.closeAllConnections()
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  }
}
