/**
 * Verifies the built app really works offline — the one claim the README makes
 * that no unit test can reach.
 *
 * It serves `dist/` the way GitHub Pages does, loads the app in headless
 * Chrome, waits for the service worker to finish precaching, cuts the
 * renderer's network, and then boots every page cold: the landing page, the
 * case grid, and a practice deep link. The deeper routes are the interesting
 * ones, because offline they can only work if the service worker's navigation
 * fallback answers and the lazily-loaded route chunks were precached.
 *
 * Run with `pnpm verify:offline`, which builds first. Local only — CI does not
 * run this, because it needs a browser and a real service worker.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startPagesServer } from './lib/pages-server'

const DIST = fileURLToPath(new URL('../dist', import.meta.url))

/** Entries workbox is expected to store. Fewer means something fell out. */
const MIN_PRECACHE_ENTRIES = 14

/**
 * Every page the site serves, each with a probe that proves the page actually
 * rendered rather than merely returning HTML. A blank SPA shell returns 200
 * and precaches fine, so counting bytes would not catch a broken boot.
 *
 * Paths are relative to the deployed base path.
 */
interface PageProbe {
  path: string
  label: string
  /** Expression evaluated in the page; its value is handed to `ok`. */
  probe: string
  ok: (value: number) => boolean
  detail: (value: number) => string
}

const PAGES: readonly PageProbe[] = [
  {
    path: '',
    label: 'landing page',
    // One case face per shape group, plus the Sune mark in the hero.
    probe: 'document.querySelectorAll("svg").length',
    ok: (n) => n >= 15,
    detail: (n) => `${n} svg elements`,
  },
  {
    path: 'oll-trainer',
    label: 'case grid',
    probe: 'document.querySelectorAll("[data-testid^=\'case-\']").length',
    ok: (n) => n === 57,
    detail: (n) => `${n} case tiles`,
  },
  {
    path: 'oll-trainer/practice/train',
    label: 'practice deep link',
    // A scramble and a timer mean the lazily-loaded chunk booted and ran.
    probe: `
      (document.querySelector('[data-testid="scramble"]')?.textContent?.trim().length ?? 0) > 0 &&
      (document.querySelector('[data-testid="timer"]') !== null) ? 1 : 0
    `,
    ok: (n) => n === 1,
    detail: (n) => (n === 1 ? 'scramble and timer rendered' : 'no scramble or timer'),
  },
]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Polls `read` until it satisfies `done`, and returns the last value either
 * way so a failing check can report what it actually saw.
 */
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { attempts = 80, intervalMs = 250 } = {},
): Promise<T> {
  let value = await read()
  for (let i = 0; i < attempts && !done(value); i++) {
    await sleep(intervalMs)
    value = await read()
  }
  return value
}

// ---------------------------------------------------------------------------
// Finding a browser
// ---------------------------------------------------------------------------

/**
 * Chrome installs nowhere consistent, so try the places it actually lives:
 * an explicit override, Playwright's download cache (present on any machine
 * that has ever installed it), then a normal desktop install.
 */
async function findChrome(): Promise<string> {
  const fromEnv = process.env.CHROME_PATH
  if (fromEnv) {
    if (!existsSync(fromEnv)) throw new Error(`CHROME_PATH does not exist: ${fromEnv}`)
    return fromEnv
  }

  const candidates: string[] = []

  const playwrightCache =
    process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
      : join(homedir(), '.cache', 'ms-playwright')

  if (existsSync(playwrightCache)) {
    const builds = (await readdir(playwrightCache))
      .filter((name) => name.startsWith('chromium-'))
      // Highest build number first, so a stale download is not preferred.
      .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)))

    for (const build of builds) {
      candidates.push(
        join(
          playwrightCache,
          build,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        join(
          playwrightCache,
          build,
          'chrome-mac',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        join(playwrightCache, build, 'chrome-linux', 'chrome'),
      )
    }
  }

  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  )

  const found = candidates.find((path) => existsSync(path))
  if (!found) {
    throw new Error(
      'No Chrome found. Install Google Chrome, or point CHROME_PATH at a binary.\nLooked in:\n' +
        candidates.map((c) => `  ${c}`).join('\n'),
    )
  }
  return found
}

