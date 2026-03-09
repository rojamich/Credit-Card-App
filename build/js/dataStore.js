const BANKS_STORAGE_KEY = "ccapp_banks_v1";
const CARDS_STORAGE_KEY = "ccapp_cards_v1";
const OFFERS_STORAGE_KEY = "ccapp_offers_v1";
const ALLOWED_CARD_NETWORKS = ["visa", "amex", "mastercard", "discover"];
const ALLOWED_CARD_TIERS = ["standard", "signature", "infinite", "world", "world-elite"];
const CATEGORY_DEFS = Object.freeze({
    restaurants: { label: "Restaurants" },
    groceries: { label: "Groceries" },
    fuel: { label: "Fuel" },
    travel: { label: "Travel" },
    airfare: { label: "Airfare" },
    rideshare: { label: "Rideshare" },
    online_shopping: { label: "Online Shopping" },
    foreign_transactions: { label: "Foreign Transactions" },
    drugstore: { label: "Drugstore" },
    streaming: { label: "Streaming" },
    public_transportation: { label: "Public Transportation" },
});
const BANK_VALUE_MAP = new Map();

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

function normalizeCardNetwork(raw) {
    const normalized = String(raw || "").toLowerCase().trim();
    if (!ALLOWED_CARD_NETWORKS.includes(normalized)) return "";
    return normalized;
}

function normalizeCardTier(raw) {
    const normalized = String(raw || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");
    if (!ALLOWED_CARD_TIERS.includes(normalized)) return "";
    return normalized;
}

function normalizeCardId(raw) {
    return normalizeBonusKey(raw);
}

function normalizeOfferId(raw) {
    return normalizeBonusKey(raw);
}

function normalizeOfferType(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (["percent", "fixed", "points"].includes(value)) return value;
    return "";
}

function normalizeProvider(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (["chase", "amex", "other"].includes(value)) return value;
    return "other";
}

function toIsoDateOrEmpty(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return "";
}

function coerceBoolean(value, defaultValue) {
    if (typeof value === "boolean") return value;
    if (value === null || typeof value === "undefined" || value === "") return defaultValue;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["false", "0", "no", "off", "n"].includes(normalized)) return false;
        if (["true", "1", "yes", "on", "y"].includes(normalized)) return true;
    }
    return Boolean(value);
}

function normalizeCardInstances(rawInstances) {
    if (!Array.isArray(rawInstances)) return [];
    const seen = new Set();
    return rawInstances
        .filter((item) => item && typeof item === "object")
        .map((item) => {
            const id = normalizeCardId(item.id || item.label || "");
            const label = String(item.label || "").trim();
            const last4Raw = String(item.last4 ?? "").trim();
            const last4 = /^\d{4}$/.test(last4Raw) ? last4Raw : null;
            return { id, label, last4 };
        })
        .filter((item) => item.id)
        .filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
}

function coerceInWallet(value) {
    if (typeof value === "boolean") return value;
    if (value === null || typeof value === "undefined" || value === "") return true;
    if (typeof value === "number") return value !== 0;

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return true;
        if (["false", "0", "no", "off", "n"].includes(normalized)) return false;
        if (["true", "1", "yes", "on", "y"].includes(normalized)) return true;
    }

    return Boolean(value);
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

    const normalizedBanks = payload
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

    BANK_VALUE_MAP.clear();
    normalizedBanks.forEach((bank) => {
        BANK_VALUE_MAP.set(normalizeBankKey(bank.key), Number(bank.value) || 1);
    });

    return normalizedBanks;
}

function getBankValue(bankKey) {
    const normalizedKey = normalizeBankKey(bankKey);
    if (!normalizedKey) return 1;
    return Number(BANK_VALUE_MAP.get(normalizedKey)) || 1;
}

