// Brainweight offline support.
// App files: network first (so updates show right away), cached copy when offline.
// Google Fonts: cache first.
const VERSION = 'bw-v15';
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'native.js',
  'config.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-64.png',
];

self.addEventListener('install', (event) => {
  // Cache each file on its own, so one missing file never stops the app (or notifications) from working.
  event.waitUntil(caches.open(VERSION)
    .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Notifications: rest timer, messages, followers, comments and workout reminders.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Brainweight', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Brainweight', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-64.png',
    data: { url: d.url || '#' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (app) { await app.focus(); app.postMessage({ type: 'open', url: hash }); return; }
    await self.clients.openWindow(new URL('./' + hash, self.registration.scope).href);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => { cache.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((cache) => cache.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});