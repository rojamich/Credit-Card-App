const {
    loadDataset: dsLoadDataset,
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankName: dsNormalizeBankName,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
} = window.CCDataStore;

const FAVORITES_STORAGE_KEY = "wallet.favoriteCategories";
const DEFAULT_ONLY_CATEGORY_KEY = "__default__";

const walletState = {
    cardData: [],
    bankData: [],
    categories: [],
    favoriteCategories: new Set(),
    selectedCategoryKey: null,
};

async function fetchAndRenderBonuses() {
    try {
        const [rawCards, rawBanks] = await Promise.all([
            dsLoadDataset(cardsStorageKey, "./database/cardsData.json"),
            dsLoadDataset(banksStorageKey, "./database/bankData.json"),
        ]);

        walletState.cardData = dsNormalizeCardsForRuntime(rawCards);
        walletState.bankData = dsNormalizeBanksForRuntime(rawBanks);

        const cardCategories = getAllCategoriesFromCards(walletState.cardData);
        walletState.categories = [...cardCategories, DEFAULT_ONLY_CATEGORY_KEY];

        walletState.favoriteCategories = loadFavoriteCategories();
        syncFavoriteCategories(walletState.categories, walletState.favoriteCategories);

        renderQuickCategories(walletState.categories, walletState.favoriteCategories, walletState.selectedCategoryKey);
        attachQuickCategoryEvents();

        renderBonuses(sortBonuses(cardCategories), walletState.cardData, walletState.bankData);
    } catch (error) {
        console.error("Error fetching or rendering bonuses:", error);
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
        favoriteButton.textContent = isFavorite ? "★" : "☆";

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

function selectCategory(categoryKey) {
    walletState.selectedCategoryKey = categoryKey;
    renderQuickCategories(walletState.categories, walletState.favoriteCategories, walletState.selectedCategoryKey);
    updateBonusSelectionHighlight(categoryKey);
    showBestCard(categoryKey, walletState.cardData, walletState.bankData);
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

function renderBonuses(bonuses, cardData, bankData) {
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

    const relevantCards = cardData
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
        console.warn(`No valid cards found for bonus: ${normalizedBonus}`);
        return;
    }

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

fetchAndRenderBonuses();
