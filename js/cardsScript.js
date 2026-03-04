const cardsContainer = document.getElementById("cards-container");
const messageEl = document.getElementById("cards-message");
const addCardButton = document.getElementById("add-card-button");
const saveCardsButton = document.getElementById("save-cards-button");
const exportCardsButton = document.getElementById("export-cards-button");
const importCardsButton = document.getElementById("import-cards-button");
const syncCardsButton = document.getElementById("sync-cards-button");
const importCardsFile = document.getElementById("import-cards-file");

const cardModal = document.getElementById("card-editor-modal");
const closeCardEditorButton = document.getElementById("close-card-editor-button");
const cardEditorTitle = document.getElementById("card-editor-title");
const cardEditorErrors = document.getElementById("card-editor-errors");
const cardEditorForm = document.getElementById("card-editor-form");
const cardNameInput = document.getElementById("card-name-input");
const cardBankSelect = document.getElementById("card-bank-select");
const cardBankCustomWrap = document.getElementById("card-bank-custom-wrap");
const cardBankCustomInput = document.getElementById("card-bank-custom-input");
const cardAnnualFeeInput = document.getElementById("card-annual-fee-input");
const cardInWalletInput = document.getElementById("card-in-wallet-input");
const photoModeUpload = document.getElementById("photo-mode-upload");
const photoModeUrl = document.getElementById("photo-mode-url");
const photoUploadWrap = document.getElementById("photo-upload-wrap");
const photoUrlWrap = document.getElementById("photo-url-wrap");
const cardPhotoFileInput = document.getElementById("card-photo-file-input");
const cardPhotoUrlInput = document.getElementById("card-photo-url-input");
const cardPhotoPreview = document.getElementById("card-photo-preview");
const removeCardPhotoButton = document.getElementById("remove-card-photo-button");
const cardDefaultBonusInput = document.getElementById("card-default-bonus-input");
const bonusRowsContainer = document.getElementById("bonus-rows-container");
const addBonusRowButton = document.getElementById("add-bonus-row-button");

const {
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
    validateAndNormalizeCards: dsValidateAndNormalizeCards,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeBankKey: dsNormalizeBankKey,
    normalizeBonusKey: dsNormalizeBonusKey,
    prettyLabelFromKey: dsPrettyLabelFromKey,
} = window.CCDataStore;

const CURATED_CATEGORIES = [
    "groceries",
    "dining",
    "travel",
    "gas",
    "transit",
    "streaming",
    "online_shopping",
    "drugstore",
    "entertainment",
    "hotel",
    "airfare",
    "utilities",
    "wholesale_clubs",
];

let cards = [];
let banks = [];
let editingIndex = null;
let currentPhotoValue = "";

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function setFormErrors(errors) {
    if (!errors || !errors.length) {
        cardEditorErrors.textContent = "";
        return;
    }
    cardEditorErrors.textContent = errors.map((error) => `- ${error}`).join("\n");
}

function getBankByKey(key) {
    const normalizedKey = dsNormalizeBankKey(key);
    return banks.find((bank) => dsNormalizeBankKey(bank.key) === normalizedKey) || null;
}

