const {
    loadDataset: dsLoadDataset,
    readLocalJson: dsReadLocalJson,
    writeLocalJson: dsWriteLocalJson,
    validateAndNormalizeCards: dsValidateAndNormalizeCards,
    validateAndNormalizeBanks: dsValidateAndNormalizeBanks,
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankName: dsNormalizeBankName,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    prettyLabelFromKey: dsPrettyLabelFromKey,
} = window.CCDataStore;

const FAVORITES_STORAGE_KEY = "wallet.favoriteCategories";
const ONLY_WALLET_STORAGE_KEY = "wallet.onlyInWalletCards";
const LAST_SYNC_STORAGE_KEY = "wallet.lastSync";
const DEFAULT_ONLY_CATEGORY_KEY = "__default__";

const walletState = {
    cardData: [],
    bankData: [],
    categories: [],
    favoriteCategories: new Set(),
    selectedCategoryKey: null,
    useOnlyWalletCards: true,
};

const onlyWalletToggle = document.getElementById("only-wallet-cards-toggle");
const refreshDataButton = document.getElementById("refresh-wallet-data-button");
const resetDataButton = document.getElementById("reset-wallet-data-button");
const controlsMessageEl = document.getElementById("wallet-controls-message");
const lastSyncEl = document.getElementById("wallet-last-sync");

function setControlsMessage(message, isError) {
    if (!controlsMessageEl) return;
    controlsMessageEl.textContent = message;
    controlsMessageEl.className = `wallet-status ${isError ? "is-error" : "is-success"}`;
}

function formatTimestamp(isoValue) {
    if (!isoValue) return "Never";
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) return "Never";
    return parsed.toLocaleString();
}

function renderLastSync() {
    if (!lastSyncEl) return;
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    lastSyncEl.textContent = `Last synced: ${formatTimestamp(raw)}`;
}

function loadOnlyWalletSetting() {
    try {
        const stored = localStorage.getItem(ONLY_WALLET_STORAGE_KEY);
        if (stored === null) return true;
        return stored !== "false";
    } catch (error) {
        return true;
    }
}

function saveOnlyWalletSetting(value) {
    try {
        localStorage.setItem(ONLY_WALLET_STORAGE_KEY, value ? "true" : "false");
    } catch (error) {
        // Ignore storage write failures.
    }
}

async function loadWalletData() {
    const [rawCards, rawBanks] = await Promise.all([
        dsLoadDataset(cardsStorageKey, "./database/cardsData.json"),
        dsLoadDataset(banksStorageKey, "./database/bankData.json"),
    ]);

    walletState.cardData = dsNormalizeCardsForRuntime(rawCards);
    walletState.bankData = dsNormalizeBanksForRuntime(rawBanks);
}

function refreshWalletUi() {
    const cardCategories = getAllCategoriesFromCards(walletState.cardData);
    walletState.categories = [...cardCategories, DEFAULT_ONLY_CATEGORY_KEY];

    walletState.favoriteCategories = loadFavoriteCategories();
    syncFavoriteCategories(walletState.categories, walletState.favoriteCategories);

    if (walletState.selectedCategoryKey && !walletState.categories.includes(walletState.selectedCategoryKey)) {
        walletState.selectedCategoryKey = null;
    }

    renderQuickCategories(walletState.categories, walletState.favoriteCategories, walletState.selectedCategoryKey);
    renderBonuses(sortBonuses(cardCategories), walletState.cardData);
}

async function fetchAndRenderBonuses() {
    try {
        walletState.useOnlyWalletCards = loadOnlyWalletSetting();
        if (onlyWalletToggle) onlyWalletToggle.checked = walletState.useOnlyWalletCards;
        renderLastSync();

        await loadWalletData();
        refreshWalletUi();
        attachQuickCategoryEvents();
        attachWalletControlEvents();
    } catch (error) {
        console.error("Error fetching or rendering bonuses:", error);
        setControlsMessage("Offline: using saved data.", true);
    }
}

