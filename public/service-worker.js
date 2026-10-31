const CACHE_NAME = "DUMBDO_PWA_CACHE_V2";
const ASSETS_TO_CACHE = [];

const preload = async () => {
  console.log("Installing web app");
  return await caches.open(CACHE_NAME)
    .then(async (cache) => {
      console.log("caching index and important routes");
      const response = await fetch("/asset-manifest.json");
      const assets = await response.json();
      ASSETS_TO_CACHE.push(...assets);
      console.log("Assets Cached:", ASSETS_TO_CACHE);
      return cache.addAll(ASSETS_TO_CACHE);
  });
}

// Fetch asset manifest dynamically
globalThis.addEventListener("install", (event) => {
  event.waitUntil(preload().then(() => self.skipWaiting()));
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => clients.claim())
  );
});

globalThis.addEventListener("fetch", (event) => {
  const staticDestinations = ["document", "script", "style", "image", "font", "manifest"];

  if (event.request.method !== "GET" || !staticDestinations.includes(event.request.destination)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});