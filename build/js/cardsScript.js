const cardsContainer = document.getElementById("cards-container");
const messageEl = document.getElementById("cards-message");
const addCardButton = document.getElementById("add-card-button");
const saveCardsButton = document.getElementById("save-cards-button");
const exportCardsButton = document.getElementById("export-cards-button");
const importCardsButton = document.getElementById("import-cards-button");
const syncCardsButton = document.getElementById("sync-cards-button");
const importCardsFile = document.getElementById("import-cards-file");
const {
    CARDS_STORAGE_KEY: cardsStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
} = window.CCDataStore;

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function formatBonuses(bonuses) {
    return JSON.stringify(bonuses, null, 2);
}

function createCardEditor(card = { card: "", bank: "", photoPath: "", bonuses: { default: 1 } }) {
    const wrapper = document.createElement("section");
    wrapper.className = "card-editor";

    wrapper.innerHTML = `
        <h3>Card</h3>
        <div class="card-fields">
            <label>Card Name</label>
            <input type="text" data-field="card" value="${card.card}">

            <label>Bank Name Key</label>
            <input type="text" data-field="bank" value="${card.bank}">

            <label>Photo URL</label>
            <input type="text" data-field="photoPath" value="${card.photoPath}">

            <label>Bonuses JSON</label>
            <textarea data-field="bonuses">${formatBonuses(card.bonuses)}</textarea>
        </div>
    `;

    return wrapper;
}

async function loadCards() {
    setMessage("Loading card data...", false);
    try {
        const cards = await dsLoadDataset(cardsStorageKey, "./database/cardsData.json");

        cardsContainer.innerHTML = "";
        cards.forEach((card) => cardsContainer.appendChild(createCardEditor(card)));
        setMessage("Card data loaded from device storage.", false);
    } catch (error) {
        setMessage(`Could not load card data: ${error.message}`, true);
    }
}

function collectCardsFromEditors() {
    const editors = cardsContainer.querySelectorAll(".card-editor");

    return Array.from(editors).map((editor, index) => {
        const cardName = editor.querySelector('[data-field="card"]').value.trim();
        const bank = editor.querySelector('[data-field="bank"]').value.trim();
        const photoPath = editor.querySelector('[data-field="photoPath"]').value.trim();
        const bonusesRaw = editor.querySelector('[data-field="bonuses"]').value.trim();

        let bonuses;
        try {
            bonuses = JSON.parse(bonusesRaw);
        } catch (error) {
            throw new Error(`Invalid bonuses JSON at card #${index + 1}.`);
        }

        if (!bonuses || typeof bonuses !== "object" || Array.isArray(bonuses)) {
            throw new Error(`Bonuses must be an object at card #${index + 1}.`);
        }

        return {
            card: cardName,
            bank,
            photoPath,
            bonuses,
        };
    });
}

function isValidCardsPayload(payload) {
    if (!Array.isArray(payload)) return false;
    return payload.every((card) => {
        if (!card || typeof card !== "object") return false;
        if (typeof card.card !== "string" || typeof card.bank !== "string" || typeof card.photoPath !== "string") {
            return false;
        }
        if (!card.bonuses || typeof card.bonuses !== "object" || Array.isArray(card.bonuses)) {
            return false;
        }
        return Object.values(card.bonuses).every((value) => typeof value === "number" && Number.isFinite(value));
    });
}

function saveCards() {
    try {
        const payload = collectCardsFromEditors();
        dsWriteLocalJson(cardsStorageKey, payload);
        setMessage("Card data saved locally on this device.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportCards() {
    try {
        const payload = collectCardsFromEditors();
        downloadJson("cardsData-export.json", payload);
        setMessage("Cards exported.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function importCardsFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!isValidCardsPayload(parsed)) {
                throw new Error("Invalid cards JSON format.");
            }

            dsWriteLocalJson(cardsStorageKey, parsed);
            cardsContainer.innerHTML = "";
            parsed.forEach((card) => cardsContainer.appendChild(createCardEditor(card)));
            setMessage("Cards imported and saved locally.", false);
        } catch (error) {
            setMessage(`Import failed: ${error.message}`, true);
        } finally {
            importCardsFile.value = "";
        }
    };
    reader.readAsText(file);
}

async function syncCardsFromSource() {
    if (!navigator.onLine) {
        setMessage("Offline: cannot sync from online source.", true);
        return;
    }

    setMessage("Syncing cards from online source...", false);
    try {
        const response = await fetch(`./database/cardsData.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not fetch online card data.");
        const cards = await response.json();
        if (!isValidCardsPayload(cards)) throw new Error("Online card data format is invalid.");

        dsWriteLocalJson(cardsStorageKey, cards);
        cardsContainer.innerHTML = "";
        cards.forEach((card) => cardsContainer.appendChild(createCardEditor(card)));
        setMessage("Cards synced from online source and saved locally.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

addCardButton.addEventListener("click", () => {
    cardsContainer.appendChild(createCardEditor());
});

saveCardsButton.addEventListener("click", saveCards);
exportCardsButton.addEventListener("click", exportCards);
importCardsButton.addEventListener("click", () => importCardsFile.click());
importCardsFile.addEventListener("change", importCardsFromFile);
syncCardsButton.addEventListener("click", syncCardsFromSource);

loadCards();