// ---------------------------------------------------------------------------
// A minimal CDP client
// ---------------------------------------------------------------------------

interface CdpMessage {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { message?: string }
}

class Cdp {
  #socket: WebSocket
  #nextId = 1
  #pending = new Map<
    number,
    { resolve: (r: Record<string, unknown>) => void; reject: (e: Error) => void }
  >()

  /** Every event received, in order, so a check can look back over them. */
  events: CdpMessage[] = []

  #closed = false

  private constructor(socket: WebSocket) {
    this.#socket = socket
    socket.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpMessage
      if (message.id !== undefined && this.#pending.has(message.id)) {
        const settle = this.#pending.get(message.id)!
        this.#pending.delete(message.id)
        if (message.error) settle.reject(new Error(message.error.message ?? 'CDP error'))
        else settle.resolve(message.result ?? {})
      } else if (message.method) {
        this.events.push(message)
      }
    }
    // A browser that dies mid-run takes the socket with it. Without this,
    // every request already in flight stays pending forever and the script
    // hangs rather than reporting that the browser went away.
    socket.onclose = () => {
      this.#closed = true
      const orphaned = [...this.#pending.values()]
      this.#pending.clear()
      for (const { reject } of orphaned) reject(new Error('browser closed the DevTools connection'))
    }
  }

  static async connect(webSocketUrl: string): Promise<Cdp> {
    const socket = new WebSocket(webSocketUrl)
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error(`could not connect to ${webSocketUrl}`))
    })
    return new Cdp(socket)
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (this.#closed) {
      return Promise.reject(new Error(`browser is gone; cannot send ${method}`))
    }
    return new Promise((resolve, reject) => {
      const id = this.#nextId++
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Evaluates an expression in the page, awaiting it if it is a promise. */
  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as {
      result?: { value?: T }
      exceptionDetails?: { exception?: { description?: string }; text?: string }
    }
    if (result.exceptionDetails) {
      const { exception, text } = result.exceptionDetails
      throw new Error(`page threw: ${exception?.description ?? text ?? 'unknown'}`)
    }
    return result.result?.value as T
  }

  /** Navigates and waits for the load event, ignoring anything before now. */
  async navigate(url: string): Promise<void> {
    const from = this.events.length
    await this.send('Page.navigate', { url })
    for (let i = 0; i < 150; i++) {
      if (this.events.slice(from).some((e) => e.method === 'Page.loadEventFired')) return
      await sleep(100)
    }
    throw new Error(`load event never fired for ${url}`)
  }

  /**
   * Requests that failed since the last `clearEvents()`, as readable strings.
   * Cancelled requests are excluded: navigating away legitimately cancels
   * in-flight requests and that is not an offline failure.
   */
  failedRequests(): string[] {
    const urlOf = (requestId: unknown): string => {
      const sent = this.events.find(
        (e) =>
          e.method === 'Network.requestWillBeSent' &&
          (e.params as { requestId?: unknown })?.requestId === requestId,
      )
      const request = (sent?.params as { request?: { url?: string } })?.request
      return request?.url ?? '(unknown url)'
    }

    return this.events
      .filter((e) => e.method === 'Network.loadingFailed')
      .map((e) => e.params as { requestId?: unknown; errorText?: string; canceled?: boolean })
      .filter((p) => !p.canceled)
      .map((p) => `${p.errorText} ${urlOf(p.requestId)}`)
  }

  clearEvents(): void {
    this.events = []
  }

  close(): void {
    try {
      this.#socket.close()
    } catch {
      // Already gone; the browser is about to be killed anyway.
    }
  }
}

/**
 * Launches headless Chrome on an OS-assigned debugging port and returns a
 * client attached to its page target.
 */