function loadFavoriteCategories() {
    try {
        const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();

        const normalized = parsed
            .map((key) => String(key || "").trim())
            .map((key) => (key === DEFAULT_ONLY_CATEGORY_KEY ? key : dsNormalizeBonusKey(key)))
            .filter(Boolean);

        return new Set(normalized);
    } catch (error) {
        return new Set();
    }
}

function saveFavoriteCategories(favoritesSet) {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoritesSet)));
    } catch (error) {
        // localStorage unavailable; keep runtime-only favorites.
    }
}

function toggleFavoriteCategory(categoryKey, favoritesSet) {
    const normalizedKey = categoryKey === DEFAULT_ONLY_CATEGORY_KEY ? categoryKey : dsNormalizeBonusKey(categoryKey);
    if (!normalizedKey) return favoritesSet;

    if (favoritesSet.has(normalizedKey)) {
        favoritesSet.delete(normalizedKey);
    } else {
        const reordered = [normalizedKey, ...Array.from(favoritesSet).filter((key) => key !== normalizedKey)];
        favoritesSet.clear();
        reordered.forEach((key) => favoritesSet.add(key));
    }

    saveFavoriteCategories(favoritesSet);
    return favoritesSet;
}

function getAllCategoriesFromCards(cardData) {
    const categorySet = new Set();

    cardData.forEach((card) => {
        const bonuses = card.bonuses || {};
        Object.keys(bonuses).forEach((bonusKey) => {
            const normalizedKey = dsNormalizeBonusKey(bonusKey);
            if (!normalizedKey || normalizedKey === "default") return;
            categorySet.add(normalizedKey);
        });
    });

    return Array.from(categorySet);
}

