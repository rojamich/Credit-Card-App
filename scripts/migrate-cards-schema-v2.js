const fs = require("fs");
const path = require("path");

const CARD_PATH = path.join(__dirname, "..", "database", "cards.json");
const VALID_NETWORKS = new Set(["visa", "amex", "mastercard", "discover"]);
const VALID_TIERS = new Set(["standard", "signature", "infinite", "world", "world-elite"]);

function normalizeId(raw) {
    return String(raw || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function normalizeNetwork(raw) {
    const value = String(raw || "").trim().toLowerCase();
    return VALID_NETWORKS.has(value) ? value : "visa";
}

function normalizeTier(raw) {
    const value = String(raw || "").trim().toLowerCase().replace(/\s+/g, "-");
    return VALID_TIERS.has(value) ? value : "standard";
}

function migrate(cards) {
    const seenIds = new Set();
    return cards.map((card, index) => {
        const baseId = normalizeId(card.id || card.card || card.name) || `card_${index + 1}`;
        let id = baseId;
        let suffix = 2;
        while (seenIds.has(id)) {
            id = `${baseId}_${suffix}`;
            suffix += 1;
        }
        seenIds.add(id);

        return {
            ...card,
            id,
            network: normalizeNetwork(card.network),
            tier: normalizeTier(card.tier),
            foreignTransactionFee: typeof card.foreignTransactionFee === "boolean" ? card.foreignTransactionFee : true,
        };
    });
}

function main() {
    const raw = fs.readFileSync(CARD_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("database/cards.json must be an array.");
    const migrated = migrate(parsed);
    fs.writeFileSync(CARD_PATH, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
    console.log(`Migrated ${migrated.length} cards to schema v2.`);
}

main();
