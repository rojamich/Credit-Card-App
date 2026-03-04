const BANKS_STORAGE_KEY = "ccapp_banks_v1";
const CARDS_STORAGE_KEY = "ccapp_cards_v1";

function readLocalJson(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function writeLocalJson(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return response.json();
}

async function loadDataset(storageKey, fallbackPath) {
    const localData = readLocalJson(storageKey);
    if (localData) return localData;

    const defaultData = await fetchJson(fallbackPath);
    writeLocalJson(storageKey, defaultData);
    return defaultData;
}

window.CCDataStore = {
    BANKS_STORAGE_KEY,
    CARDS_STORAGE_KEY,
    loadDataset,
    readLocalJson,
    writeLocalJson,
};
