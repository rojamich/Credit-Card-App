const fs = require("fs");
const path = require("path");

const CARD_PATH = path.join(__dirname, "..", "database", "cards.json");
const ALLOWED_NETWORKS = new Set(["visa", "amex", "mastercard", "discover"]);
const ALLOWED_TIERS = new Set(["standard", "signature", "infinite", "world", "world-elite"]);

function inferNetworkTierFromName(cardName) {
    const name = String(cardName || "").toLowerCase();

    if (name.includes("visa infinite")) return { network: "visa", tier: "infinite" };
    if (name.includes("visa signature")) return { network: "visa", tier: "signature" };
    if (name.includes("american express") || name.includes("amex")) return { network: "amex", tier: "standard" };
    if (name.includes("mastercard world elite")) return { network: "mastercard", tier: "world-elite" };
    if (name.includes("mastercard")) return { network: "mastercard", tier: "world" };

    if (name.includes("visa")) return { network: "visa", tier: "standard" };
    if (name.includes("discover")) return { network: "discover", tier: "standard" };
    return { network: "visa", tier: "standard" };
}

function normalizeField(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");
}

function migrateCards(cards) {
    return cards.map((card) => {
        const currentNetwork = normalizeField(card.network);
        const currentTier = normalizeField(card.tier);

        if (ALLOWED_NETWORKS.has(currentNetwork) && ALLOWED_TIERS.has(currentTier)) {
            return card;
        }

        const inferred = inferNetworkTierFromName(card.card || card.name || "");
        return {
            ...card,
            network: ALLOWED_NETWORKS.has(currentNetwork) ? currentNetwork : inferred.network,
            tier: ALLOWED_TIERS.has(currentTier) ? currentTier : inferred.tier,
        };
    });
}

function main() {
    const raw = fs.readFileSync(CARD_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error("database/cards.json must be an array.");
    }

    const migrated = migrateCards(parsed);
    fs.writeFileSync(CARD_PATH, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
    console.log(`Migrated ${migrated.length} cards with network/tier fields.`);
}

main();
