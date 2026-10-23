// Caches the app shell only. Dashboard data (/sheet-data, /concerns-data, /api/*) and sign-in traffic are
// private and always go straight to the network, so nothing sensitive is ever stored on the device.
const CACHE = 'essi-shell-v1'
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/logo.png', '/icon-192.png', '/icon-512.png']
const PRIVATE = ['/sheet-data', '/concerns-data', '/api/']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (PRIVATE.some((path) => url.pathname.startsWith(path))) return

  // Pages: network first so a new deploy is picked up at once; fall back to the cached shell, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached || caches.match('/offline.html'))),
    )
    return
  }

  // Built files and images only: hashed /assets/ files cache first, other images network first. Anything else (incl. the app's own
  // fetch('/') that checks for a new version) goes to the network so it is never answered from the cache.
  if (!url.pathname.startsWith('/assets/') && !/\.(png|webp|svg|ico|webmanifest)$/.test(url.pathname)) return
  const hashed = url.pathname.startsWith('/assets/')
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && hashed) return cached // hashed names never change, so the cached copy is always right
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached || Response.error()) // unhashed files (logo, picture) stay fresh online and still load offline
    }),
  )
})
