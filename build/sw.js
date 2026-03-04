const CACHE_NAME = "cc-app-cache-v1";

const CORE_ASSETS = [
    "./",
    "./index.html",
    "./banks.html",
    "./cards.html",
    "./404.html",
    "./styles/mainStyle.css",
    "./styles/walletStyle.css",
    "./styles/adminStyle.css",
    "./styles/404Style.css",
    "./js/dataStore.js",
    "./js/registerSw.js",
    "./js/walletScript.js",
    "./js/banksScript.js",
    "./js/cardsScript.js",
    "./database/bankData.json",
    "./database/cardsData.json",
    "./logo/wallet.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                    return Promise.resolve();
                })
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request)
                .then((response) => {
                    if (!response || response.status !== 200) return response;
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => {
                    if (request.destination === "document") {
                        return caches.match("./index.html");
                    }
                    return Response.error();
                });
        })
    );
});