async function launchBrowser(): Promise<{ cdp: Cdp; stop: () => void }> {
  const binary = await findChrome()
  const profile = mkdtempSync(join(tmpdir(), 'oll-trainer-offline-'))

  const chrome: ChildProcess = spawn(
    binary,
    [
      '--headless=new',
      // Port 0 makes Chrome pick a free port and write it to the profile.
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      'about:blank',
    ],
    // `detached` makes Chrome its own process-group leader, so `stop` can kill
    // the whole tree. Killing just this pid leaves Chrome's helper and
    // renderer processes orphaned, and they pile up across runs.
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
  )

  let stderr = ''
  chrome.stderr?.on('data', (chunk: Buffer) => {
    stderr += String(chunk)
  })

  const stop = () => {
    try {
      // Negative pid: the process group, i.e. Chrome and all its helpers.
      if (chrome.pid !== undefined) process.kill(-chrome.pid, 'SIGKILL')
    } catch {
      // Already dead, which is the outcome we wanted anyway.
    }
    rmSync(profile, { recursive: true, force: true })
  }

  try {
    const portFile = join(profile, 'DevToolsActivePort')
    let port = ''
    for (let i = 0; i < 80 && !port; i++) {
      if (existsSync(portFile)) port = readFileSync(portFile, 'utf8').split('\n')[0]!.trim()
      if (!port) await sleep(250)
    }
    if (!port) throw new Error(`Chrome never reported a debugging port.\n${stderr}`)

    const pageWebSocketUrl = await until(
      async () => {
        try {
          const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
            type: string
            webSocketDebuggerUrl?: string
          }[]
          return targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl
        } catch {
          return undefined
        }
      },
      (url) => url !== undefined,
      { attempts: 40 },
    )
    if (!pageWebSocketUrl) throw new Error(`Chrome never exposed a page target.\n${stderr}`)

    return { cdp: await Cdp.connect(pageWebSocketUrl), stop }
  } catch (error) {
    stop()
    throw error
  }
}

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const checks: { name: string; ok: boolean; detail: string }[] = []

function check(name: string, ok: boolean, detail = ''): void {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** Reads the base path out of the built manifest, rather than duplicating it. */
function builtBasePath(): string {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8')) as {
    scope?: string
  }
  if (!manifest.scope) throw new Error('built manifest has no scope')
  return manifest.scope
}

/**
 * Kills the browser and fails if the run stops making progress. Anything
 * evaluated in the page is a promise that a broken build can leave pending
 * forever, and a verification script that hangs is worse than one that fails.
 */
