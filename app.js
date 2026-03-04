// Setup
const fs = require("fs");
const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const port = process.env.PORT || 3000;

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log("== New Request");
    console.log(" -- URL:", req.url);
    console.log(" -- Body:", req.body);
    console.log("----------------------------------------------------");
    next();
});

/*----------------------------------------------------------------
Routes
----------------------------------------------------------------*/

const cardsDataPath = path.join(__dirname, "database", "cardsData.json");
const bankDataPath = path.join(__dirname, "database", "bankData.json");

function readJson(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
}

function writeJson(filePath, data) {
    const formatted = `${JSON.stringify(data, null, 2)}\n`;
    fs.writeFileSync(filePath, formatted, "utf8");
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function validateBanksPayload(payload) {
    if (!Array.isArray(payload)) return "Banks payload must be an array.";
    for (const bank of payload) {
        if (!bank || typeof bank !== "object") return "Each bank must be an object.";
        if (!bank.name || typeof bank.name !== "string") return "Bank name is required.";
        if (!bank.type || typeof bank.type !== "string") return "Bank type is required.";
        if (!isFiniteNumber(bank.value)) return "Bank value must be a valid number.";
    }
    return null;
}

function validateCardsPayload(payload) {
    if (!Array.isArray(payload)) return "Cards payload must be an array.";
    for (const card of payload) {
        if (!card || typeof card !== "object") return "Each card must be an object.";
        if (!card.card || typeof card.card !== "string") return "Card name is required.";
        if (!card.bank || typeof card.bank !== "string") return "Card bank is required.";
        if (!card.photoPath || typeof card.photoPath !== "string") return "Card photoPath is required.";
        if (!card.bonuses || typeof card.bonuses !== "object" || Array.isArray(card.bonuses)) {
            return "Card bonuses must be an object.";
        }

        for (const key of Object.keys(card.bonuses)) {
            if (!isFiniteNumber(card.bonuses[key])) return "All bonus values must be valid numbers.";
        }
    }
    return null;
}

app.get("/api/banks", (req, res) => {
    try {
        const data = readJson(bankDataPath);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to load bank data." });
    }
});

app.put("/api/banks", (req, res) => {
    const validationError = validateBanksPayload(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        writeJson(bankDataPath, req.body);
        return res.status(200).json({ ok: true });
    } catch (error) {
        return res.status(500).json({ error: "Failed to save bank data." });
    }
});

app.get("/api/cards", (req, res) => {
    try {
        const data = readJson(cardsDataPath);
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to load card data." });
    }
});

app.put("/api/cards", (req, res) => {
    const validationError = validateCardsPayload(req.body);
    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        writeJson(cardsDataPath, req.body);
        return res.status(200).json({ ok: true });
    } catch (error) {
        return res.status(500).json({ error: "Failed to save card data." });
    }
});

// Serve wallet page for root
app.get("/", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "/index.html"));
});

app.get("/banks", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "/banks.html"));
});

app.get("/cards", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "/cards.html"));
});

// Serve a dummy favicon to avoid 404
app.get("/favicon.ico", (req, res) => {
    res.status(204).end(); // No content response
});

// Catch-all route for undefined paths
app.get("*", (req, res) => {
    res.status(404).sendFile(path.join(__dirname, "404.html"));
});

// Start the server
app.listen(port, () => {
    console.log(`Card Optimizer listening on port ${port}!`);
});
