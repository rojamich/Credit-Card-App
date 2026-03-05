const WALLET_PREFS_STORAGE_KEY = "walletAppPrefs";
const PROFILE_MICHAEL = "michael";
const PROFILE_JENNA = "jenna";
const PROFILE_BOTH = "both";
const DEFAULT_ONLY_CATEGORY_KEY = "__default__";

const cardsContainer = document.getElementById("cards-container");
const messageEl = document.getElementById("cards-message");
const addCardButton = document.getElementById("add-card-button");
const saveCardsButton = document.getElementById("save-cards-button");
const exportCardsButton = document.getElementById("export-cards-button");
const exportCardsPublishButton = document.getElementById("export-cards-publish-button");
const importCardsButton = document.getElementById("import-cards-button");
const syncCardsButton = document.getElementById("sync-cards-button");
const importCardsFile = document.getElementById("import-cards-file");

const walletManageMembershipButton = document.getElementById("wallet-manage-membership-button");
const walletManagerList = document.getElementById("wallet-manager-list");
const walletManagerNote = document.getElementById("wallet-manager-note");
const advancedSection = document.getElementById("advanced-section");
const walletMembershipProfileSelect = document.getElementById("wallet-membership-profile-select");
const walletMembershipSearchInput = document.getElementById("wallet-membership-search-input");
const walletMembershipList = document.getElementById("wallet-membership-list");
const walletMembershipNote = document.getElementById("wallet-membership-note");
const walletEmptyButton = document.getElementById("wallet-empty-button");
const walletQuickSetupButton = document.getElementById("wallet-quick-setup-button");
const walletQuickSetupModal = document.getElementById("wallet-quick-setup-modal");
const closeWalletQuickSetupButton = document.getElementById("close-wallet-quick-setup-button");
const walletQuickSetupCategories = document.getElementById("wallet-quick-setup-categories");
const walletQuickSetupSizeInput = document.getElementById("wallet-quick-setup-size-input");
const walletQuickSetupNoFtfInput = document.getElementById("wallet-quick-setup-no-ftf-input");
const walletQuickSetupBuildButton = document.getElementById("wallet-quick-setup-build-button");
const walletQuickSetupSummary = document.getElementById("wallet-quick-setup-summary");

const cardModal = document.getElementById("card-editor-modal");
const closeCardEditorButton = document.getElementById("close-card-editor-button");
const cardEditorTitle = document.getElementById("card-editor-title");
const cardEditorErrors = document.getElementById("card-editor-errors");
const cardEditorForm = document.getElementById("card-editor-form");
const cardNameInput = document.getElementById("card-name-input");
const cardIdInput = document.getElementById("card-id-input");
const cardBankSelect = document.getElementById("card-bank-select");
const cardBankCustomWrap = document.getElementById("card-bank-custom-wrap");
const cardBankCustomInput = document.getElementById("card-bank-custom-input");
const cardNetworkSelect = document.getElementById("card-network-select");
const cardTierSelect = document.getElementById("card-tier-select");
const cardAnnualFeeInput = document.getElementById("card-annual-fee-input");
const cardForeignFeeSelect = document.getElementById("card-foreign-fee-select");
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
    normalizeCardNetwork: dsNormalizeCardNetwork,
    normalizeCardTier: dsNormalizeCardTier,
    normalizeCardId: dsNormalizeCardId,
} = window.CCDataStore;

const CURATED_CATEGORIES = [
    "groceries", "dining", "travel", "gas", "transit", "streaming", "online_shopping",
    "drugstore", "entertainment", "hotel", "airfare", "utilities", "wholesale_clubs", "foreign_transactions",
];

let cards = [];
let banks = [];
let editingIndex = null;
let currentPhotoValue = "";
let cardIdTouched = false;
let walletPrefs = null;

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

function createDefaultPrefs() {
    return {
        version: 2,
        activeProfile: PROFILE_MICHAEL,
        activeFilter: "all",
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
    };
}

