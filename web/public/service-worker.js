const CACHE_PREFIX = 'mediasqueeze-offline-'
const CACHE_NAME = `${CACHE_PREFIX}v2`

const FFMPEG_CORE_URLS = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
]

const LOCAL_SEED_URLS = [
  '/',
  '/manifest.webmanifest',
]

async function fetchAndCache(cache, url) {
  const absolute = new URL(url, self.location.origin)
  const request = new Request(absolute.href, {
    cache: 'reload',
    mode: absolute.origin === self.location.origin ? 'same-origin' : 'cors',
  })
  const response = await fetch(request)
  if (!response.ok) throw new Error(`Could not cache ${absolute.href}: HTTP ${response.status}`)
  await cache.put(absolute.href, response.clone())
  return response
}

async function precacheApplicationShell() {
  const cache = await caches.open(CACHE_NAME)
  const pageResponse = await fetchAndCache(cache, '/')
  const html = await pageResponse.clone().text()
  const discovered = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((url) => url.startsWith('/'))

  const localUrls = [...new Set([...LOCAL_SEED_URLS, ...discovered])]
    .filter((url) => url !== '/')
  await Promise.all(localUrls.map((url) => fetchAndCache(cache, url)))
}

async function warmFfmpegCore() {
  const cache = await caches.open(CACHE_NAME)
  await Promise.all(FFMPEG_CORE_URLS.map(async (url) => {
    const cached = await cache.match(url)
    if (cached) return
    try {
      await fetchAndCache(cache, url)
    } catch (error) {
      console.warn('FFmpeg offline cache warm-up failed:', url, error)
    }
  }))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheApplicationShell().then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'WARM_FFMPEG_CORE') {
    event.waitUntil(warmFfmpegCore())
  }
})

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
      if (new URL(request.url).pathname === '/') await cache.put('/', response.clone())
    }
    return response
  } catch {
    return (await cache.match(request)) || (await cache.match('/')) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const isSameOrigin = url.origin === self.location.origin
  const isFfmpegCore = FFMPEG_CORE_URLS.includes(url.href)
  if (!isSameOrigin && !isFfmpegCore) return

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request))
    return
  }

  event.respondWith(cacheFirst(event.request))
})
