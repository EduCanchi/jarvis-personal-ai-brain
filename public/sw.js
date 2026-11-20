// Service worker mínimo: instalación de la PWA y caché de estáticos.
// No cachea respuestas de API (datos personales y siempre frescos).
const CACHE = "jarvis-v1";
const ASSETS = ["/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (!ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});

// Notificaciones push: el servidor local no envía Web Push (requiere VAPID y conexión
// permanente). Se deja el manejador para futuras integraciones y para notificaciones
// mostradas desde la página.
self.addEventListener("push", (event) => {
  let data = { title: "JARVIS", body: "Nuevo aviso" };
  try {
    data = event.data ? event.data.json() : data;
  } catch {
    /* texto plano */
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon-192.png" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/asistente"));
});