function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function loadWalletPrefs() {
    try {
        const raw = localStorage.getItem(WALLET_PREFS_STORAGE_KEY);
        if (!raw) return createDefaultPrefs();
        const parsed = JSON.parse(raw);
        const sourceProfiles = parsed.profiles && typeof parsed.profiles === "object" ? parsed.profiles : {};
        const sourcePins = parsed.pinnedCategoriesByProfile && typeof parsed.pinnedCategoriesByProfile === "object"
            ? parsed.pinnedCategoriesByProfile
            : {};
        const sourceFavId = parsed.favoritesByCardId && typeof parsed.favoritesByCardId === "object"
            ? parsed.favoritesByCardId
            : {};
        const sourceFavKey = parsed.favoritesByCardKey && typeof parsed.favoritesByCardKey === "object"
            ? parsed.favoritesByCardKey
            : {};
        const favoritesByCardId = {};
        Object.keys(sourceFavId).forEach((id) => { if (sourceFavId[id]) favoritesByCardId[id] = true; });
        Object.keys(sourceFavKey).forEach((key) => { if (sourceFavKey[key]) favoritesByCardId[key] = true; });

        return {
            version: 2,
            activeProfile: [PROFILE_MICHAEL, PROFILE_JENNA, PROFILE_BOTH].includes(parsed.activeProfile)
                ? parsed.activeProfile
                : PROFILE_MICHAEL,
            activeFilter: typeof parsed.activeFilter === "string" ? parsed.activeFilter : "all",
            requireNoFtf: Boolean(parsed.requireNoFtf),
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
                michael: asStringArray(sourcePins.michael).map((key) => dsNormalizeBonusKey(key)).filter(Boolean),
                jenna: asStringArray(sourcePins.jenna).map((key) => dsNormalizeBonusKey(key)).filter(Boolean),
            },
        };
    } catch (error) {
        return createDefaultPrefs();
    }
}

function saveWalletPrefs() {
    localStorage.setItem(WALLET_PREFS_STORAGE_KEY, JSON.stringify(walletPrefs));
}

function getLegacyCardKeyMap() {
    const baseCounts = new Map();
    cards.forEach((card) => {
        const base = dsNormalizeBonusKey(card.card || "") || "card";
        baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
    });
    const seen = new Set();
    const map = new Map();
    cards.forEach((card) => {
        const base = dsNormalizeBonusKey(card.card || "") || "card";
        let key = base;
        if ((baseCounts.get(base) || 0) > 1) {
            key = `${base}__${dsNormalizeBonusKey(dsNormalizeBankKey(card.bank || "")) || "bank"}`;
        }
        let next = key;
        let suffix = 2;
        while (seen.has(next)) {
            next = `${key}__${suffix}`;
            suffix += 1;
        }
        seen.add(next);
        map.set(next, card.id);
    });
    return map;
}

function migrateWalletPrefsToIds() {
    const legacyMap = getLegacyCardKeyMap();
    const byId = new Set(cards.map((card) => card.id));
    const byNameSlug = new Map(cards.map((card) => [dsNormalizeBonusKey(card.card || ""), card.id]));

    const migratedFavorites = {};
    Object.keys(walletPrefs.favoritesByCardId || {}).forEach((raw) => {
        if (!walletPrefs.favoritesByCardId[raw]) return;
        let id = "";
        if (byId.has(raw)) id = raw;
        else if (legacyMap.has(raw)) id = legacyMap.get(raw);
        else if (byNameSlug.has(raw)) id = byNameSlug.get(raw);
        if (id) migratedFavorites[id] = true;
    });
    walletPrefs.favoritesByCardId = migratedFavorites;

    [PROFILE_MICHAEL, PROFILE_JENNA].forEach((profileKey) => {
        const current = asStringArray(walletPrefs.profiles[profileKey].walletCardIds);
        const migrated = current
            .map((raw) => {
                if (byId.has(raw)) return raw;
                if (legacyMap.has(raw)) return legacyMap.get(raw);
                if (byNameSlug.has(raw)) return byNameSlug.get(raw);
                return "";
            })
            .filter(Boolean);
        walletPrefs.profiles[profileKey].walletCardIds = Array.from(new Set(migrated));
    });
}

