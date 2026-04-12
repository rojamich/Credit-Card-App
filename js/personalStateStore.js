(function attachPersonalStateStore(windowObject) {
    const STORAGE_KEY = "walletAppPrefs";
    const SCHEMA_VERSION = 1;
    const PROFILE_MICHAEL = "michael";
    const PROFILE_JENNA = "jenna";
    const PROFILE_BOTH = "both";
    const FILTER_ALL = "all";
    const FILTER_WALLET = "wallet";
    const FILTER_FAVORITES = "favorites";
    const FILTER_FAVORITES_WALLET = "favorites_wallet";
    const FIREBASE_APP_SCRIPT = "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js";
    const FIREBASE_FIRESTORE_SCRIPT = "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js";

    const dataStore = windowObject.CCDataStore || {};
    const normalizeBonusKey = typeof dataStore.normalizeBonusKey === "function"
        ? dataStore.normalizeBonusKey
        : (value) => String(value || "").toLowerCase().trim();

    let firebaseClientPromise = null;

    function createDefaultPersonalState() {
        return {
            version: 2,
            schemaVersion: SCHEMA_VERSION,
            updatedAt: "",
            updatedBy: "",
            activeProfile: PROFILE_MICHAEL,
            activeFilter: FILTER_WALLET,
            requireNoFtf: false,
            favoritesByCardId: {},
            profiles: {
                michael: { walletCardIds: [] },
                jenna: { walletCardIds: [] },
            },
            pinnedCategoriesByProfile: {
                michael: [],
                jenna: [],
            },
            usedOfferAttachmentsByProfile: {
                michael: {},
                jenna: {},
            },
            offerPublishQueue: [],
            lastOfferSpend: 50,
            lastWalletPurchasePrice: 50,
        };
    }

    function asStringArray(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    function asCategoryArray(value) {
        return asStringArray(value)
            .map((item) => normalizeBonusKey(item))
            .filter((item) => item && item !== "default");
    }

    function normalizeUsedMap(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
        const normalized = {};
        Object.entries(raw).forEach(([key, value]) => {
            if (!key || !value) return;
            if (value === true) {
                normalized[String(key)] = { used: true, usedAt: "" };
                return;
            }
            if (typeof value === "object" && value.used) {
                normalized[String(key)] = {
                    used: true,
                    usedAt: isValidIsoString(value.updatedAt) ? String(value.updatedAt) : String(value.usedAt || ""),
                };
            }
        });
        return normalized;
    }

    function normalizePublishQueue(rawQueue) {
        if (!Array.isArray(rawQueue)) return [];
        const dedupe = new Set();
        const list = [];
        rawQueue.forEach((item) => {
            if (!item || typeof item !== "object") return;
            const offerId = String(item.offerId || "").trim();
            const cardId = String(item.cardId || "").trim();
            const cardInstanceIdOrNull = item.cardInstanceIdOrNull ? String(item.cardInstanceIdOrNull).trim() : null;
            const profile = [PROFILE_MICHAEL, PROFILE_JENNA].includes(item.profile) ? item.profile : PROFILE_MICHAEL;
            if (!offerId || !cardId) return;
            const key = `${offerId}|${cardId}|${cardInstanceIdOrNull || ""}`;
            if (dedupe.has(key)) return;
            dedupe.add(key);
            list.push({
                offerId,
                cardId,
                cardInstanceIdOrNull,
                profile,
                usedAt: String(item.usedAt || ""),
            });
        });
        return list;
    }

    function isValidIsoString(value) {
        if (!value) return false;
        const parsed = new Date(value);
        return !Number.isNaN(parsed.getTime());
    }

    function normalizePersonalState(rawState) {
        const defaults = createDefaultPersonalState();
        const source = rawState && typeof rawState === "object" ? rawState : {};
        const sourceProfiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
        const sourcePins = source.pinnedCategoriesByProfile && typeof source.pinnedCategoriesByProfile === "object"
            ? source.pinnedCategoriesByProfile
            : {};
        const sourceUsed = source.usedOfferAttachmentsByProfile && typeof source.usedOfferAttachmentsByProfile === "object"
            ? source.usedOfferAttachmentsByProfile
            : {};
        const sourceFavoritesById = source.favoritesByCardId && typeof source.favoritesByCardId === "object"
            ? source.favoritesByCardId
            : {};
        const sourceFavoritesByKey = source.favoritesByCardKey && typeof source.favoritesByCardKey === "object"
            ? source.favoritesByCardKey
            : {};

        const favoritesByCardId = {};
        Object.keys(sourceFavoritesById).forEach((cardId) => {
            if (sourceFavoritesById[cardId]) favoritesByCardId[String(cardId)] = true;
        });
        Object.keys(sourceFavoritesByKey).forEach((legacyKey) => {
            if (sourceFavoritesByKey[legacyKey]) favoritesByCardId[String(legacyKey)] = true;
        });

        return {
            version: 2,
            schemaVersion: Number.isFinite(Number(source.schemaVersion))
                ? Math.max(SCHEMA_VERSION, Number(source.schemaVersion))
                : defaults.schemaVersion,
            updatedAt: isValidIsoString(source.updatedAt) ? String(source.updatedAt) : "",
            updatedBy: String(source.updatedBy || "").trim(),
            activeProfile: [PROFILE_MICHAEL, PROFILE_JENNA, PROFILE_BOTH].includes(source.activeProfile)
                ? source.activeProfile
                : defaults.activeProfile,
            activeFilter: [FILTER_ALL, FILTER_WALLET, FILTER_FAVORITES, FILTER_FAVORITES_WALLET].includes(source.activeFilter)
                ? source.activeFilter
                : defaults.activeFilter,
            requireNoFtf: Boolean(source.requireNoFtf),
            favoritesByCardId,
            profiles: {
                michael: {
                    walletCardIds: [
                        ...asStringArray(sourceProfiles.michael && sourceProfiles.michael.walletCardIds),
                        ...asStringArray(sourceProfiles.michael && sourceProfiles.michael.walletCardKeys),
                    ],
                },
                jenna: {
                    walletCardIds: [
                        ...asStringArray(sourceProfiles.jenna && sourceProfiles.jenna.walletCardIds),
                        ...asStringArray(sourceProfiles.jenna && sourceProfiles.jenna.walletCardKeys),
                    ],
                },
            },
            pinnedCategoriesByProfile: {
                michael: asCategoryArray(sourcePins.michael),
                jenna: asCategoryArray(sourcePins.jenna),
            },
            usedOfferAttachmentsByProfile: {
                michael: normalizeUsedMap(sourceUsed.michael),
                jenna: normalizeUsedMap(sourceUsed.jenna),
            },
            offerPublishQueue: normalizePublishQueue(source.offerPublishQueue),
            lastOfferSpend: Number.isFinite(Number(source.lastOfferSpend))
                ? Number(source.lastOfferSpend)
                : defaults.lastOfferSpend,
            lastWalletPurchasePrice: Number.isFinite(Number(source.lastWalletPurchasePrice))
                ? Number(source.lastWalletPurchasePrice)
                : defaults.lastWalletPurchasePrice,
        };
    }

    function getTimestampValue(state) {
        const iso = state && isValidIsoString(state.updatedAt) ? state.updatedAt : "";
        return iso ? new Date(iso).getTime() : 0;
    }

    function unionStringArrays(left, right) {
        return Array.from(new Set([...asStringArray(left), ...asStringArray(right)]));
    }

    function mergeUsedMaps(localMap, remoteMap) {
        const merged = {};
        const normalizedLocal = normalizeUsedMap(localMap);
        const normalizedRemote = normalizeUsedMap(remoteMap);
        const keys = new Set([...Object.keys(normalizedLocal), ...Object.keys(normalizedRemote)]);
        keys.forEach((key) => {
            const localEntry = normalizedLocal[key];
            const remoteEntry = normalizedRemote[key];
            if (localEntry && remoteEntry) {
                const localTime = isValidIsoString(localEntry.usedAt) ? new Date(localEntry.usedAt).getTime() : 0;
                const remoteTime = isValidIsoString(remoteEntry.usedAt) ? new Date(remoteEntry.usedAt).getTime() : 0;
                merged[key] = remoteTime >= localTime ? remoteEntry : localEntry;
                return;
            }
            merged[key] = remoteEntry || localEntry;
        });
        return merged;
    }

    function chooseScalar(localState, remoteState, key, fallbackValue) {
        const localValue = localState[key];
        const remoteValue = remoteState[key];
        const localValid = typeof localValue !== "undefined" && localValue !== null && localValue !== "";
        const remoteValid = typeof remoteValue !== "undefined" && remoteValue !== null && remoteValue !== "";
        if (localValid && !remoteValid) return localValue;
        if (!localValid && remoteValid) return remoteValue;
        if (!localValid && !remoteValid) return fallbackValue;
        return getTimestampValue(remoteState) >= getTimestampValue(localState) ? remoteValue : localValue;
    }

    function mergePersonalState(localState, remoteState) {
        const local = normalizePersonalState(localState);
        const remote = normalizePersonalState(remoteState);
        const defaults = createDefaultPersonalState();
        const mergedFavorites = { ...local.favoritesByCardId, ...remote.favoritesByCardId };
        const merged = {
            version: 2,
            schemaVersion: Math.max(local.schemaVersion || SCHEMA_VERSION, remote.schemaVersion || SCHEMA_VERSION),
            updatedAt: getTimestampValue(remote) >= getTimestampValue(local) ? remote.updatedAt : local.updatedAt,
            updatedBy: getTimestampValue(remote) >= getTimestampValue(local) ? remote.updatedBy : local.updatedBy,
            activeProfile: chooseScalar(local, remote, "activeProfile", defaults.activeProfile),
            activeFilter: chooseScalar(local, remote, "activeFilter", defaults.activeFilter),
            requireNoFtf: Boolean(chooseScalar(local, remote, "requireNoFtf", defaults.requireNoFtf)),
            favoritesByCardId: mergedFavorites,
            profiles: {
                michael: {
                    walletCardIds: unionStringArrays(
                        local.profiles.michael && local.profiles.michael.walletCardIds,
                        remote.profiles.michael && remote.profiles.michael.walletCardIds,
                    ),
                },
                jenna: {
                    walletCardIds: unionStringArrays(
                        local.profiles.jenna && local.profiles.jenna.walletCardIds,
                        remote.profiles.jenna && remote.profiles.jenna.walletCardIds,
                    ),
                },
            },
            pinnedCategoriesByProfile: {
                michael: unionStringArrays(local.pinnedCategoriesByProfile.michael, remote.pinnedCategoriesByProfile.michael),
                jenna: unionStringArrays(local.pinnedCategoriesByProfile.jenna, remote.pinnedCategoriesByProfile.jenna),
            },
            usedOfferAttachmentsByProfile: {
                michael: mergeUsedMaps(local.usedOfferAttachmentsByProfile.michael, remote.usedOfferAttachmentsByProfile.michael),
                jenna: mergeUsedMaps(local.usedOfferAttachmentsByProfile.jenna, remote.usedOfferAttachmentsByProfile.jenna),
            },
            offerPublishQueue: normalizePublishQueue([...(local.offerPublishQueue || []), ...(remote.offerPublishQueue || [])]),
            lastOfferSpend: chooseScalar(local, remote, "lastOfferSpend", defaults.lastOfferSpend),
            lastWalletPurchasePrice: chooseScalar(local, remote, "lastWalletPurchasePrice", defaults.lastWalletPurchasePrice),
        };

        return normalizePersonalState(merged);
    }

    function serializeState(state) {
        return JSON.stringify(normalizePersonalState(state));
    }

    function loadLocalPersonalState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return {
                    exists: false,
                    state: createDefaultPersonalState(),
                };
            }
            return {
                exists: true,
                state: normalizePersonalState(JSON.parse(raw)),
            };
        } catch (error) {
            return {
                exists: false,
                state: createDefaultPersonalState(),
            };
        }
    }

    function saveLocalPersonalState(state) {
        const normalized = normalizePersonalState(state);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (error) {
            // Ignore storage write failures.
        }
        return normalized;
    }

    function getFirebaseConfig() {
        // Provide Firebase config through a global set before this script runs,
        // for example: window.CCFirebasePersonalStateConfig = { ...firebaseConfig };
        const config = windowObject.CCFirebasePersonalStateConfig;
        return config && typeof config === "object" ? config : null;
    }

    function getFirebaseDocPath() {
        // Optional override for future auth-aware upgrades. Defaults to appState/shared.
        const raw = windowObject.CCFirebasePersonalStateDocPath;
        if (Array.isArray(raw) && raw.length >= 2 && raw.length % 2 === 0) {
            return raw.map((segment) => String(segment || "").trim()).filter(Boolean);
        }
        if (typeof raw === "string") {
            const parsed = raw.split("/").map((segment) => segment.trim()).filter(Boolean);
            if (parsed.length >= 2 && parsed.length % 2 === 0) return parsed;
        }
        return ["appState", "shared"];
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-personal-state-src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === "true") {
                    resolve();
                    return;
                }
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.dataset.personalStateSrc = src;
            script.addEventListener("load", () => {
                script.dataset.loaded = "true";
                resolve();
            }, { once: true });
            script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
            document.head.appendChild(script);
        });
    }

    async function ensureFirebaseClient() {
        const config = getFirebaseConfig();
        if (!config) return null;
        if (firebaseClientPromise) return firebaseClientPromise;

        firebaseClientPromise = (async () => {
            if (!windowObject.firebase || !windowObject.firebase.apps) {
                await loadScript(FIREBASE_APP_SCRIPT);
                await loadScript(FIREBASE_FIRESTORE_SCRIPT);
            }
            if (!windowObject.firebase || typeof windowObject.firebase.initializeApp !== "function") return null;
            let app = null;
            const appName = String(config.appName || "").trim();
            if (appName) {
                try {
                    app = windowObject.firebase.app(appName);
                } catch (error) {
                    app = windowObject.firebase.initializeApp(config, appName);
                }
            } else if (windowObject.firebase.apps && windowObject.firebase.apps.length) {
                app = windowObject.firebase.app();
            } else {
                app = windowObject.firebase.initializeApp(config);
            }
            if (!app || typeof app.firestore !== "function") return null;
            return { firestore: app.firestore() };
        })().catch(() => null);

        return firebaseClientPromise;
    }

    function getRemoteDocRef(firestore) {
        const path = getFirebaseDocPath();
        let ref = firestore;
        for (let index = 0; index < path.length; index += 2) {
            ref = ref.collection(path[index]).doc(path[index + 1]);
        }
        return ref;
    }

    async function loadRemotePersonalState() {
        const client = await ensureFirebaseClient();
        if (!client) {
            return {
                enabled: false,
                exists: false,
                state: null,
            };
        }
        const snapshot = await getRemoteDocRef(client.firestore).get();
        if (!snapshot.exists) {
            return {
                enabled: true,
                exists: false,
                state: null,
            };
        }
        return {
            enabled: true,
            exists: true,
            state: normalizePersonalState(snapshot.data()),
        };
    }

    async function saveRemotePersonalState(state) {
        const client = await ensureFirebaseClient();
        if (!client) return false;
        await getRemoteDocRef(client.firestore).set(normalizePersonalState(state), { merge: true });
        return true;
    }

    function stampStateForSave(nextState, updatedBy) {
        const normalized = normalizePersonalState(nextState);
        normalized.updatedAt = new Date().toISOString();
        normalized.updatedBy = String(updatedBy || windowObject.location.pathname || "app").trim();
        normalized.schemaVersion = SCHEMA_VERSION;
        return normalized;
    }

    async function loadPersonalState() {
        const local = loadLocalPersonalState();
        let remote = {
            enabled: false,
            exists: false,
            state: null,
        };

        try {
            remote = await loadRemotePersonalState();
        } catch (error) {
            remote = {
                enabled: false,
                exists: false,
                state: null,
            };
        }

        const merged = remote.exists
            ? mergePersonalState(local.state, remote.state)
            : normalizePersonalState(local.state);
        const cached = saveLocalPersonalState(merged);

        const shouldSeedRemote = remote.enabled && (!remote.exists || serializeState(remote.state) !== serializeState(cached));
        if (shouldSeedRemote) {
            try {
                await saveRemotePersonalState(cached);
            } catch (error) {
                // Keep local cache as source of truth while offline or unavailable.
            }
        }

        return {
            state: cached,
            localExists: local.exists,
            remoteExists: remote.exists,
            remoteEnabled: remote.enabled,
        };
    }

    async function savePersonalState(nextState, options) {
        const stamped = stampStateForSave(nextState, options && options.updatedBy);
        const cached = saveLocalPersonalState(stamped);
        let remoteSaved = false;
        try {
            remoteSaved = await saveRemotePersonalState(cached);
        } catch (error) {
            remoteSaved = false;
        }
        return {
            state: cached,
            remoteSaved,
        };
    }

    windowObject.CCPersonalStateStore = {
        STORAGE_KEY,
        SCHEMA_VERSION,
        createDefaultPersonalState,
        normalizePersonalState,
        loadLocalPersonalState,
        saveLocalPersonalState,
        loadPersonalState,
        savePersonalState,
        mergePersonalState,
    };
}(window));
