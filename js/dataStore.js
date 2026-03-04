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

function normalizeBonusKey(rawKey) {
    return String(rawKey || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function normalizeBankName(name) {
    return String(name || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeBankKey(raw) {
    return normalizeBonusKey(raw);
}

function prettyLabelFromKey(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";

    const withSpaces = text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    return withSpaces
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function toFiniteNumber(value) {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

function validateAndNormalizeBanks(payload) {
    const errors = [];
    if (!Array.isArray(payload)) {
        return { ok: false, data: [], errors: ["Bank data must be an array."] };
    }

    const seenKeys = new Map();

    const data = payload.map((bank, index) => {
        const row = index + 1;
        const normalized = {
            key: "",
            label: "",
            type: "",
            value: 1,
        };

        if (!bank || typeof bank !== "object") {
            errors.push(`Row ${row}: must be an object.`);
            return normalized;
        }

        const rawKey = String(bank.key ?? bank.name ?? "").trim();
        normalized.key = normalizeBankKey(rawKey);
        normalized.label = String(bank.label ?? prettyLabelFromKey(rawKey)).trim();
        normalized.type = String(bank.type ?? "").trim();

        if (!normalized.key) errors.push(`Row ${row}: bank key is required.`);
        if (!normalized.label) errors.push(`Row ${row}: bank label is required.`);
        if (!normalized.type) errors.push(`Row ${row}: reward type is required.`);

        if (normalized.key) {
            if (seenKeys.has(normalized.key)) {
                errors.push(`Row ${row}: duplicate bank key "${normalized.key}".`);
            } else {
                seenKeys.set(normalized.key, row);
            }
        }

        const rawValue = bank.value;
        const isBlankValue = rawValue === "" || rawValue === null || typeof rawValue === "undefined";
        if (isBlankValue) {
            normalized.value = 1;
        } else {
            const num = toFiniteNumber(rawValue);
            if (num === null) {
                errors.push(`Row ${row}: multiplier must be a valid number.`);
            } else if (num < 0) {
                errors.push(`Row ${row}: multiplier must be >= 0.`);
            } else {
                normalized.value = num;
            }
        }

        return normalized;
    });

    return { ok: errors.length === 0, data, errors };
}

function normalizeBanksForRuntime(payload) {
    if (!Array.isArray(payload)) return [];

    const seen = new Set();

    return payload
        .filter((bank) => bank && typeof bank === "object")
        .map((bank) => {
            const rawKey = String(bank.key ?? bank.name ?? "").trim();
            const key = normalizeBankKey(rawKey);
            const label = String(bank.label ?? prettyLabelFromKey(rawKey)).trim() || prettyLabelFromKey(rawKey);
            const type = String(bank.type ?? "").trim() || "Cash Back";
            const parsed = toFiniteNumber(bank.value);
            return {
                key,
                label,
                type,
                value: parsed === null || parsed < 0 ? 1 : parsed,
            };
        })
        .filter((bank) => bank.key)
        .filter((bank) => {
            if (seen.has(bank.key)) return false;
            seen.add(bank.key);
            return true;
        });
}

function validateAndNormalizeCards(payload) {
    const errors = [];
    if (!Array.isArray(payload)) {
        return { ok: false, data: [], errors: ["Card data must be an array."] };
    }

    const data = payload.map((card, index) => {
        const cardNum = index + 1;
        const normalized = {
            card: "",
            bank: "",
            photoPath: "",
            bonuses: { default: 1 },
        };

        if (!card || typeof card !== "object") {
            errors.push(`Card ${cardNum}: must be an object.`);
            return normalized;
        }

        normalized.card = String(card.card ?? "").trim();
        normalized.bank = String(card.bank ?? "").trim();
        normalized.photoPath = String(card.photoPath ?? "").trim();

        if (!normalized.card) errors.push(`Card ${cardNum}: card name is required.`);
        if (!normalized.bank) errors.push(`Card ${cardNum}: bank is required.`);

        if (!card.bonuses || typeof card.bonuses !== "object" || Array.isArray(card.bonuses)) {
            errors.push(`Card ${cardNum}: bonuses must be an object.`);
            return normalized;
        }

        const bonusEntries = Object.entries(card.bonuses);
        const normalizedBonuses = {};

        for (const [rawKey, rawValue] of bonusEntries) {
            const key = normalizeBonusKey(rawKey);
            if (!key) {
                errors.push(`Card ${cardNum}: invalid bonus key "${rawKey}".`);
                continue;
            }

            const value = toFiniteNumber(rawValue);
            if (value === null) {
                if (key === "default") {
                    errors.push(`Card ${cardNum}: bonuses.default must be numeric.`);
                } else {
                    errors.push(`Card ${cardNum}: bonus "${rawKey}" must be numeric.`);
                }
                continue;
            }

            normalizedBonuses[key] = value;
        }

        if (!Object.prototype.hasOwnProperty.call(normalizedBonuses, "default")) {
            normalizedBonuses.default = 1;
        }

        normalized.bonuses = normalizedBonuses;
        return normalized;
    });

    return { ok: errors.length === 0, data, errors };
}

function normalizeCardsForRuntime(payload) {
    if (!Array.isArray(payload)) return [];

    return payload
        .filter((card) => card && typeof card === "object")
        .map((card) => {
            const cardName = String(card.card ?? "").trim();
            const bank = String(card.bank ?? "").trim();
            const photoPath = String(card.photoPath ?? "").trim();
            const rawBonuses = card.bonuses && typeof card.bonuses === "object" && !Array.isArray(card.bonuses)
                ? card.bonuses
                : {};

            const bonuses = {};
            for (const [rawKey, rawValue] of Object.entries(rawBonuses)) {
                const key = normalizeBonusKey(rawKey);
                if (!key) continue;
                const value = toFiniteNumber(rawValue);
                if (value === null) continue;
                bonuses[key] = value;
            }

            if (!Object.prototype.hasOwnProperty.call(bonuses, "default")) {
                bonuses.default = 1;
            } else {
                const defaultValue = toFiniteNumber(bonuses.default);
                bonuses.default = defaultValue === null ? 1 : defaultValue;
            }

            return {
                card: cardName,
                bank,
                photoPath,
                bonuses,
            };
        })
        .filter((card) => card.card);
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
    normalizeBonusKey,
    normalizeBankName,
    normalizeBankKey,
    prettyLabelFromKey,
    validateAndNormalizeBanks,
    validateAndNormalizeCards,
    normalizeBanksForRuntime,
    normalizeCardsForRuntime,
};
