'use strict';

/* JM Digital Office - Service Worker
   Precaches the entire project (launcher + all sub-apps, e.g. /wbcyn/) so the
   whole site works completely offline after first load. This single service
   worker is registered from every page using a relative path that resolves to
   this same file, so its scope automatically covers the whole project root -
   no matter whether the project is hosted at a domain root or in a GitHub
   Pages subfolder (e.g. https://username.github.io/reponame/). */

const CACHE_VERSION = 'jm-digital-office-v17';

// Core app shell - same-origin, always available.
const CORE_ASSETS = [
  './',
  './index.html',
  './launcher.css',
  './launcher.js',
  './sw-update.js',
  './home-nav.js',
  './home-nav.css',
  './coming-soon.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',

  './wbcyn/index.html',
  './wbcyn/app.js',
  './wbcyn/idb.js',
  './wbcyn/styles.css',
  './wbcyn/icons/icon-192.png',
  './wbcyn/icons/icon-512.png',
  './wbcyn/icons/apple-touch-icon.png',

  './clinic/index.html',
  './clinic/app.js',
  './clinic/styles.css',
  './clinic/icons/icon-192.png',
  './clinic/icons/icon-512.png',
  './clinic/icons/apple-touch-icon.png',

  './trust/index.html',
  './trust/app.js',
  './trust/styles.css',
  './trust/icons/icon-192.png',
  './trust/icons/icon-512.png',
  './trust/icons/apple-touch-icon.png',

  './rental/index.html',
  './rental/app.js',
  './rental/styles.css',
  './rental/icons/icon-192.png',
  './rental/icons/icon-512.png',
  './rental/icons/apple-touch-icon.png',

  './planner/index.html',
  './planner/app.js',
  './planner/idb.js',
  './planner/charts.js',
  './planner/styles.css',
  './planner/icons/icon-192.png',
  './planner/icons/icon-512.png',
  './planner/icons/apple-touch-icon.png'
];

// Third-party libraries used by sub-apps - cached best-effort so a missing
// connection at install time never blocks the rest of the app shell.
const OPTIONAL_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js'
];

// Lets the update-prompt banner (sw-update.js) force this worker to take over
// immediately once the user taps "Reload", instead of waiting for every open
// tab/PWA instance to be closed first (which is what leaves iPhone PWAs stuck
// on an old version indefinitely, since a home-screen PWA is rarely "closed").
self.addEventListener('message', (event) => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

// NOTE: skipWaiting() is intentionally NOT called here. A newly installed
// worker is left in the "waiting" state so the page can show the "New
// version available. Reload?" prompt (see sw-update.js) and only activate
// once the user confirms - via the postMessage handler above. This avoids
// silently swapping the running app out from under someone mid-form-entry,
// while still guaranteeing the new version takes over immediately (no
// waiting for every open tab/installed PWA to fully close) the moment the
// user taps Reload.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.all(
        OPTIONAL_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((resp) => cache.put(url, resp))
            .catch(() => {/* will be cached on first successful online fetch instead */})
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Everything except page navigations (CSS/JS/images/fonts) stays CACHE-FIRST
// for speed and full offline support, refreshing the cache in the background
// from the network.
function handleAsset(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req)
      .then((resp) => {
        if (resp && (resp.status === 200 || resp.type === 'opaque')) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => undefined);
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Page navigations (opening any module, tapping the Home button, etc.) are
  // deliberately NOT intercepted with respondWith() at all - they are left
  // to the browser's normal networking, exactly as an ordinary Safari tab
  // handles them. This is intentional: WebKit has documented, reproducible
  // bugs where a service worker's handling of navigation requests
  // (event.respondWith on a "navigate"-mode fetch) can silently fail or
  // hang specifically inside an iOS standalone/home-screen "web clip",
  // even though the exact same worker code runs fine for a normal Safari
  // tab, and even though asset fetches from the same worker work fine in
  // both contexts. One well-documented trigger is a service-worker update
  // activating while a navigation is already in flight, which causes
  // WebKit to kill that in-flight page load outright. Letting navigations
  // pass through untouched removes the service worker from that failure
  // path entirely, which is what actually fixes "Home button does nothing
  // in the installed app, but works in Safari" - it was never a caching
  // problem. Static assets are unaffected and still get full offline
  // support below.
  if (req.mode === 'navigate') return;

  event.respondWith(handleAsset(req));
});