function prettyLabelFromKey(key) {
    if (key === DEFAULT_ONLY_CATEGORY_KEY) return "Other";
    if (typeof dsPrettyLabelFromKey === "function") return dsPrettyLabelFromKey(key);
    const normalized = dsNormalizeBonusKey(key);
    if (!normalized) return "Unknown";
    return normalized
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function syncFavoriteCategories(validCategories, favoritesSet) {
    const validSet = new Set(validCategories);
    let changed = false;

    Array.from(favoritesSet).forEach((key) => {
        if (!validSet.has(key)) {
            favoritesSet.delete(key);
            changed = true;
        }
    });

    if (changed) saveFavoriteCategories(favoritesSet);
}

function sortBonuses(bonuses) {
    return bonuses.slice().sort((a, b) => prettyLabelFromKey(a).localeCompare(prettyLabelFromKey(b)));
}

function orderQuickCategories(categories, favoritesSet) {
    const favoriteKeys = Array.from(favoritesSet).filter((key) => categories.includes(key));
    const favoriteSet = new Set(favoriteKeys);
    const nonFavoriteKeys = categories
        .filter((key) => !favoriteSet.has(key))
        .sort((a, b) => prettyLabelFromKey(a).localeCompare(prettyLabelFromKey(b)));

    return [...favoriteKeys, ...nonFavoriteKeys];
}

function renderQuickCategories(categories, favoritesSet, selectedCategoryKey) {
    const grid = document.getElementById("quick-categories-grid");
    if (!grid) return;

    const orderedCategories = orderQuickCategories(categories, favoritesSet);
    grid.innerHTML = "";

    orderedCategories.forEach((categoryKey) => {
        const label = prettyLabelFromKey(categoryKey);
        const isSelected = selectedCategoryKey === categoryKey;
        const isFavorite = favoritesSet.has(categoryKey);

        const item = document.createElement("div");
        item.className = "quick-category-item";
        if (isSelected) item.classList.add("is-selected");
        if (isFavorite) item.classList.add("is-favorite");

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = "quick-category-button";
        selectButton.dataset.action = "select";
        selectButton.dataset.category = categoryKey;
        selectButton.setAttribute("aria-pressed", isSelected ? "true" : "false");
        selectButton.textContent = label;

        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = "quick-category-star";
        favoriteButton.dataset.action = "favorite";
        favoriteButton.dataset.category = categoryKey;
        favoriteButton.setAttribute("aria-label", `Favorite ${label}`);
        favoriteButton.setAttribute("aria-pressed", isFavorite ? "true" : "false");
        favoriteButton.title = isFavorite ? "Remove favorite" : "Favorite";
        favoriteButton.textContent = isFavorite ? "\u2605" : "\u2606";

        item.appendChild(selectButton);
        item.appendChild(favoriteButton);
        grid.appendChild(item);
    });
}

function attachQuickCategoryEvents() {
    const grid = document.getElementById("quick-categories-grid");
    if (!grid || grid.dataset.bound === "true") return;
    grid.dataset.bound = "true";

    grid.addEventListener("click", (event) => {
        const actionButton = event.target.closest("button[data-action]");
        if (!actionButton || !grid.contains(actionButton)) return;

        const categoryKey = String(actionButton.dataset.category || "");
        if (!categoryKey) return;

        if (actionButton.dataset.action === "favorite") {
            event.preventDefault();
            event.stopPropagation();
            toggleFavoriteCategory(categoryKey, walletState.favoriteCategories);
            renderQuickCategories(walletState.categories, walletState.favoriteCategories, walletState.selectedCategoryKey);
            return;
        }

        if (actionButton.dataset.action === "select") {
            selectCategory(categoryKey);
        }
    });
}

function getBankDetails(bankName, bankData) {
    const normalizedCardBank = dsNormalizeBankName(bankName);
    const matchedBank = bankData.find((bank) => dsNormalizeBankName(bank.key) === normalizedCardBank);

    if (matchedBank) {
        return {
            multiplier: matchedBank.value,
            type: matchedBank.type,
            unknownBank: false,
            displayName: matchedBank.label || matchedBank.key,
            key: matchedBank.key,
        };
    }

    return {
        multiplier: 1,
        type: "Cash Back",
        unknownBank: true,
        displayName: String(bankName || "").trim(),
        key: String(bankName || "").trim(),
    };
}

function renderBonuses(bonuses, cardData) {
    const container = document.getElementById("bonus-container");
    if (!container) return;

    container.innerHTML = "";

    bonuses.forEach((bonus) => {
        const normalizedBonus = dsNormalizeBonusKey(bonus);
        if (!normalizedBonus) return;

        const box = document.createElement("div");
        box.className = "bonus-box";
        box.dataset.bonus = normalizedBonus;
        box.addEventListener("click", () => {
            selectCategory(normalizedBonus);
        });

        const logo = document.createElement("img");
        logo.className = "bonus-logo";
        logo.src = `./logo/cardBonusesIcons/${normalizedBonus}-icon.png`;
        logo.alt = `${prettyLabelFromKey(normalizedBonus)} icon`;
        logo.onerror = () => {
            logo.src = "./logo/cardBonusesIcons/default-icon.png";
        };

        const name = document.createElement("span");
        name.className = "bonus-name";
        name.textContent = prettyLabelFromKey(normalizedBonus);

        box.appendChild(logo);
        box.appendChild(name);
        container.appendChild(box);
    });
}

function updateBonusSelectionHighlight(selectedCategoryKey) {
    const bonusBoxes = document.querySelectorAll(".bonus-box");
    bonusBoxes.forEach((box) => {
        box.classList.toggle("is-selected", box.dataset.bonus === selectedCategoryKey);
    });
}

function getEffectiveCardsForRanking(allCards) {
    if (!walletState.useOnlyWalletCards) return allCards;
    return allCards.filter((card) => card.inWallet !== false);
}

function selectCategory(categoryKey) {
    walletState.selectedCategoryKey = categoryKey;
    renderQuickCategories(walletState.categories, walletState.favoriteCategories, walletState.selectedCategoryKey);
    updateBonusSelectionHighlight(categoryKey);
    showBestCard(categoryKey, walletState.cardData, walletState.bankData);
}

function createInfoLine(text) {
    const line = document.createElement("p");
    line.textContent = text;
    return line;
}

function showBestCard(bonus, cardData, bankData) {
    const isDefaultOnly = bonus === DEFAULT_ONLY_CATEGORY_KEY;
    const normalizedBonus = isDefaultOnly ? "default" : dsNormalizeBonusKey(bonus);
    if (!normalizedBonus) return;

    const existingPopup = document.querySelector(".popup");
    if (existingPopup) existingPopup.remove();

    const rankingCards = getEffectiveCardsForRanking(cardData);

    const relevantCards = rankingCards
        .map((card) => {
            const normalizedBonuses = card.bonuses || {};
            const hasCategoryBonus = !isDefaultOnly && Object.prototype.hasOwnProperty.call(normalizedBonuses, normalizedBonus);
            const appliedBonus = hasCategoryBonus ? normalizedBonuses[normalizedBonus] : normalizedBonuses.default;
            const numericBonus = Number(appliedBonus);
            if (!Number.isFinite(numericBonus)) return null;

            const bankDetails = getBankDetails(card.bank, bankData);
            const weightedValue = numericBonus * bankDetails.multiplier;

            return {
                card: card.card,
                bank: card.bank,
                photoPath: card.photo || card.photoPath || "",
                appliedBonus: numericBonus,
                weightedValue,
                bankType: bankDetails.type,
                bankMultiplier: bankDetails.multiplier,
                source: hasCategoryBonus ? "category" : "default",
                unknownBank: bankDetails.unknownBank,
                unknownBankName: bankDetails.displayName,
                bankKey: bankDetails.key,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.weightedValue !== a.weightedValue) return b.weightedValue - a.weightedValue;
            if (b.appliedBonus !== a.appliedBonus) return b.appliedBonus - a.appliedBonus;
            if (a.source !== b.source) return a.source === "category" ? -1 : 1;
            return a.card.localeCompare(b.card);
        });

    if (!relevantCards.length) {
        setControlsMessage("No eligible cards for this category.", true);
        return;
    }

    setControlsMessage("", false);

    let currentIndex = 0;

    const popup = document.createElement("div");
    popup.className = "popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");

    const popupContent = document.createElement("div");
    popupContent.className = "popup-content";
    popup.appendChild(popupContent);

    const closePopup = () => {
        document.removeEventListener("keydown", onKeyDown);
        popup.remove();
    };

    const onKeyDown = (event) => {
        if (event.key === "Escape") closePopup();
    };

    const updatePopupContent = () => {
        const card = relevantCards[currentIndex];
        const categoryLabel = isDefaultOnly ? "Other" : prettyLabelFromKey(normalizedBonus);
        popupContent.innerHTML = "";

        const image = document.createElement("img");
        image.className = "popup-card-image";
        image.src = card.photoPath || "./logo/cardBonusesIcons/default-icon.png";
        image.alt = card.card;
        image.onerror = () => {
            image.src = "./logo/cardBonusesIcons/default-icon.png";
        };

        const title = document.createElement("h2");
        title.textContent = card.card;

        popupContent.appendChild(image);
        popupContent.appendChild(title);
        popupContent.appendChild(createInfoLine(`Rank: #${currentIndex + 1} of ${relevantCards.length}`));
        popupContent.appendChild(createInfoLine(`Bank: ${card.unknownBank ? card.bank : card.unknownBankName}`));
        if (!card.unknownBank && card.bankKey && card.bankKey !== card.unknownBankName) {
            popupContent.appendChild(createInfoLine(`Bank Key: ${card.bankKey}`));
        }
        popupContent.appendChild(createInfoLine(`Bonus: ${card.appliedBonus.toFixed(1)}x on ${categoryLabel}`));
        popupContent.appendChild(createInfoLine(`Current Value: ${card.weightedValue.toFixed(2)} (${card.bankType} @ ${card.bankMultiplier.toFixed(2)}x)`));
        popupContent.appendChild(createInfoLine(`Source: ${card.source === "category" ? "Category bonus" : "Default bonus"}`));

        if (card.unknownBank) {
            const warning = createInfoLine(`Unknown bank key: ${card.bank} (using multiplier 1)`);
            warning.className = "popup-warning";
            popupContent.appendChild(warning);
        }

        const buttonsWrap = document.createElement("div");
        buttonsWrap.className = "popup-buttons";

        const prevButton = document.createElement("button");
        prevButton.type = "button";
        prevButton.textContent = "Previous Card";
        prevButton.onclick = () => {
            currentIndex = (currentIndex - 1 + relevantCards.length) % relevantCards.length;
            updatePopupContent();
        };

        const nextButton = document.createElement("button");
        nextButton.type = "button";
        nextButton.textContent = "Next Best Card";
        nextButton.onclick = () => {
            currentIndex = (currentIndex + 1) % relevantCards.length;
            updatePopupContent();
        };

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "Close";
        closeButton.onclick = closePopup;

        buttonsWrap.appendChild(prevButton);
        buttonsWrap.appendChild(nextButton);
        buttonsWrap.appendChild(closeButton);
        popupContent.appendChild(buttonsWrap);
    };

    popup.addEventListener("click", (event) => {
        if (event.target === popup) closePopup();
    });

    popupContent.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    updatePopupContent();
    document.body.appendChild(popup);
    document.addEventListener("keydown", onKeyDown);
}