function getKnownCategories() {
    const set = new Set(CURATED_CATEGORIES);
    cards.forEach((card) => {
        const bonuses = card.bonuses || {};
        Object.keys(bonuses).forEach((key) => {
            const normalized = dsNormalizeBonusKey(key);
            if (normalized && normalized !== "default") set.add(normalized);
        });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getCardPhoto(card) {
    return String(card.photo ?? card.image ?? card.photoPath ?? "").trim();
}

function createPill(text) {
    const pill = document.createElement("span");
    pill.className = "bonus-pill";
    pill.textContent = text;
    return pill;
}

function createTileMeta(text) {
    const p = document.createElement("p");
    p.className = "card-meta";
    p.textContent = text;
    return p;
}

function renderCards() {
    cardsContainer.innerHTML = "";
    const knownBankKeys = new Set(banks.map((bank) => dsNormalizeBankKey(bank.key)));

    if (!cards.length) {
        const empty = document.createElement("p");
        empty.className = "card-meta";
        empty.textContent = "No cards yet. Add one to get started.";
        cardsContainer.appendChild(empty);
        return;
    }

    cards.forEach((card, index) => {
        const tile = document.createElement("article");
        tile.className = "card-tile";

        const top = document.createElement("div");
        top.className = "card-tile-top";

        const thumb = document.createElement("img");
        thumb.className = "card-thumb";
        thumb.alt = `${card.card} preview`;
        const photo = getCardPhoto(card);
        thumb.src = photo || "./logo/cardBonusesIcons/default-icon.png";
        thumb.onerror = () => { thumb.src = "./logo/cardBonusesIcons/default-icon.png"; };

        const info = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "card-title";
        title.textContent = card.card;
        info.appendChild(title);

        const bank = getBankByKey(card.bank);
        info.appendChild(createTileMeta(`Bank: ${bank ? bank.label : card.bank}`));
        if (typeof card.annualFee === "number" && Number.isFinite(card.annualFee)) {
            info.appendChild(createTileMeta(`Annual Fee: $${card.annualFee.toFixed(0)}`));
        }
        if (card.inWallet === false) {
            const availability = document.createElement("span");
            availability.className = "status-badge status-badge-muted";
            availability.textContent = "Not in wallet";
            info.appendChild(availability);
        }

        const bonusEntries = Object.entries(card.bonuses || {})
            .filter(([key]) => key !== "default")
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 3);

        if (bonusEntries.length) {
            const pillRow = document.createElement("div");
            pillRow.className = "bonus-pill-row";
            bonusEntries.forEach(([key, value]) => {
                pillRow.appendChild(createPill(`${dsPrettyLabelFromKey(key)} ${value}x`));
            });
            info.appendChild(pillRow);
        }

        if (card.bank && !knownBankKeys.has(dsNormalizeBankKey(card.bank))) {
            const warning = document.createElement("p");
            warning.className = "card-warning";
            warning.textContent = `Unknown bank key "${card.bank}" (wallet uses multiplier 1).`;
            info.appendChild(warning);
        }

        top.appendChild(thumb);
        top.appendChild(info);
        tile.appendChild(top);

        const actions = document.createElement("div");
        actions.className = "tile-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.onclick = () => openCardEditor(index);

        const duplicateButton = document.createElement("button");
        duplicateButton.type = "button";
        duplicateButton.className = "secondary-button";
        duplicateButton.textContent = "Duplicate";
        duplicateButton.onclick = () => {
            const clone = JSON.parse(JSON.stringify(card));
            clone.card = `${clone.card} Copy`;
            cards.splice(index + 1, 0, clone);
            renderCards();
        };

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "Delete";
        deleteButton.onclick = () => {
            cards.splice(index, 1);
            renderCards();
        };

        actions.appendChild(editButton);
        actions.appendChild(duplicateButton);
        actions.appendChild(deleteButton);
        tile.appendChild(actions);

        cardsContainer.appendChild(tile);
    });
}

function setPhotoPreview(src) {
    const fallback = "./logo/cardBonusesIcons/default-icon.png";
    cardPhotoPreview.src = src || fallback;
    cardPhotoPreview.onerror = () => {
        cardPhotoPreview.src = fallback;
    };
}

function renderBankSelect(currentKey) {
    cardBankSelect.innerHTML = "";

    banks.forEach((bank) => {
        const option = document.createElement("option");
        option.value = bank.key;
        option.textContent = bank.label;
        cardBankSelect.appendChild(option);
    });

    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "(Custom...)";
    cardBankSelect.appendChild(customOption);

    const normalizedCurrent = dsNormalizeBankKey(currentKey);
    const matched = banks.find((bank) => dsNormalizeBankKey(bank.key) === normalizedCurrent);

    if (matched) {
        cardBankSelect.value = matched.key;
        cardBankCustomWrap.classList.add("hidden");
        cardBankCustomInput.value = "";
    } else {
        cardBankSelect.value = "__custom__";
        cardBankCustomWrap.classList.remove("hidden");
        cardBankCustomInput.value = currentKey || "";
    }
}

function createBonusRow(initialKey, initialValue) {
    const row = document.createElement("div");
    row.className = "bonus-row";

    const categorySelect = document.createElement("select");
    categorySelect.dataset.field = "bonus-category";

    const known = getKnownCategories();
    known.forEach((category) => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = dsPrettyLabelFromKey(category);
        categorySelect.appendChild(option);
    });

    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "Custom...";
    categorySelect.appendChild(customOption);

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "bonus-row-custom hidden";
    customInput.placeholder = "Custom category";
    customInput.dataset.field = "bonus-category-custom";

    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.step = "0.1";
    valueInput.min = "0";
    valueInput.dataset.field = "bonus-value";
    valueInput.value = String(initialValue ?? 1);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger-button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => row.remove();

    const normalizedInitial = dsNormalizeBonusKey(initialKey || "");
    const hasKnown = known.includes(normalizedInitial);
    if (normalizedInitial && hasKnown) {
        categorySelect.value = normalizedInitial;
        customInput.classList.add("hidden");
    } else if (normalizedInitial) {
        categorySelect.value = "__custom__";
        customInput.value = normalizedInitial;
        customInput.classList.remove("hidden");
    }

    categorySelect.addEventListener("change", () => {
        if (categorySelect.value === "__custom__") customInput.classList.remove("hidden");
        else {
            customInput.classList.add("hidden");
            customInput.value = "";
        }
    });

    row.appendChild(categorySelect);
    row.appendChild(valueInput);
    row.appendChild(removeButton);
    row.appendChild(customInput);

    bonusRowsContainer.appendChild(row);
}

function openCardEditor(index) {
    editingIndex = typeof index === "number" ? index : null;
    const card = editingIndex === null
        ? { card: "", bank: "", photo: "", bonuses: { default: 1 } }
        : cards[editingIndex];

    cardEditorTitle.textContent = editingIndex === null ? "Add Card" : "Edit Card";
    cardNameInput.value = card.card || "";
    renderBankSelect(card.bank || "");
    cardAnnualFeeInput.value = typeof card.annualFee === "number" ? String(card.annualFee) : "";
    cardInWalletInput.checked = card.inWallet !== false;

    currentPhotoValue = getCardPhoto(card);
    cardPhotoUrlInput.value = /^https?:\/\//i.test(currentPhotoValue) ? currentPhotoValue : "";
    if (/^https?:\/\//i.test(currentPhotoValue)) {
        photoModeUrl.checked = true;
        photoModeUpload.checked = false;
        photoUploadWrap.classList.add("hidden");
        photoUrlWrap.classList.remove("hidden");
    } else {
        photoModeUpload.checked = true;
        photoModeUrl.checked = false;
        photoUploadWrap.classList.remove("hidden");
        photoUrlWrap.classList.add("hidden");
    }
    setPhotoPreview(currentPhotoValue);

    const bonuses = card.bonuses || { default: 1 };
    cardDefaultBonusInput.value = String(Number.isFinite(Number(bonuses.default)) ? Number(bonuses.default) : 1);
    bonusRowsContainer.innerHTML = "";
    Object.entries(bonuses)
        .filter(([key]) => key !== "default")
        .forEach(([key, value]) => createBonusRow(key, value));

    setFormErrors([]);
    cardModal.classList.remove("hidden");
}

function closeCardEditor() {
    cardModal.classList.add("hidden");
    editingIndex = null;
    setFormErrors([]);
}

function collectBonusesFromForm() {
    const errors = [];
    const bonuses = {};

    const defaultValue = Number(cardDefaultBonusInput.value);
    if (!Number.isFinite(defaultValue)) errors.push("Default multiplier is required.");
    else bonuses.default = defaultValue;

    const rows = bonusRowsContainer.querySelectorAll(".bonus-row");
    rows.forEach((row, idx) => {
        const select = row.querySelector('[data-field="bonus-category"]');
        const custom = row.querySelector('[data-field="bonus-category-custom"]');
        const valueInput = row.querySelector('[data-field="bonus-value"]');

        const rawKey = select.value === "__custom__" ? custom.value : select.value;
        const key = dsNormalizeBonusKey(rawKey);
        const value = Number(valueInput.value);

        if (!key) {
            errors.push(`Bonus row ${idx + 1}: category is required.`);
            return;
        }
        if (key === "default") {
            errors.push(`Bonus row ${idx + 1}: category cannot be "default".`);
            return;
        }
        if (!Number.isFinite(value)) {
            errors.push(`Bonus row ${idx + 1}: multiplier must be numeric.`);
            return;
        }

        bonuses[key] = value;
    });

    return { bonuses, errors };
}

function collectCardFromForm() {
    const errors = [];
    const name = cardNameInput.value.trim();
    const selectedBank = cardBankSelect.value === "__custom__" ? cardBankCustomInput.value : cardBankSelect.value;
    const bankKey = dsNormalizeBankKey(selectedBank);
    const annualFeeRaw = cardAnnualFeeInput.value.trim();

    if (!name) errors.push("Card name is required.");
    if (!bankKey) errors.push("Bank is required.");

    const bonusesResult = collectBonusesFromForm();
    errors.push(...bonusesResult.errors);

    const card = {
        card: name,
        bank: bankKey,
        inWallet: cardInWalletInput.checked,
        photo: currentPhotoValue || "",
        photoPath: currentPhotoValue || "",
        bonuses: bonusesResult.bonuses,
    };

    if (annualFeeRaw) {
        const fee = Number(annualFeeRaw);
        if (!Number.isFinite(fee)) errors.push("Annual fee must be numeric.");
        else card.annualFee = fee;
    }

    return { card, errors };
}

function upsertCardFromForm() {
    const collected = collectCardFromForm();
    if (collected.errors.length) {
        setFormErrors(collected.errors);
        return;
    }

    const nextCards = [...cards];
    if (editingIndex === null) {
        nextCards.push(collected.card);
    } else {
        const existing = cards[editingIndex] || {};
        nextCards[editingIndex] = { ...existing, ...collected.card, bonuses: collected.card.bonuses };
    }

    const validation = dsValidateAndNormalizeCards(nextCards);
    if (!validation.ok) {
        setFormErrors(validation.errors);
        return;
    }

    cards = validation.data;
    renderCards();
    closeCardEditor();
}

function validateCurrentCards() {
    return dsValidateAndNormalizeCards(cards);
}

function saveCards() {
    const validation = validateCurrentCards();
    if (!validation.ok) {
        setMessage(`Save blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
        return;
    }
    cards = validation.data;
    dsWriteLocalJson(cardsStorageKey, cards);
    renderCards();
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
    const validation = validateCurrentCards();
    if (!validation.ok) {
        setMessage(`Export blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
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
                setMessage(`Import blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
                return;
            }
            cards = validation.data;
            dsWriteLocalJson(cardsStorageKey, cards);
            renderCards();
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

    try {
        const response = await fetch(`./database/cardsData.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not fetch online card data.");
        const parsed = await response.json();
        const validation = dsValidateAndNormalizeCards(parsed);
        if (!validation.ok) {
            setMessage(`Sync blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
            return;
        }
        cards = validation.data;
        dsWriteLocalJson(cardsStorageKey, cards);
        renderCards();
        setMessage("Cards synced from database JSON.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

function switchPhotoMode(mode) {
    if (mode === "url") {
        photoModeUrl.checked = true;
        photoModeUpload.checked = false;
        photoUrlWrap.classList.remove("hidden");
        photoUploadWrap.classList.add("hidden");
        currentPhotoValue = cardPhotoUrlInput.value.trim();
        setPhotoPreview(currentPhotoValue);
    } else {
        photoModeUpload.checked = true;
        photoModeUrl.checked = false;
        photoUploadWrap.classList.remove("hidden");
        photoUrlWrap.classList.add("hidden");
        if (!cardPhotoFileInput.value && !currentPhotoValue.startsWith("data:image/")) {
            currentPhotoValue = "";
        }
        setPhotoPreview(currentPhotoValue);
    }
}

async function loadInitialData() {
    try {
        const [rawBanks, rawCards] = await Promise.all([
            dsLoadDataset(banksStorageKey, "./database/bankData.json"),
            dsLoadDataset(cardsStorageKey, "./database/cardsData.json"),
        ]);
        banks = dsNormalizeBanksForRuntime(rawBanks);
        cards = dsNormalizeCardsForRuntime(rawCards);
        renderCards();
        setMessage("Card data loaded.", false);
    } catch (error) {
        setMessage(`Could not load card data: ${error.message}`, true);
    }
}

cardBankSelect.addEventListener("change", () => {
    if (cardBankSelect.value === "__custom__") {
        cardBankCustomWrap.classList.remove("hidden");
        cardBankCustomInput.focus();
    } else {
        cardBankCustomWrap.classList.add("hidden");
        cardBankCustomInput.value = "";
    }
});

photoModeUpload.addEventListener("change", () => switchPhotoMode("upload"));
photoModeUrl.addEventListener("change", () => switchPhotoMode("url"));

cardPhotoUrlInput.addEventListener("input", () => {
    if (!photoModeUrl.checked) return;
    currentPhotoValue = cardPhotoUrlInput.value.trim();
    setPhotoPreview(currentPhotoValue);
});

cardPhotoFileInput.addEventListener("change", () => {
    const file = cardPhotoFileInput.files && cardPhotoFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        currentPhotoValue = String(reader.result || "");
        switchPhotoMode("upload");
        setPhotoPreview(currentPhotoValue);
    };
    reader.readAsDataURL(file);
});

removeCardPhotoButton.addEventListener("click", () => {
    currentPhotoValue = "";
    cardPhotoUrlInput.value = "";
    cardPhotoFileInput.value = "";
    setPhotoPreview("");
});

addBonusRowButton.addEventListener("click", () => {
    createBonusRow("", 1);
});

cardEditorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertCardFromForm();
});

closeCardEditorButton.addEventListener("click", closeCardEditor);
cardModal.addEventListener("click", (event) => {
    if (event.target === cardModal) closeCardEditor();
});

addCardButton.addEventListener("click", () => openCardEditor(null));
saveCardsButton.addEventListener("click", saveCards);
exportCardsButton.addEventListener("click", exportCards);
importCardsButton.addEventListener("click", () => importCardsFile.click());
importCardsFile.addEventListener("change", importCardsFromFile);
syncCardsButton.addEventListener("click", syncCardsFromSource);

loadInitialData();