function getBankByKey(key) {
    const normalizedKey = dsNormalizeBankKey(key);
    return banks.find((bank) => dsNormalizeBankKey(bank.key) === normalizedKey) || null;
}

function getKnownCategories() {
    const set = new Set(CURATED_CATEGORIES);
    cards.forEach((card) => {
        Object.keys(card.bonuses || {}).forEach((key) => {
            const normalized = dsNormalizeBonusKey(key);
            if (normalized && normalized !== "default") set.add(normalized);
        });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getCardPhoto(card) {
    return String(card.photo ?? card.image ?? card.photoPath ?? "").trim();
}

function formatNetworkTier(networkRaw, tierRaw) {
    const network = String(networkRaw || "").trim().toLowerCase();
    const tier = String(tierRaw || "").trim().toLowerCase();
    const networkTitle = network ? network.charAt(0).toUpperCase() + network.slice(1) : "Unknown";
    if (network === "amex") return "Amex";
    if (network === "discover") return "Discover";
    if (network === "visa" || network === "mastercard") {
        if (!tier || tier === "standard") return networkTitle;
        const tierLabel = {
            signature: "Signature",
            infinite: "Infinite",
            world: "World",
            "world-elite": "World Elite",
        }[tier] || (tier.charAt(0).toUpperCase() + tier.slice(1));
        return `${networkTitle} ${tierLabel}`;
    }
    return networkTitle;
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
        thumb.src = getCardPhoto(card) || "./logo/cardBonusesIcons/default-icon.png";
        thumb.onerror = () => { thumb.src = "./logo/cardBonusesIcons/default-icon.png"; };

        const info = document.createElement("div");
        const title = document.createElement("h3");
        title.className = "card-title";
        title.textContent = card.card;
        info.appendChild(title);
        info.appendChild(createTileMeta(`ID: ${card.id}`));
        const bank = getBankByKey(card.bank);
        info.appendChild(createTileMeta(`Bank: ${bank ? bank.label : card.bank}`));
        info.appendChild(createTileMeta(`Network Tier: ${formatNetworkTier(card.network, card.tier)}`));
        info.appendChild(createTileMeta(card.foreignTransactionFee === false ? "Foreign Fee: No fee" : "Foreign Fee: Has fee"));
        if (typeof card.annualFee === "number" && Number.isFinite(card.annualFee)) {
            info.appendChild(createTileMeta(`Annual Fee: $${card.annualFee.toFixed(0)}`));
        }
        if (card.inWallet === false) {
            const availability = document.createElement("span");
            availability.className = "status-badge status-badge-muted";
            availability.textContent = "Legacy: Not in wallet";
            info.appendChild(availability);
        }

        const bonusEntries = Object.entries(card.bonuses || {})
            .filter(([key]) => key !== "default")
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 3);
        if (bonusEntries.length) {
            const row = document.createElement("div");
            row.className = "bonus-pill-row";
            bonusEntries.forEach(([key, value]) => row.appendChild(createPill(`${dsPrettyLabelFromKey(key)} ${value}x`)));
            info.appendChild(row);
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
            clone.id = nextAvailableCardId(dsNormalizeCardId(clone.card) || "card");
            cards.splice(index + 1, 0, clone);
            renderCards();
            renderWalletManager();
            renderWalletMembershipManager();
        };
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "Delete";
        deleteButton.onclick = () => {
            cards.splice(index, 1);
            migrateWalletPrefsToIds();
            renderCards();
            renderWalletManager();
            renderWalletMembershipManager();
            saveWalletPrefs();
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
    cardPhotoPreview.onerror = () => { cardPhotoPreview.src = fallback; };
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
    getKnownCategories().forEach((category) => {
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
    if (normalizedInitial && getKnownCategories().includes(normalizedInitial)) {
        categorySelect.value = normalizedInitial;
    } else if (normalizedInitial) {
        categorySelect.value = "__custom__";
        customInput.value = normalizedInitial;
        customInput.classList.remove("hidden");
    }
    categorySelect.addEventListener("change", () => {
        const custom = categorySelect.value === "__custom__";
        customInput.classList.toggle("hidden", !custom);
        if (!custom) customInput.value = "";
    });

    row.appendChild(categorySelect);
    row.appendChild(valueInput);
    row.appendChild(removeButton);
    row.appendChild(customInput);
    bonusRowsContainer.appendChild(row);
}

function nextAvailableCardId(baseId) {
    const safeBase = dsNormalizeCardId(baseId) || "card";
    const existing = new Set(cards.map((card) => card.id));
    if (!existing.has(safeBase)) return safeBase;
    let suffix = 2;
    let next = `${safeBase}_${suffix}`;
    while (existing.has(next)) {
        suffix += 1;
        next = `${safeBase}_${suffix}`;
    }
    return next;
}

function openCardEditor(index) {
    editingIndex = typeof index === "number" ? index : null;
    const card = editingIndex === null
        ? { id: "", card: "", bank: "", photo: "", network: "visa", tier: "standard", foreignTransactionFee: true, bonuses: { default: 1 } }
        : cards[editingIndex];

    cardEditorTitle.textContent = editingIndex === null ? "Add Card" : "Edit Card";
    cardNameInput.value = card.card || "";
    cardIdInput.value = card.id || "";
    cardIdTouched = Boolean(card.id);
    renderBankSelect(card.bank || "");
    cardNetworkSelect.value = dsNormalizeCardNetwork(card.network) || "visa";
    cardTierSelect.value = dsNormalizeCardTier(card.tier) || "standard";
    cardForeignFeeSelect.value = card.foreignTransactionFee === false ? "false" : "true";
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
    Object.entries(bonuses).filter(([key]) => key !== "default").forEach(([key, value]) => createBonusRow(key, value));

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
        if (!key) return errors.push(`Bonus row ${idx + 1}: category is required.`);
        if (key === "default") return errors.push(`Bonus row ${idx + 1}: category cannot be "default".`);
        if (!Number.isFinite(value)) return errors.push(`Bonus row ${idx + 1}: multiplier must be numeric.`);
        bonuses[key] = value;
    });
    return { bonuses, errors };
}

function collectCardFromForm() {
    const errors = [];
    const name = cardNameInput.value.trim();
    const selectedBank = cardBankSelect.value === "__custom__" ? cardBankCustomInput.value : cardBankSelect.value;
    const bankKey = dsNormalizeBankKey(selectedBank);
    const network = dsNormalizeCardNetwork(cardNetworkSelect.value);
    const tier = dsNormalizeCardTier(cardTierSelect.value);
    const idRaw = cardIdInput.value.trim() || dsNormalizeCardId(name);
    const id = dsNormalizeCardId(idRaw);
    const annualFeeRaw = cardAnnualFeeInput.value.trim();
    const foreignTransactionFee = cardForeignFeeSelect.value !== "false";

    if (!name) errors.push("Card name is required.");
    if (!id) errors.push("Card ID is required.");
    if (!bankKey) errors.push("Bank is required.");
    if (!network) errors.push("Network is required.");
    if (!tier) errors.push("Tier is required.");
    const bonusesResult = collectBonusesFromForm();
    errors.push(...bonusesResult.errors);

    const card = {
        id,
        card: name,
        bank: bankKey,
        inWallet: cardInWalletInput.checked,
        network,
        tier,
        foreignTransactionFee,
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
    if (collected.errors.length) return setFormErrors(collected.errors);
    const nextCards = [...cards];
    if (editingIndex === null) nextCards.push(collected.card);
    else nextCards[editingIndex] = { ...cards[editingIndex], ...collected.card, bonuses: collected.card.bonuses };
    const validation = dsValidateAndNormalizeCards(nextCards);
    if (!validation.ok) return setFormErrors(validation.errors);
    cards = validation.data;
    migrateWalletPrefsToIds();
    saveWalletPrefs();
    renderCards();
    renderWalletManager();
    renderWalletMembershipManager();
    closeCardEditor();
}

function validateCurrentCards() {
    return dsValidateAndNormalizeCards(cards);
}

function saveCards() {
    const validation = validateCurrentCards();
    if (!validation.ok) return setMessage(buildSaveBlockedMessage(validation.errors), true);
    cards = validation.data;
    dsWriteLocalJson(cardsStorageKey, cards);
    setMessage("Card data saved locally on this device.", false);
    renderCards();
    renderWalletManager();
    renderWalletMembershipManager();
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

function buildSaveBlockedMessage(errors) {
    return `Save blocked:\n${errors.map((e) => `- ${e}`).join("\n")}`;
}

function getBackupCardsFilename() {
    return `cardsData-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function exportCards() {
    const validation = validateCurrentCards();
    if (!validation.ok) return setMessage(buildSaveBlockedMessage(validation.errors), true);
    downloadJson(getBackupCardsFilename(), validation.data);
    setMessage("Cards backup exported.", false);
}

function exportCardsForPublish() {
    const validation = validateCurrentCards();
    if (!validation.ok) return setMessage(buildSaveBlockedMessage(validation.errors), true);
    downloadJson("cards.json", validation.data);
    setMessage("Saved cards.json. Replace /database/cards.json in your repo with this file and commit.", false);
}

function importCardsFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const validation = dsValidateAndNormalizeCards(parsed);
            if (!validation.ok) return setMessage(`Import blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
            cards = validation.data;
            migrateWalletPrefsToIds();
            saveWalletPrefs();
            dsWriteLocalJson(cardsStorageKey, cards);
            renderCards();
            renderWalletManager();
            renderWalletMembershipManager();
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
    if (!navigator.onLine) return setMessage("Offline: cannot sync from online source.", true);
    try {
        let parsed = null;
        for (const path of ["./database/cards.json", "./database/cardsData.json"]) {
            const response = await fetch(`${path}?ts=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) continue;
            parsed = await response.json();
            break;
        }
        if (!parsed) throw new Error("Could not fetch online card data.");
        const validation = dsValidateAndNormalizeCards(parsed);
        if (!validation.ok) return setMessage(`Sync blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
        cards = validation.data;
        migrateWalletPrefsToIds();
        saveWalletPrefs();
        dsWriteLocalJson(cardsStorageKey, cards);
        renderCards();
        renderWalletManager();
        renderWalletMembershipManager();
        setMessage("Cards synced from database JSON.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

function getProfileWalletSet(profileKey) {
    if (profileKey === PROFILE_BOTH) {
        const union = new Set(walletPrefs.profiles.michael.walletCardIds);
        walletPrefs.profiles.jenna.walletCardIds.forEach((id) => union.add(id));
        return union;
    }
    return new Set(walletPrefs.profiles[profileKey].walletCardIds);
}

function setProfileWalletSet(profileKey, set) {
    if (profileKey === PROFILE_BOTH) return;
    walletPrefs.profiles[profileKey].walletCardIds = Array.from(set);
    saveWalletPrefs();
}

function renderWalletManager() {
    if (!walletManagerList) return;
    walletManagerList.innerHTML = "";
    const favoriteCards = cards
        .filter((card) => walletPrefs.favoritesByCardId[card.id] === true)
        .sort((a, b) => a.card.localeCompare(b.card));

    if (!favoriteCards.length) {
        walletManagerNote.textContent = "Star cards to pin them here.";
        return;
    }
    walletManagerNote.textContent = "";

    favoriteCards.forEach((card) => {
        const item = document.createElement("article");
        item.className = "wallet-manager-item";
        const meta = document.createElement("div");
        const title = document.createElement("h4");
        title.textContent = card.card;
        meta.appendChild(title);
        const info = document.createElement("p");
        info.textContent = `${card.id} | ${formatNetworkTier(card.network, card.tier)} | ${card.foreignTransactionFee === false ? "No FTF" : "Has FTF"}`;
        meta.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "wallet-manager-item-actions";
        const starButton = document.createElement("button");
        starButton.type = "button";
        starButton.className = "wallet-star-button";
        starButton.setAttribute("aria-pressed", "true");
        starButton.textContent = "\u2605";
        starButton.onclick = () => {
            delete walletPrefs.favoritesByCardId[card.id];
            saveWalletPrefs();
            renderWalletManager();
            renderWalletMembershipManager();
        };
        actions.appendChild(starButton);

        item.appendChild(meta);
        item.appendChild(actions);
        walletManagerList.appendChild(item);
    });
}

function renderWalletMembershipManager() {
    if (!walletMembershipList || !walletMembershipProfileSelect) return;
    const profileKey = walletMembershipProfileSelect.value || PROFILE_MICHAEL;
    walletMembershipList.innerHTML = "";
    const search = (walletMembershipSearchInput.value || "").toLowerCase().trim();
    const walletSet = getProfileWalletSet(profileKey);
    const bothMode = profileKey === PROFILE_BOTH;

    walletEmptyButton.disabled = bothMode;
    walletQuickSetupButton.disabled = bothMode;
    if (walletMembershipNote) {
        walletMembershipNote.textContent = bothMode
            ? "Both = Michael + Jenna combined. Edit Michael/Jenna instead."
            : "";
    }

    cards
        .filter((card) => !search || card.card.toLowerCase().includes(search) || card.id.toLowerCase().includes(search))
        .sort((a, b) => a.card.localeCompare(b.card))
        .forEach((card) => {
            const item = document.createElement("article");
            item.className = "wallet-manager-item";
            const meta = document.createElement("div");
            const title = document.createElement("h4");
            title.textContent = card.card;
            meta.appendChild(title);
            const info = document.createElement("p");
            info.textContent = `${card.id} | ${formatNetworkTier(card.network, card.tier)} | ${card.foreignTransactionFee === false ? "No FTF" : "Has FTF"}`;
            meta.appendChild(info);

            const actions = document.createElement("div");
            actions.className = "wallet-manager-item-actions";
            const toggleButton = document.createElement("button");
            toggleButton.type = "button";
            toggleButton.className = "wallet-toggle-button";
            toggleButton.disabled = bothMode;
            toggleButton.textContent = walletSet.has(card.id) ? "In Wallet" : "Add To Wallet";
            toggleButton.onclick = () => {
                if (bothMode) return;
                const set = getProfileWalletSet(profileKey);
                if (set.has(card.id)) set.delete(card.id);
                else set.add(card.id);
                setProfileWalletSet(profileKey, set);
                renderWalletMembershipManager();
            };
            actions.appendChild(toggleButton);

            item.appendChild(meta);
            item.appendChild(actions);
            walletMembershipList.appendChild(item);
        });
}

function getBankMultiplier(bankKey) {
    const bank = getBankByKey(bankKey);
    return bank && Number.isFinite(Number(bank.value)) ? Number(bank.value) : 1;
}

function rankCardsForCategory(categoryKey, requireNoFtf) {
    const normalizedCategory = dsNormalizeBonusKey(categoryKey);
    const isDefaultOnly = normalizedCategory === DEFAULT_ONLY_CATEGORY_KEY;
    return cards
        .filter((card) => !requireNoFtf || card.foreignTransactionFee === false)
        .map((card) => {
            const bonuses = card.bonuses || {};
            const hasCategory = !isDefaultOnly && Object.prototype.hasOwnProperty.call(bonuses, normalizedCategory);
            const appliedBonus = hasCategory ? bonuses[normalizedCategory] : bonuses.default;
            const numericBonus = Number(appliedBonus);
            if (!Number.isFinite(numericBonus)) return null;
            return {
                card,
                appliedBonus: numericBonus,
                weightedValue: numericBonus * getBankMultiplier(card.bank),
                source: hasCategory ? "category" : "default",
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.weightedValue !== a.weightedValue) return b.weightedValue - a.weightedValue;
            if (b.appliedBonus !== a.appliedBonus) return b.appliedBonus - a.appliedBonus;
            if (a.source !== b.source) return a.source === "category" ? -1 : 1;
            return a.card.card.localeCompare(b.card.card);
        });
}

function getGeneralRanking(requireNoFtf) {
    return rankCardsForCategory("default", requireNoFtf).map((entry) => entry.card);
}

function openQuickSetup() {
    const profileKey = walletMembershipProfileSelect.value;
    if (profileKey === PROFILE_BOTH) return;
    walletQuickSetupCategories.innerHTML = "";
    getKnownCategories().forEach((category) => {
        const label = document.createElement("label");
        label.className = "quick-setup-category";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = category;
        const text = document.createElement("span");
        text.textContent = dsPrettyLabelFromKey(category);
        label.appendChild(checkbox);
        label.appendChild(text);
        walletQuickSetupCategories.appendChild(label);
    });
    walletQuickSetupSummary.textContent = "";
    walletQuickSetupModal.classList.remove("hidden");
}

function closeQuickSetup() {
    walletQuickSetupModal.classList.add("hidden");
}

function buildQuickSetupWallet() {
    const profileKey = walletMembershipProfileSelect.value;
    if (profileKey === PROFILE_BOTH) return;
    const selectedCategories = Array.from(walletQuickSetupCategories.querySelectorAll("input[type='checkbox']:checked"))
        .map((input) => dsNormalizeBonusKey(input.value))
        .filter(Boolean);
    if (!selectedCategories.length) {
        walletQuickSetupSummary.textContent = "Select at least one category.";
        return;
    }

    const size = Math.max(1, Number(walletQuickSetupSizeInput.value) || 1);
    const requireNoFtf = Boolean(walletQuickSetupNoFtfInput.checked);
    const coverageByCardId = new Map();
    const categoriesByCardId = new Map();
    const initialCardIds = new Set();

    selectedCategories.forEach((category) => {
        const ranked = rankCardsForCategory(category, requireNoFtf);
        if (!ranked.length) return;
        const best = ranked[0].card;
        initialCardIds.add(best.id);
        coverageByCardId.set(best.id, (coverageByCardId.get(best.id) || 0) + 1);
        if (!categoriesByCardId.has(best.id)) categoriesByCardId.set(best.id, []);
        categoriesByCardId.get(best.id).push(category);
    });

    const generalRanking = getGeneralRanking(requireNoFtf);
    let selectedIds = Array.from(initialCardIds);
    if (selectedIds.length > size) {
        selectedIds.sort((a, b) => {
            const scoreA = coverageByCardId.get(a) || 0;
            const scoreB = coverageByCardId.get(b) || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            const rankA = generalRanking.findIndex((card) => card.id === a);
            const rankB = generalRanking.findIndex((card) => card.id === b);
            if (rankA !== rankB) return rankA - rankB;
            const cardA = cards.find((card) => card.id === a);
            const cardB = cards.find((card) => card.id === b);
            return (cardA ? cardA.card : a).localeCompare(cardB ? cardB.card : b);
        });
        selectedIds = selectedIds.slice(0, size);
    }
    if (selectedIds.length < size) {
        generalRanking.forEach((card) => {
            if (selectedIds.length >= size) return;
            if (!selectedIds.includes(card.id)) selectedIds.push(card.id);
        });
    }

    setProfileWalletSet(profileKey, new Set(selectedIds));
    renderWalletManager();
    renderWalletMembershipManager();

    const summaryLines = [`Built ${selectedIds.length} cards for ${profileKey}.`];
    selectedIds.forEach((id) => {
        const card = cards.find((item) => item.id === id);
        const covered = categoriesByCardId.get(id) || [];
        const coveredLabel = covered.length ? covered.map((key) => dsPrettyLabelFromKey(key)).join(", ") : "General value fill";
        summaryLines.push(`- ${card ? card.card : id}: ${coveredLabel}`);
    });
    walletQuickSetupSummary.textContent = summaryLines.join("\n");
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
        if (!cardPhotoFileInput.value && !currentPhotoValue.startsWith("data:image/")) currentPhotoValue = "";
        setPhotoPreview(currentPhotoValue);
    }
}

async function loadInitialData() {
    try {
        const [rawBanks, rawCards] = await Promise.all([
            dsLoadDataset(banksStorageKey, "./database/banks.json"),
            dsLoadDataset(cardsStorageKey, "./database/cards.json"),
        ]);
        banks = dsNormalizeBanksForRuntime(rawBanks);
        cards = dsNormalizeCardsForRuntime(rawCards);
        walletPrefs = loadWalletPrefs();
        migrateWalletPrefsToIds();
        saveWalletPrefs();
        if (walletMembershipProfileSelect) walletMembershipProfileSelect.value = walletPrefs.activeProfile || PROFILE_MICHAEL;
        renderCards();
        renderWalletManager();
        renderWalletMembershipManager();
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

cardNameInput.addEventListener("input", () => {
    if (cardIdTouched) return;
    const base = dsNormalizeCardId(cardNameInput.value);
    cardIdInput.value = base ? nextAvailableCardId(base) : "";
});
cardIdInput.addEventListener("input", () => {
    cardIdTouched = true;
    cardIdInput.value = dsNormalizeCardId(cardIdInput.value);
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
addBonusRowButton.addEventListener("click", () => createBonusRow("", 1));
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
if (exportCardsPublishButton) exportCardsPublishButton.addEventListener("click", exportCardsForPublish);
importCardsButton.addEventListener("click", () => importCardsFile.click());
importCardsFile.addEventListener("change", importCardsFromFile);
syncCardsButton.addEventListener("click", syncCardsFromSource);

walletMembershipProfileSelect.addEventListener("change", () => {
    walletPrefs.activeProfile = walletMembershipProfileSelect.value;
    saveWalletPrefs();
    renderWalletMembershipManager();
});
walletMembershipSearchInput.addEventListener("input", renderWalletMembershipManager);
walletEmptyButton.addEventListener("click", () => {
    const profileKey = walletMembershipProfileSelect.value;
    if (profileKey === PROFILE_BOTH) return;
    if (!confirm(`Empty wallet for ${profileKey}?`)) return;
    setProfileWalletSet(profileKey, new Set());
    renderWalletMembershipManager();
});
walletQuickSetupButton.addEventListener("click", openQuickSetup);
closeWalletQuickSetupButton.addEventListener("click", closeQuickSetup);
walletQuickSetupModal.addEventListener("click", (event) => {
    if (event.target === walletQuickSetupModal) closeQuickSetup();
});
walletQuickSetupBuildButton.addEventListener("click", buildQuickSetupWallet);
walletManageMembershipButton.addEventListener("click", () => {
    if (advancedSection && advancedSection.tagName === "DETAILS") {
        advancedSection.open = true;
    }
    if (advancedSection) {
        advancedSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
});

loadInitialData();
