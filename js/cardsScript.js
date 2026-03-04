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
    BANKS_STORAGE_KEY: banksStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
    validateAndNormalizeCards: dsValidateAndNormalizeCards,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeBankName: dsNormalizeBankName,
} = window.CCDataStore;

let knownBankKeys = new Set();

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function formatErrors(prefix, errors) {
    return `${prefix}\n${errors.map((error) => `- ${error}`).join("\n")}`;
}

function formatBonuses(bonuses) {
    return JSON.stringify(bonuses, null, 2);
}

function updateBankWarning(editor) {
    const bankInput = editor.querySelector('[data-field="bank"]');
    const warning = editor.querySelector('[data-role="bank-warning"]');
    const bankKey = dsNormalizeBankName(bankInput.value);

    if (!bankKey || knownBankKeys.has(bankKey)) {
        warning.textContent = "";
        warning.classList.remove("active");
        return;
    }

    warning.textContent = `Unknown bank "${bankInput.value.trim()}" (wallet will use multiplier 1).`;
    warning.classList.add("active");
}

function createFieldLabel(text) {
    const label = document.createElement("label");
    label.textContent = text;
    return label;
}

function createCardEditor(card = { card: "", bank: "", photoPath: "", bonuses: { default: 1 } }, index = 0) {
    const wrapper = document.createElement("section");
    wrapper.className = "card-editor";

    const title = document.createElement("h3");
    title.textContent = `Card ${index + 1}`;
    wrapper.appendChild(title);

    const fields = document.createElement("div");
    fields.className = "card-fields";

    const cardLabel = createFieldLabel("Card Name");
    const cardInput = document.createElement("input");
    cardInput.type = "text";
    cardInput.dataset.field = "card";
    cardInput.value = card.card || "";

    const bankLabel = createFieldLabel("Bank Name Key");
    const bankInput = document.createElement("input");
    bankInput.type = "text";
    bankInput.dataset.field = "bank";
    bankInput.value = card.bank || "";

    const bankWarning = document.createElement("p");
    bankWarning.className = "card-warning";
    bankWarning.dataset.role = "bank-warning";

    const photoLabel = createFieldLabel("Photo URL");
    const photoInput = document.createElement("input");
    photoInput.type = "text";
    photoInput.dataset.field = "photoPath";
    photoInput.value = card.photoPath || "";

    const bonusesLabel = createFieldLabel("Bonuses JSON");
    const bonusesTextarea = document.createElement("textarea");
    bonusesTextarea.dataset.field = "bonuses";
    bonusesTextarea.value = formatBonuses(card.bonuses || { default: 1 });

    fields.appendChild(cardLabel);
    fields.appendChild(cardInput);
    fields.appendChild(bankLabel);
    fields.appendChild(bankInput);
    fields.appendChild(bankWarning);
    fields.appendChild(photoLabel);
    fields.appendChild(photoInput);
    fields.appendChild(bonusesLabel);
    fields.appendChild(bonusesTextarea);

    wrapper.appendChild(fields);

    bankInput.addEventListener("input", () => updateBankWarning(wrapper));
    updateBankWarning(wrapper);
    return wrapper;
}

function renderCards(cards) {
    cardsContainer.innerHTML = "";
    cards.forEach((card, index) => cardsContainer.appendChild(createCardEditor(card, index)));
}

function collectCardsFromEditorsRaw() {
    const editors = cardsContainer.querySelectorAll(".card-editor");
    const errors = [];

    const rawCards = Array.from(editors).map((editor, index) => {
        const cardName = editor.querySelector('[data-field="card"]').value;
        const bank = editor.querySelector('[data-field="bank"]').value;
        const photoPath = editor.querySelector('[data-field="photoPath"]').value;
        const bonusesRaw = editor.querySelector('[data-field="bonuses"]').value.trim();

        let bonuses = {};
        if (!bonusesRaw) {
            bonuses = {};
        } else {
            try {
                bonuses = JSON.parse(bonusesRaw);
            } catch (error) {
                errors.push(`Card ${index + 1}: bonuses must be valid JSON.`);
                bonuses = {};
            }
        }

        return {
            card: cardName,
            bank,
            photoPath,
            bonuses,
        };
    });

    return { rawCards, errors };
}

function validateFromEditors() {
    const collected = collectCardsFromEditorsRaw();
    if (collected.errors.length) {
        return { ok: false, data: [], errors: collected.errors };
    }
    return dsValidateAndNormalizeCards(collected.rawCards);
}

async function refreshKnownBanks() {
    const rawBanks = await dsLoadDataset(banksStorageKey, "./database/bankData.json");
    const banks = dsNormalizeBanksForRuntime(rawBanks);
    knownBankKeys = new Set(banks.map((bank) => dsNormalizeBankName(bank.name)));
}

async function loadCards() {
    setMessage("Loading card data...", false);
    try {
        await refreshKnownBanks();
        const rawCards = await dsLoadDataset(cardsStorageKey, "./database/cardsData.json");
        const cards = dsNormalizeCardsForRuntime(rawCards);
        renderCards(cards);
        setMessage("Card data loaded from device storage.", false);
    } catch (error) {
        setMessage(`Could not load card data: ${error.message}`, true);
    }
}

function saveCards() {
    const validation = validateFromEditors();
    if (!validation.ok) {
        setMessage(formatErrors("Save blocked. Fix these card entries:", validation.errors), true);
        return;
    }

    dsWriteLocalJson(cardsStorageKey, validation.data);
    renderCards(validation.data);
    setMessage("Card data saved locally on this device.", false);
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
    const validation = validateFromEditors();
    if (!validation.ok) {
        setMessage(formatErrors("Export blocked. Fix these card entries:", validation.errors), true);
        return;
    }

    downloadJson("cardsData-export.json", validation.data);
    setMessage("Cards exported.", false);
}

function importCardsFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const validation = dsValidateAndNormalizeCards(parsed);
            if (!validation.ok) {
                setMessage(formatErrors("Import blocked. Fix these card entries:", validation.errors), true);
                return;
            }

            dsWriteLocalJson(cardsStorageKey, validation.data);
            renderCards(validation.data);
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
        const parsed = await response.json();
        const validation = dsValidateAndNormalizeCards(parsed);
        if (!validation.ok) {
            setMessage(formatErrors("Sync blocked. Source card data is invalid:", validation.errors), true);
            return;
        }

        dsWriteLocalJson(cardsStorageKey, validation.data);
        renderCards(validation.data);
        setMessage("Cards synced from online source and saved locally.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

addCardButton.addEventListener("click", () => {
    cardsContainer.appendChild(createCardEditor({ card: "", bank: "", photoPath: "", bonuses: { default: 1 } }, cardsContainer.children.length));
});

saveCardsButton.addEventListener("click", saveCards);
exportCardsButton.addEventListener("click", exportCards);
importCardsButton.addEventListener("click", () => importCardsFile.click());
importCardsFile.addEventListener("change", importCardsFromFile);
syncCardsButton.addEventListener("click", syncCardsFromSource);

loadCards();
