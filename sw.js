// VEILBORN service worker.
//
// Cache-first for the app shell so the installed PWA opens instantly and works
// offline. Vite emits hashed asset filenames, so we precache the shell and then
// cache any same-origin asset on first use.
//
// Every path is derived from the SW's own scope so the same file works whether
// the game is hosted at a domain root or under a GitHub Pages project subpath.
const SCOPE = self.registration.scope;
const BASE = new URL(SCOPE).pathname.replace(/\/$/, '');
const at = (p) => `${BASE}${p.startsWith('/') ? p : `/${p}`}`;
const VERSION = 'veilborn-v2';
const SHELL = [
  at('/'),
  at('/index.html'),
  at('/manifest.webmanifest'),
  at('/icons/icon-180.png'),
  at('/icons/icon-192.png'),
  at('/icons/icon-512.png'),
  at('/icons/icon-maskable-512.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL).catch(() => {});
    // Vite emits hashed bundles, so their names are not known at author time.
    // Read the built index.html and precache exactly the assets it references,
    // which makes the very first offline launch work (no warm-up visit needed).
    try {
      const res = await fetch(at('/index.html'), { cache: 'no-store' });
      const html = await res.text();
      const urls = new Set();
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        let u = m[1];
        if (u.startsWith('./')) u = u.slice(1);
        if (!u.startsWith('/')) continue;
        if (u.endsWith('/sw.js')) continue;
        if (/\.(js|css|svg|png|webp|webmanifest|woff2?)$/.test(u)) urls.add(u);
      }
      await Promise.all([...urls].map((u) => cache.add(u).catch(() => {})));

      // Art is not referenced from index.html (the loader fetches it at boot),
      // so read the published index and precache every sprite and backdrop.
      // Without this the first offline launch has no art at all.
      try {
        const list = await (await fetch(at('/art-index.json'), { cache: 'no-store' })).json();
        await Promise.all(list.map((u) => cache.add(at(u)).catch(() => {})));
      } catch (e) {
        console.warn('[VEILBORN] art precache skipped', e);
      }
    } catch {
      // Offline at install time: the runtime cache will fill in later.
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first with a short timeout, then the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500)),
        ]);
        const cache = await caches.open(VERSION);
        cache.put(at('/index.html'), fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(at('/index.html'));
        return cached || Response.error();
      }
    })());
    return;
  }

  // Everything else: cache first, fill the cache in the background.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200 && fresh.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
