const CACHE_NAME = "walletapp-v1.3";

const CORE_ASSETS = [
    "./",
    "./index.html",
    "./banks.html",
    "./cards.html",
    "./offers.html",
    "./offline.html",
    "./styles/mainStyle.css",
    "./styles/walletStyle.css",
    "./styles/adminStyle.css",
    "./styles/offersStyle.css",
    "./js/dataStore.js",
    "./js/walletScript.js",
    "./js/banksScript.js",
    "./js/cardsScript.js",
    "./js/offersScript.js",
    "./js/registerSw.js",
    "./database/bankData.json",
    "./database/cardsData.json",
    "./database/banks.json",
    "./database/cards.json",
    "./database/offers.json",
    "./logo/wallet.png",
    "./logo/cardBonusesIcons/default-icon.png",
    "./logo/cardBonusesIcons/airfare-icon.png",
    "./logo/cardBonusesIcons/alaska-icon.png",
    "./logo/cardBonusesIcons/amazon-icon.png",
    "./logo/cardBonusesIcons/citinights_Fri_Sat_6am_6pm_EST-icon.png",
    "./logo/cardBonusesIcons/cititravel-icon.png",
    "./logo/cardBonusesIcons/drugstore-icon.png",
    "./logo/cardBonusesIcons/electronic_store_software-icon.png",
    "./logo/cardBonusesIcons/EVcharging-icon.png",
    "./logo/cardBonusesIcons/foreign_transactions-icon.png",
    "./logo/cardBonusesIcons/fuel-icon.png",
    "./logo/cardBonusesIcons/groceries-icon.png",
    "./logo/cardBonusesIcons/gym-icon.png",
    "./logo/cardBonusesIcons/hilton_hotels-icon.png",
    "./logo/cardBonusesIcons/hotels-icon.png",
    "./logo/cardBonusesIcons/hyatt-icon.png",
    "./logo/cardBonusesIcons/internet-cable-phone-icon.png",
    "./logo/cardBonusesIcons/live_entertainment.png",
    "./logo/cardBonusesIcons/lyft-icon.png",
    "./logo/cardBonusesIcons/no-icon.png",
    "./logo/cardBonusesIcons/online_shopping-icon.png",
    "./logo/cardBonusesIcons/public_transportation-icon.png",
    "./logo/cardBonusesIcons/restaurants-icon.png",
    "./logo/cardBonusesIcons/rideshare-icon.png",
    "./logo/cardBonusesIcons/shipping-icon.png",
    "./logo/cardBonusesIcons/sporting_goods-icon.png",
    "./logo/cardBonusesIcons/streaming-icon.png",
    "./logo/cardBonusesIcons/travel-icon.png",
    "./logo/cardBonusesIcons/whole_foods-icon.png",
    "./favicon.ico",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await Promise.all(
                CORE_ASSETS.map(async (assetUrl) => {
                    try {
                        const response = await fetch(assetUrl, { cache: "no-store" });
                        if (response.ok) {
                            await cache.put(assetUrl, response.clone());
                        }
                    } catch (error) {
                        // Skip unavailable optional assets so install still succeeds.
                    }
                })
            );
        })()
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
            await self.clients.claim();
        })()
    );
});

function isHtmlNavigation(request) {
    if (request.mode === "navigate") return true;
    const accept = request.headers.get("accept") || "";
    return accept.includes("text/html");
}

function isScriptStyleOrJson(request) {
    const url = new URL(request.url);
    return /\.(js|css|json)$/i.test(url.pathname);
}

function isImageRequest(request) {
    if (request.destination === "image") return true;
    const url = new URL(request.url);
    return /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(url.pathname);
}

function isDatabaseRequest(request) {
    const url = new URL(request.url);
    return url.pathname.startsWith("/database/");
}

function isDebugRequest(request) {
    const url = new URL(request.url);
    return url.searchParams.get("debug") === "1";
}

async function matchRequestOrPath(cache, request) {
    const direct = await cache.match(request);
    if (direct) return direct;

    const url = new URL(request.url);
    const byPath = await cache.match(url.pathname);
    if (byPath) return byPath;

    return cache.match(`.${url.pathname}`);
}

async function networkFirst(request, fallbackUrl) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        const cached = await matchRequestOrPath(cache, request);
        if (cached) return cached;
        if (fallbackUrl) {
            const fallback = await cache.match(fallbackUrl);
            if (fallback) return fallback;
        }
        throw error;
    }
}

async function databaseNetworkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const debug = isDebugRequest(request);

    try {
        // Bypass browser HTTP cache for database payload freshness.
        const freshRequest = new Request(request, { cache: "no-store" });
        const networkResponse = await fetch(freshRequest);
        if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
        }
        if (debug) console.log("[SW] /database served from network:", new URL(request.url).pathname);
        return networkResponse;
    } catch (error) {
        const cached = await matchRequestOrPath(cache, request);
        if (cached) {
            if (debug) console.log("[SW] /database served from cache:", new URL(request.url).pathname);
            return cached;
        }
        if (debug) console.log("[SW] /database miss (network+cache):", new URL(request.url).pathname);
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await matchRequestOrPath(cache, request);
    if (cached) return cached;

    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
}

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isDatabaseRequest(request)) {
        event.respondWith(databaseNetworkFirst(request));
        return;
    }

    if (isHtmlNavigation(request)) {
        event.respondWith(networkFirst(request, "./offline.html"));
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