async function fetchFirstAvailableJson(paths) {
    let lastError = null;
    for (const path of paths) {
        try {
            const response = await fetch(`${path}?ts=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) {
                lastError = new Error(`Failed to fetch ${path}`);
                continue;
            }
            return response.json();
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error("No available dataset source.");
}

async function refreshDataFromNetwork() {
    try {
        const [remoteCards, remoteBanks] = await Promise.all([
            fetchFirstAvailableJson(["./database/cards.json", "./database/cardsData.json"]),
            fetchFirstAvailableJson(["./database/banks.json", "./database/bankData.json"]),
        ]);

        const cardsValidation = dsValidateAndNormalizeCards(remoteCards);
        const banksValidation = dsValidateAndNormalizeBanks(remoteBanks);
        if (!cardsValidation.ok) throw new Error(cardsValidation.errors.join(" "));
        if (!banksValidation.ok) throw new Error(banksValidation.errors.join(" "));

        dsWriteLocalJson(cardsStorageKey, cardsValidation.data);
        dsWriteLocalJson(banksStorageKey, banksValidation.data);
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());
        renderLastSync();

        await loadWalletData();
        refreshWalletUi();
        setControlsMessage("Data refreshed.", false);
    } catch (error) {
        const localCards = dsReadLocalJson(cardsStorageKey);
        const localBanks = dsReadLocalJson(banksStorageKey);
        if (localCards && localBanks) {
            await loadWalletData();
            refreshWalletUi();
        }
        setControlsMessage("Offline: using saved data.", true);
    }
}

function resetLocalWalletData() {
    const keysToClear = [
        cardsStorageKey,
        banksStorageKey,
        FAVORITES_STORAGE_KEY,
        ONLY_WALLET_STORAGE_KEY,
        LAST_SYNC_STORAGE_KEY,
    ];

    keysToClear.forEach((key) => localStorage.removeItem(key));
    location.reload();
}

function attachWalletControlEvents() {
    if (onlyWalletToggle && onlyWalletToggle.dataset.bound !== "true") {
        onlyWalletToggle.dataset.bound = "true";
        onlyWalletToggle.addEventListener("change", () => {
            walletState.useOnlyWalletCards = Boolean(onlyWalletToggle.checked);
            saveOnlyWalletSetting(walletState.useOnlyWalletCards);
            if (walletState.selectedCategoryKey) {
                showBestCard(walletState.selectedCategoryKey, walletState.cardData, walletState.bankData);
            }
        });
    }

    if (refreshDataButton && refreshDataButton.dataset.bound !== "true") {
        refreshDataButton.dataset.bound = "true";
        refreshDataButton.addEventListener("click", refreshDataFromNetwork);
    }

    if (resetDataButton && resetDataButton.dataset.bound !== "true") {
        resetDataButton.dataset.bound = "true";
        resetDataButton.addEventListener("click", resetLocalWalletData);
    }
}

fetchAndRenderBonuses();
