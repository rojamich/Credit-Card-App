const CACHE_NAME = "walletapp-v3";

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
    "./js/walletScript.js",
    "./js/banksScript.js",
    "./js/cardsScript.js",
    "./js/registerSw.js",
    "./database/bankData.json",
    "./database/cardsData.json",
    "./logo/wallet.png",
    "./logo/cardBonusesIcons/default-icon.png",
    "./favicon.ico",
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

function isHtmlNavigation(request) {
    if (request.mode === "navigate") return true;
    const accept = request.headers.get("accept") || "";
    return accept.includes("text/html");
}

function isScriptStyleOrJson(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    return path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".json");
}

function isImageRequest(request) {
    if (request.destination === "image") return true;
    const url = new URL(request.url);
    return /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(url.pathname);
}

async function networkFirst(request, fallbackUrl) {
    const requestUrl = new URL(request.url);
    const baseRequest = new Request(requestUrl.origin + requestUrl.pathname, { method: "GET" });

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        const cachedBase = await caches.match(baseRequest);
        if (cachedBase) return cachedBase;
        if (fallbackUrl) {
            const fallback = await caches.match(fallbackUrl);
            if (fallback) return fallback;
        }
        throw error;
    }
}

async function cacheFirst(request) {
    const requestUrl = new URL(request.url);
    const baseRequest = new Request(requestUrl.origin + requestUrl.pathname, { method: "GET" });

    const cached = await caches.match(request);
    if (cached) return cached;
    const cachedBase = await caches.match(baseRequest);
    if (cachedBase) return cachedBase;

    const response = await fetch(request);
    if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isHtmlNavigation(request)) {
        event.respondWith(networkFirst(request, "./index.html"));
        return;
    }

    if (isScriptStyleOrJson(request)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (isImageRequest(request)) {
        event.respondWith(cacheFirst(request));
    }
});