function validateAndNormalizeCards(payload) {
    const errors = [];
    if (!Array.isArray(payload)) {
        return { ok: false, data: [], errors: ["Card data must be an array."] };
    }

    const data = payload.map((card, index) => {
        const cardNum = index + 1;
        const normalized = {
            id: "",
            card: "",
            bank: "",
            photo: "",
            photoPath: "",
            inWallet: true,
            network: "visa",
            tier: "standard",
            foreignTransactionFee: true,
            instances: [],
            bonuses: { default: 1 },
        };

        if (!card || typeof card !== "object") {
            errors.push(`Card ${cardNum}: must be an object.`);
            return normalized;
        }

        normalized.card = String(card.card ?? card.name ?? "").trim();
        normalized.bank = String(card.bank ?? "").trim();
        normalized.id = normalizeCardId(card.id ?? card.cardId ?? card.key ?? normalized.card);
        normalized.photo = String(card.photo ?? card.image ?? card.photoPath ?? "").trim();
        normalized.photoPath = normalized.photo;
        normalized.inWallet = coerceInWallet(card.inWallet);
        normalized.instances = normalizeCardInstances(card.instances);
        const hasNetworkField = Object.prototype.hasOwnProperty.call(card, "network");
        const hasTierField = Object.prototype.hasOwnProperty.call(card, "tier");
        normalized.network = normalizeCardNetwork(card.network);
        normalized.tier = normalizeCardTier(card.tier);
        normalized.foreignTransactionFee = coerceBoolean(card.foreignTransactionFee, true);

        if (Object.prototype.hasOwnProperty.call(card, "annualFee") && card.annualFee !== "" && card.annualFee !== null) {
            const annualFeeValue = toFiniteNumber(card.annualFee);
            if (annualFeeValue === null) {
                errors.push(`Card ${cardNum}: annual fee must be numeric when provided.`);
            } else {
                normalized.annualFee = annualFeeValue;
            }
        }

        if (Object.prototype.hasOwnProperty.call(card, "notes")) {
            normalized.notes = String(card.notes ?? "").trim();
        }

        if (Object.prototype.hasOwnProperty.call(card, "tags") && Array.isArray(card.tags)) {
            normalized.tags = card.tags.map((tag) => String(tag).trim()).filter(Boolean);
        }

        if (!normalized.card) errors.push(`Card ${cardNum}: card name is required.`);
        if (!normalized.bank) errors.push(`Card ${cardNum}: bank is required.`);
        if (!normalized.id) errors.push(`Card ${cardNum}: id is required.`);
        if (hasNetworkField && !normalized.network) {
            errors.push(`Card ${cardNum}: network must be one of ${ALLOWED_CARD_NETWORKS.join(", ")}.`);
        }
        if (hasTierField && !normalized.tier) {
            errors.push(`Card ${cardNum}: tier must be one of ${ALLOWED_CARD_TIERS.join(", ")}.`);
        }
        if (!normalized.network) normalized.network = "visa";
        if (!normalized.tier) normalized.tier = "standard";

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

    const seenIds = new Set();
    data.forEach((card, index) => {
        if (!card.id) card.id = `card_${index + 1}`;
        let nextId = card.id;
        let suffix = 2;
        while (seenIds.has(nextId)) {
            nextId = `${card.id}_${suffix}`;
            suffix += 1;
        }
        card.id = nextId;
        seenIds.add(nextId);
    });

    return { ok: errors.length === 0, data, errors };
}

function validateAndNormalizeOffers(payload) {
    const errors = [];
    if (!Array.isArray(payload)) {
        return { ok: false, data: [], errors: ["Offer data must be an array."] };
    }

    const seenIds = new Set();
    const data = payload.map((offer, index) => {
        const row = index + 1;
        const normalized = {
            id: "",
            merchantKey: "",
            merchantName: "",
            provider: "other",
            expires: "",
            startDate: "",
            categories: [],
            offerType: "",
            rate: null,
            maxDiscount: null,
            minSpend: null,
            fixedAmount: null,
            points: null,
            programKey: "",
            aliases: [],
            notes: "",
            logo: "",
            attachments: [],
        };

        if (!offer || typeof offer !== "object") {
            errors.push(`Offer ${row}: must be an object.`);
            return normalized;
        }

        normalized.id = normalizeOfferId(offer.id || offer.merchantName || `offer_${row}`);
        normalized.merchantKey = normalizeBonusKey(offer.merchantKey || offer.merchantName);
        normalized.merchantName = String(offer.merchantName || "").trim();
        normalized.provider = normalizeProvider(offer.provider);
        normalized.expires = toIsoDateOrEmpty(offer.expires);
        normalized.startDate = toIsoDateOrEmpty(offer.startDate);
        normalized.offerType = normalizeOfferType(offer.offerType);
        normalized.programKey = normalizeBankKey(offer.programKey || offer.program || "");
        normalized.notes = String(offer.notes || "").trim();
        normalized.logo = String(offer.logo || offer.logoPath || "").trim();
        normalized.aliases = Array.isArray(offer.aliases) ? offer.aliases.map((alias) => String(alias || "").trim()).filter(Boolean) : [];
        normalized.categories = Array.isArray(offer.categories)
            ? offer.categories.map((key) => normalizeBonusKey(key)).filter((key) => key && key !== "default")
            : [];

        if (!normalized.id) errors.push(`Offer ${row}: id is required.`);
        if (!normalized.merchantKey) errors.push(`Offer ${row}: merchantKey is required.`);
        if (!normalized.merchantName) errors.push(`Offer ${row}: merchantName is required.`);
        if (!normalized.expires) errors.push(`Offer ${row}: expires must be YYYY-MM-DD.`);
        if (!normalized.offerType) errors.push(`Offer ${row}: offerType must be percent|fixed|points.`);

        const rate = toFiniteNumber(offer.rate);
        const maxDiscount = toFiniteNumber(offer.maxDiscount);
        const minSpend = toFiniteNumber(offer.minSpend);
        const fixedAmount = toFiniteNumber(offer.fixedAmount);
        const points = toFiniteNumber(offer.points);

        normalized.rate = rate;
        normalized.maxDiscount = maxDiscount;
        normalized.minSpend = minSpend;
        normalized.fixedAmount = fixedAmount;
        normalized.points = points;

        if (normalized.offerType === "percent" && (rate === null || rate < 0)) {
            errors.push(`Offer ${row}: percent offers require rate >= 0.`);
        }
        if (normalized.offerType === "fixed" && (fixedAmount === null || fixedAmount < 0)) {
            errors.push(`Offer ${row}: fixed offers require fixedAmount >= 0.`);
        }
        if (normalized.offerType === "points" && (points === null || points < 0)) {
            errors.push(`Offer ${row}: points offers require points >= 0.`);
        }

        normalized.attachments = Array.isArray(offer.attachments)
            ? offer.attachments
                .filter((item) => item && typeof item === "object")
                .map((item) => ({
                    cardId: normalizeCardId(item.cardId),
                    cardInstanceId: normalizeCardId(item.cardInstanceId || ""),
                    note: String(item.note || "").trim(),
                }))
                .filter((item) => item.cardId)
            : [];

        if (seenIds.has(normalized.id)) errors.push(`Offer ${row}: duplicate id "${normalized.id}".`);
        else seenIds.add(normalized.id);

        return normalized;
    });

    return { ok: errors.length === 0, data, errors };
}

function normalizeOffersForRuntime(payload) {
    const validation = validateAndNormalizeOffers(payload);
    return validation.data;
}

function normalizeCardsForRuntime(payload) {
    if (!Array.isArray(payload)) return [];

    return payload
        .filter((card) => card && typeof card === "object")
        .map((card) => {
            const cardName = String(card.card ?? card.name ?? "").trim();
            const bank = String(card.bank ?? "").trim();
            const photo = String(card.photo ?? card.image ?? card.photoPath ?? "").trim();
            const id = normalizeCardId(card.id ?? card.cardId ?? card.key ?? cardName);
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

            const normalized = {
                id: id || "",
                card: cardName,
                bank,
                photo,
                photoPath: photo,
                inWallet: coerceInWallet(card.inWallet),
                network: normalizeCardNetwork(card.network) || "visa",
                tier: normalizeCardTier(card.tier) || "standard",
                foreignTransactionFee: coerceBoolean(card.foreignTransactionFee, true),
                instances: normalizeCardInstances(card.instances),
                bonuses,
            };

            if (Object.prototype.hasOwnProperty.call(card, "annualFee") && card.annualFee !== "" && card.annualFee !== null) {
                const annualFeeValue = toFiniteNumber(card.annualFee);
                if (annualFeeValue !== null) normalized.annualFee = annualFeeValue;
            }

            if (Object.prototype.hasOwnProperty.call(card, "notes")) {
                normalized.notes = String(card.notes ?? "").trim();
            }

            if (Object.prototype.hasOwnProperty.call(card, "tags") && Array.isArray(card.tags)) {
                normalized.tags = card.tags.map((tag) => String(tag).trim()).filter(Boolean);
            }

            return normalized;
        })
        .filter((card) => card.card)
        .map((card, index, all) => {
            if (card.id) return card;
            return { ...card, id: normalizeCardId(card.card) || `card_${index + 1}` };
        })
        .map((card, index, all) => {
            const existing = new Set(all.slice(0, index).map((item) => item.id));
            if (!existing.has(card.id)) return card;
            let suffix = 2;
            let nextId = `${card.id}_${suffix}`;
            while (existing.has(nextId)) {
                suffix += 1;
                nextId = `${card.id}_${suffix}`;
            }
            return { ...card, id: nextId };
        });
}

function getCategoryLabel(key) {
    const normalized = normalizeBonusKey(key);
    if (!normalized) return "";
    if (CATEGORY_DEFS[normalized] && CATEGORY_DEFS[normalized].label) {
        return CATEGORY_DEFS[normalized].label;
    }
    return prettyLabelFromKey(normalized);
}

function getCategoryDefsFromCards(payload) {
    if (!Array.isArray(payload)) return [];
    const set = new Set();
    payload.forEach((card) => {
        const bonuses = card && card.bonuses && typeof card.bonuses === "object" && !Array.isArray(card.bonuses)
            ? card.bonuses
            : {};
        Object.keys(bonuses).forEach((key) => {
            const normalized = normalizeBonusKey(key);
            if (!normalized || normalized === "default") return;
            set.add(normalized);
        });
    });

    return Array.from(set)
        .map((key) => ({ key, label: getCategoryLabel(key) }))
        .sort((a, b) => a.label.localeCompare(b.label));
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
    OFFERS_STORAGE_KEY,
    loadDataset,
    readLocalJson,
    writeLocalJson,
    normalizeBonusKey,
    normalizeBankName,
    normalizeBankKey,
    prettyLabelFromKey,
    validateAndNormalizeBanks,
    validateAndNormalizeCards,
    validateAndNormalizeOffers,
    normalizeBanksForRuntime,
    normalizeCardsForRuntime,
    normalizeOffersForRuntime,
    normalizeCardNetwork,
    normalizeCardTier,
    normalizeCardId,
    normalizeOfferId,
    getBankValue,
    ALLOWED_CARD_NETWORKS,
    ALLOWED_CARD_TIERS,
    CATEGORY_DEFS,
    getCategoryDefsFromCards,
    getCategoryLabel,
};
