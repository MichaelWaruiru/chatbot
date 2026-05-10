const CACHE_NAME = "coop-magic-cache-v1";
const STATIC_ASSETS = [
    "/",
    "/static/css/style.css",
    "/static/js/chat.js",
    "static/js/widgets.js"
];

// Install -> Cache static files
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});


// Activate -> Clean up old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                    return null;
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // API requests -> Network first
    if (request.url.includes("/chat") || request.url.includes("/translate")) {
        event.respondWith(
            fetch(request).then((response) => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, clone);
                });
                return response;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // Static assets -> Cache first
    event.respondWith(
        caches.match(request).then((cached) => {
            return cached || fetch(request);
        })
    );
});