function startWatchdog(ms: number): { teardown: (stop: () => void) => void; cancel: () => void } {
  let stopBrowser: (() => void) | null = null
  const timer = setTimeout(() => {
    console.error(`\nverify-offline gave up after ${ms / 1000}s without finishing.`)
    stopBrowser?.()
    process.exit(2)
  }, ms)
  timer.unref()
  return {
    teardown: (stop) => {
      stopBrowser = stop
    },
    cancel: () => clearTimeout(timer),
  }
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    throw new Error(`No build found in ${DIST}. Run \`pnpm build\` first.`)
  }

  const watchdog = startWatchdog(180_000)
  const basePath = builtBasePath()
  const server = await startPagesServer({ root: DIST, basePath })
  const { cdp, stop } = await launchBrowser()
  watchdog.teardown(stop)

  try {
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Network.enable')

    // --- Online: first visit, service worker installs and precaches --------
    await cdp.navigate(server.origin + basePath)

    const title = await cdp.evaluate<string>('document.title')
    check('online: root loads', title.length > 0, `title=${JSON.stringify(title)}`)

    const landing = PAGES[0]!
    const heroFaces = await cdp.evaluate<number>(landing.probe)
    check(`online: ${landing.label} renders`, landing.ok(heroFaces), landing.detail(heroFaces))

    // `navigator.serviceWorker.ready` resolves as soon as there is an active
    // worker, which can still be 'activating' while it precaches, so poll for
    // the terminal state instead of reading it once.
    //
    // The race matters: if precaching fails, `ready` never resolves at all,
    // and an unbounded `awaitPromise` would hang this script instead of
    // reporting the failure.
    const swState = await until(
      () =>
        cdp.evaluate<string>(`
          (async () => {
            const registration = await Promise.race([
              navigator.serviceWorker.ready,
              new Promise((resolve) => setTimeout(() => resolve(null), 1000)),
            ])
            if (!registration) return 'never-became-ready'
            return registration.active ? registration.active.state : 'no-active-worker'
          })()
        `),
      (state) => state === 'activated',
    )
    check('service worker activates', swState === 'activated', `state=${swState}`)

    const countCached = `
      (async () => {
        let total = 0
        for (const name of await caches.keys())
          total += (await (await caches.open(name)).keys()).length
        return total
      })()
    `
    const cachedCount = await until(
      () => cdp.evaluate<number>(countCached),
      (n) => n >= MIN_PRECACHE_ENTRIES,
    )
    check(
      'precache is populated',
      cachedCount >= MIN_PRECACHE_ENTRIES,
      `${cachedCount} entries (expected at least ${MIN_PRECACHE_ENTRIES})`,
    )

    const cachedPaths = await cdp.evaluate<string[]>(`
      (async () => {
        const paths = []
        for (const name of await caches.keys())
          for (const request of await (await caches.open(name)).keys())
            paths.push(new URL(request.url).pathname)
        return paths.sort()
      })()
    `)

    // The lazily-loaded route chunks are what a naive precache misses, and
    // their absence would only show up on an offline deep link.
    for (const chunk of ['SelectionView', 'PracticeView']) {
      check(
        `precache includes the lazy ${chunk} chunk`,
        cachedPaths.some((p) => new RegExp(`/assets/${chunk}-.*\\.js$`).test(p)),
      )
    }

    const hasSpaFallback = cachedPaths.some((p) => p.endsWith('/404.html'))
    check('precache includes the Pages 404 fallback', hasSpaFallback)

    // --- Offline: cut the network at the renderer, then boot cold ----------
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })

    // Every page, booted cold from cache. Each navigation is a fresh document,
    // so this is the real "opened the app with no network" path rather than
    // client-side routing around an already-loaded bundle.
    for (const page of PAGES) {
      const url = server.origin + basePath + page.path
      cdp.clearEvents()
      await cdp.navigate(url)

      // The route renders after hydration, a tick behind the load event.
      const value = await until(
        () => cdp.evaluate<number>(page.probe),
        (v) => page.ok(v),
        { attempts: 40, intervalMs: 100 },
      )
      check(`offline: ${page.label} boots from cache`, page.ok(value), page.detail(value))

      // Pages redirects a directory to add its trailing slash, so
      // /oll-trainer legitimately lands on /oll-trainer/. Both are the same
      // route; what matters is that the URL was not rewritten to something else.
      const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/$/, '') : p)
      const landedOn = await cdp.evaluate<string>('location.pathname')
      const wanted = basePath + page.path
      check(
        `offline: ${page.label} keeps its URL`,
        trimSlash(landedOn) === trimSlash(wanted),
        `expected ${wanted}, got ${landedOn}`,
      )

      const failures = cdp.failedRequests()
      check(
        `offline: nothing fails to load on the ${page.label}`,
        failures.length === 0,
        failures.join('; ') || 'no failed requests',
      )
    }

    console.log(`\nservice worker cached ${cachedPaths.length} files:`)
    for (const path of cachedPaths) console.log(`  ${path}`)
  } finally {
    watchdog.cancel()
    cdp.close()
    stop()
    await server.close()
  }

  const failed = checks.filter((c) => !c.ok)
  console.log(
    failed.length
      ? `\n${failed.length} of ${checks.length} checks FAILED`
      : `\nall ${checks.length} checks passed — the build works offline`,
  )
  if (failed.length) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(`\nverify-offline could not run: ${(error as Error).message}`)
  process.exitCode = 2
})
