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
    normalizeBankKey: dsNormalizeBankKey,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    prettyLabelFromKey: dsPrettyLabelFromKey,
} = window.CCDataStore;

const WALLET_PREFS_STORAGE_KEY = "walletAppPrefs";
const LAST_SYNC_STORAGE_KEY = "wallet.lastSync";
const DEFAULT_ONLY_CATEGORY_KEY = "__default__";
const MAX_FAVORITE_CATEGORIES = 8;
const PROFILE_MICHAEL = "michael";
const PROFILE_JENNA = "jenna";
const PROFILE_BOTH = "both";
const FILTER_ALL = "all";
const FILTER_WALLET = "wallet";
const FILTER_FAVORITES = "favorites";
const FILTER_FAVORITES_WALLET = "favorites_wallet";

const walletState = {
    cardData: [],
    bankData: [],
    categories: [],
    selectedCategoryKey: null,
    prefs: null,
    isFreshPrefs: false,
};

const profileSelect = document.getElementById("wallet-profile-select");
const filterSelect = document.getElementById("wallet-filter-select");
const profileNoteEl = document.getElementById("wallet-profile-note");
const favoriteCategoriesGrid = document.getElementById("favorite-categories-grid");
const favoriteCategoriesEmpty = document.getElementById("favorite-categories-empty");
const walletCardsGrid = document.getElementById("wallet-cards-grid");
const refreshDataButton = document.getElementById("refresh-wallet-data-button");
const resetDataButton = document.getElementById("reset-wallet-data-button");
const controlsMessageEl = document.getElementById("wallet-controls-message");
const lastSyncEl = document.getElementById("wallet-last-sync");

function createDefaultPrefs() {
    return {
        version: 1,
        activeProfile: PROFILE_MICHAEL,
        activeFilter: FILTER_ALL,
        favoritesByCardKey: {},
        profiles: {
            michael: { walletCardKeys: [] },
            jenna: { walletCardKeys: [] },
        },
    };
}

function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function normalizePrefs(rawPrefs) {
    const defaults = createDefaultPrefs();
    const source = rawPrefs && typeof rawPrefs === "object" ? rawPrefs : {};
    const sourceProfiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
    const sourceFavorites = source.favoritesByCardKey && typeof source.favoritesByCardKey === "object"
        ? source.favoritesByCardKey
        : {};

    const normalized = {
        version: 1,
        activeProfile: [PROFILE_MICHAEL, PROFILE_JENNA, PROFILE_BOTH].includes(source.activeProfile)
            ? source.activeProfile
            : defaults.activeProfile,
        activeFilter: [FILTER_ALL, FILTER_WALLET, FILTER_FAVORITES, FILTER_FAVORITES_WALLET].includes(source.activeFilter)
            ? source.activeFilter
            : defaults.activeFilter,
        favoritesByCardKey: {},
        profiles: {
            michael: { walletCardKeys: asStringArray(sourceProfiles.michael && sourceProfiles.michael.walletCardKeys) },
            jenna: { walletCardKeys: asStringArray(sourceProfiles.jenna && sourceProfiles.jenna.walletCardKeys) },
        },
    };

    Object.keys(sourceFavorites).forEach((cardKey) => {
        if (sourceFavorites[cardKey]) normalized.favoritesByCardKey[String(cardKey)] = true;
    });

    return normalized;
}

function loadWalletPrefs() {
    try {
        const raw = localStorage.getItem(WALLET_PREFS_STORAGE_KEY);
        if (!raw) {
            walletState.isFreshPrefs = true;
            return createDefaultPrefs();
        }
        const parsed = JSON.parse(raw);
        walletState.isFreshPrefs = false;
        return normalizePrefs(parsed);
    } catch (error) {
        walletState.isFreshPrefs = true;
        return createDefaultPrefs();
    }
}

function saveWalletPrefs() {
    try {
        localStorage.setItem(WALLET_PREFS_STORAGE_KEY, JSON.stringify(walletState.prefs));
    } catch (error) {
        // Ignore storage write failures.
    }
}

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

function getCardStorageBaseKey(card) {
    const explicit = dsNormalizeBonusKey(card.key || card.cardKey || "");
    if (explicit) return explicit;
    const fromName = dsNormalizeBonusKey(card.card || card.name || "");
    return fromName || "card";
}

function applyCardStorageKeys(cards) {
    const keyCounts = new Map();
    cards.forEach((card) => {
        const baseKey = getCardStorageBaseKey(card);
        keyCounts.set(baseKey, (keyCounts.get(baseKey) || 0) + 1);
    });

    const usedKeys = new Set();
    return cards.map((card, index) => {
        const baseKey = getCardStorageBaseKey(card);
        let cardKey = baseKey;

        if ((keyCounts.get(baseKey) || 0) > 1) {
            const bankKey = dsNormalizeBonusKey(dsNormalizeBankKey(card.bank || "")) || "bank";
            cardKey = `${baseKey}__${bankKey}`;
        }

        let attempt = cardKey;
        let suffix = 2;
        while (usedKeys.has(attempt)) {
            attempt = `${cardKey}__${suffix}`;
            suffix += 1;
        }
        usedKeys.add(attempt);

        return { ...card, _walletCardKey: attempt, _walletCardIndex: index };
    });
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

function getFavoriteMap() {
    return walletState.prefs.favoritesByCardKey || {};
}

function isFavoriteCard(cardKey) {
    return Boolean(getFavoriteMap()[cardKey]);
}

function setFavoriteCard(cardKey, shouldFavorite) {
    const favorites = getFavoriteMap();
    if (shouldFavorite) favorites[cardKey] = true;
    else delete favorites[cardKey];
    saveWalletPrefs();
}

function getProfileWalletSet(profileKey) {
    if (profileKey === PROFILE_BOTH) {
        const michael = new Set(walletState.prefs.profiles.michael.walletCardKeys);
        walletState.prefs.profiles.jenna.walletCardKeys.forEach((cardKey) => michael.add(cardKey));
        return michael;
    }
    const profile = walletState.prefs.profiles[profileKey];
    return new Set(profile ? profile.walletCardKeys : []);
}

function setProfileWalletSet(profileKey, nextSet) {
    if (profileKey === PROFILE_BOTH) return;
    if (!walletState.prefs.profiles[profileKey]) return;
    walletState.prefs.profiles[profileKey].walletCardKeys = Array.from(nextSet);
    saveWalletPrefs();
}

function isCardInActiveWallet(cardKey) {
    const activeProfile = walletState.prefs.activeProfile;
    return getProfileWalletSet(activeProfile).has(cardKey);
}

function toggleCardInActiveWallet(cardKey) {
    const activeProfile = walletState.prefs.activeProfile;
    if (activeProfile === PROFILE_BOTH) return;
    const set = getProfileWalletSet(activeProfile);
    if (set.has(cardKey)) set.delete(cardKey);
    else set.add(cardKey);
    setProfileWalletSet(activeProfile, set);
}

function seedWalletFromLegacyInWalletIfNeeded() {
    if (!walletState.isFreshPrefs) return;
    const michaelSet = new Set(walletState.prefs.profiles.michael.walletCardKeys);
    if (michaelSet.size > 0) return;
    walletState.cardData.forEach((card) => {
        if (card.inWallet !== false) michaelSet.add(card._walletCardKey);
    });
    walletState.prefs.profiles.michael.walletCardKeys = Array.from(michaelSet);
    saveWalletPrefs();
}

function formatNetworkTier(networkRaw, tierRaw) {
    const network = String(networkRaw || "").toLowerCase();
    const tier = String(tierRaw || "").toLowerCase();

    const networkLabelMap = {
        visa: "Visa",
        amex: "Amex",
        mastercard: "Mastercard",
        discover: "Discover",
    };
    const tierLabelMap = {
        standard: "Standard",
        signature: "Signature",
        infinite: "Infinite",
        world: "World",
        "world-elite": "World Elite",
    };

    const networkLabel = networkLabelMap[network] || "Unknown";
    if (network === "amex") return "Amex";

    const tierLabel = tierLabelMap[tier] || "";
    if (!tierLabel || tier === "standard") return networkLabel;
    return `${networkLabel} ${tierLabel}`;
}

function getFavoriteCategoriesFromCards() {
    const counts = new Map();
    walletState.cardData.forEach((card) => {
        if (!isFavoriteCard(card._walletCardKey)) return;
        Object.keys(card.bonuses || {}).forEach((bonusKey) => {
            const normalized = dsNormalizeBonusKey(bonusKey);
            if (!normalized || normalized === "default") return;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
    });

    return Array.from(counts.entries())
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return prettyLabelFromKey(a[0]).localeCompare(prettyLabelFromKey(b[0]));
        })
        .slice(0, MAX_FAVORITE_CATEGORIES)
        .map(([key]) => key);
}

function renderFavoriteCategories() {
    if (!favoriteCategoriesGrid || !favoriteCategoriesEmpty) return;
    const categories = getFavoriteCategoriesFromCards();
    favoriteCategoriesGrid.innerHTML = "";
    favoriteCategoriesEmpty.classList.toggle("hidden", categories.length > 0);

    categories.forEach((categoryKey) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "favorite-category-chip";
        button.dataset.category = categoryKey;

        const icon = document.createElement("img");
        icon.className = "favorite-category-icon";
        icon.src = `./logo/cardBonusesIcons/${categoryKey}-icon.png`;
        icon.alt = "";
        icon.onerror = () => {
            icon.src = "./logo/cardBonusesIcons/default-icon.png";
        };

        const label = document.createElement("span");
        label.textContent = prettyLabelFromKey(categoryKey);

        button.appendChild(icon);
        button.appendChild(label);
        favoriteCategoriesGrid.appendChild(button);
    });
}

function sortBonuses(bonuses) {
    return bonuses.slice().sort((a, b) => prettyLabelFromKey(a).localeCompare(prettyLabelFromKey(b)));
}

function renderBonuses(bonuses) {
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

function cardPassesActiveFilter(card) {
    const isWallet = isCardInActiveWallet(card._walletCardKey);
    const isFavorite = isFavoriteCard(card._walletCardKey);

    switch (walletState.prefs.activeFilter) {
        case FILTER_WALLET:
            return isWallet;
        case FILTER_FAVORITES:
            return isFavorite;
        case FILTER_FAVORITES_WALLET:
            return isFavorite && isWallet;
        case FILTER_ALL:
        default:
            return true;
    }
}

function getEffectiveCardsForRanking(allCards) {
    return allCards.filter(cardPassesActiveFilter);
}

function renderProfileUi() {
    if (profileSelect) profileSelect.value = walletState.prefs.activeProfile;
    if (filterSelect) filterSelect.value = walletState.prefs.activeFilter;
    if (profileNoteEl) {
        profileNoteEl.textContent = walletState.prefs.activeProfile === PROFILE_BOTH
            ? "Both uses Michael + Jenna cards."
            : "";
    }
}

function createWalletCardMeta(text) {
    const p = document.createElement("p");
    p.className = "wallet-card-meta";
    p.textContent = text;
    return p;
}

function renderWalletCardsGrid() {
    if (!walletCardsGrid) return;
    walletCardsGrid.innerHTML = "";

    const filteredCards = walletState.cardData.filter(cardPassesActiveFilter);
    const cardsToRender = filteredCards;

    if (!cardsToRender.length) {
        const empty = document.createElement("p");
        empty.className = "wallet-card-meta";
        empty.textContent = "No cards match this filter.";
        walletCardsGrid.appendChild(empty);
        return;
    }

    cardsToRender.forEach((card) => {
        const item = document.createElement("article");
        item.className = "wallet-card-item";
        item.dataset.cardKey = card._walletCardKey;

        const image = document.createElement("img");
        image.className = "wallet-card-image";
        image.src = card.photoPath || "./logo/cardBonusesIcons/default-icon.png";
        image.alt = card.card;
        image.onerror = () => {
            image.src = "./logo/cardBonusesIcons/default-icon.png";
        };

        const body = document.createElement("div");
        body.className = "wallet-card-body";

        const header = document.createElement("div");
        header.className = "wallet-card-head";

        const name = document.createElement("h3");
        name.className = "wallet-card-name";
        name.textContent = card.card;

        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = "wallet-card-star";
        favoriteButton.dataset.action = "toggle-favorite";
        favoriteButton.dataset.cardKey = card._walletCardKey;
        favoriteButton.setAttribute("aria-label", `Favorite ${card.card}`);
        favoriteButton.setAttribute("aria-pressed", isFavoriteCard(card._walletCardKey) ? "true" : "false");
        favoriteButton.textContent = isFavoriteCard(card._walletCardKey) ? "\u2605" : "\u2606";

        header.appendChild(name);
        header.appendChild(favoriteButton);

        const badge = document.createElement("span");
        badge.className = "wallet-network-badge";
        badge.textContent = formatNetworkTier(card.network, card.tier);

        const walletToggle = document.createElement("button");
        walletToggle.type = "button";
        walletToggle.className = "wallet-toggle-button";
        walletToggle.dataset.action = "toggle-wallet";
        walletToggle.dataset.cardKey = card._walletCardKey;
        walletToggle.disabled = walletState.prefs.activeProfile === PROFILE_BOTH;
        walletToggle.textContent = isCardInActiveWallet(card._walletCardKey) ? "In Wallet" : "Add To Wallet";

        body.appendChild(header);
        body.appendChild(badge);
        body.appendChild(createWalletCardMeta(`Bank: ${card.bank}`));
        body.appendChild(walletToggle);

        item.appendChild(image);
        item.appendChild(body);
        walletCardsGrid.appendChild(item);
    });
}

function selectCategory(categoryKey) {
    walletState.selectedCategoryKey = categoryKey;
    updateBonusSelectionHighlight(categoryKey);
    showBestCard(categoryKey, walletState.cardData, walletState.bankData);
}

function createStatCard(label, value, useBadge) {
    const stat = document.createElement("div");
    stat.className = "popup-stat";

    const statLabel = document.createElement("p");
    statLabel.className = "popup-stat-label";
    statLabel.textContent = label;

    stat.appendChild(statLabel);
    if (useBadge) {
        const badge = document.createElement("span");
        badge.className = "popup-network-badge";
        badge.textContent = value;
        stat.appendChild(badge);
    } else {
        const statValue = document.createElement("p");
        statValue.className = "popup-stat-value";
        statValue.textContent = value;
        stat.appendChild(statValue);
    }
    return stat;
}

function renderPopupHeader(contentWrap, cardName, cardKey) {
    const head = document.createElement("div");
    head.className = "popup-head";

    const title = document.createElement("h2");
    title.className = "popup-title";
    title.textContent = cardName;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "popup-favorite-button";
    favoriteButton.setAttribute("aria-label", `Favorite ${cardName}`);
    favoriteButton.setAttribute("aria-pressed", isFavoriteCard(cardKey) ? "true" : "false");
    favoriteButton.dataset.action = "popup-favorite";
    favoriteButton.dataset.cardKey = cardKey;
    favoriteButton.textContent = isFavoriteCard(cardKey) ? "\u2605" : "\u2606";

    head.appendChild(title);
    head.appendChild(favoriteButton);
    contentWrap.appendChild(head);
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
                photoPath: card.photo || card.photoPath || "",
                appliedBonus: numericBonus,
                weightedValue,
                source: hasCategoryBonus ? "category" : "default",
                network: card.network,
                tier: card.tier,
                cardKey: card._walletCardKey,
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
        setControlsMessage("No eligible cards for this category and filter.", true);
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
        popupContent.appendChild(image);
        renderPopupHeader(popupContent, card.card, card.cardKey);

        const statsGrid = document.createElement("div");
        statsGrid.className = "popup-stats-grid";
        statsGrid.appendChild(createStatCard("Rank", `#${currentIndex + 1} of ${relevantCards.length}`, false));
        statsGrid.appendChild(createStatCard("Network Tier", formatNetworkTier(card.network, card.tier), true));
        statsGrid.appendChild(createStatCard("Bonus", `${card.appliedBonus.toFixed(1)}x ${categoryLabel}`, false));
        statsGrid.appendChild(createStatCard("Value", `${card.weightedValue.toFixed(2)}x`, false));
        popupContent.appendChild(statsGrid);

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
        const actionButton = event.target.closest("button[data-action]");
        if (actionButton && actionButton.dataset.action === "popup-favorite") {
            const cardKey = String(actionButton.dataset.cardKey || "");
            if (cardKey) {
                setFavoriteCard(cardKey, !isFavoriteCard(cardKey));
                renderFavoriteCategories();
                renderWalletCardsGrid();
                if (
                    walletState.prefs.activeFilter === FILTER_FAVORITES
                    || walletState.prefs.activeFilter === FILTER_FAVORITES_WALLET
                ) {
                    closePopup();
                    if (walletState.selectedCategoryKey) {
                        showBestCard(walletState.selectedCategoryKey, walletState.cardData, walletState.bankData);
                    }
                    return;
                }
                updatePopupContent();
            }
            return;
        }
        event.stopPropagation();
    });

    updatePopupContent();
    document.body.appendChild(popup);
    document.addEventListener("keydown", onKeyDown);
}

async function loadWalletData() {
    const [rawCards, rawBanks] = await Promise.all([
        dsLoadDataset(cardsStorageKey, "./database/cards.json"),
        dsLoadDataset(banksStorageKey, "./database/banks.json"),
    ]);

    walletState.cardData = applyCardStorageKeys(dsNormalizeCardsForRuntime(rawCards));
    walletState.bankData = dsNormalizeBanksForRuntime(rawBanks);
}

function refreshWalletUi() {
    const cardCategories = getAllCategoriesFromCards(walletState.cardData);
    walletState.categories = [...cardCategories, DEFAULT_ONLY_CATEGORY_KEY];

    renderProfileUi();
    renderFavoriteCategories();
    renderWalletCardsGrid();
    renderBonuses(sortBonuses(cardCategories));

    if (walletState.selectedCategoryKey && !walletState.categories.includes(walletState.selectedCategoryKey)) {
        walletState.selectedCategoryKey = null;
    }
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
        LAST_SYNC_STORAGE_KEY,
        WALLET_PREFS_STORAGE_KEY,
        "wallet.favoriteCategories",
        "wallet.onlyInWalletCards",
    ];
    keysToClear.forEach((key) => localStorage.removeItem(key));
    location.reload();
}

function attachWalletControlEvents() {
    if (profileSelect && profileSelect.dataset.bound !== "true") {
        profileSelect.dataset.bound = "true";
        profileSelect.addEventListener("change", () => {
            walletState.prefs.activeProfile = profileSelect.value;
            saveWalletPrefs();
            refreshWalletUi();
            if (walletState.selectedCategoryKey) {
                showBestCard(walletState.selectedCategoryKey, walletState.cardData, walletState.bankData);
            }
        });
    }

    if (filterSelect && filterSelect.dataset.bound !== "true") {
        filterSelect.dataset.bound = "true";
        filterSelect.addEventListener("change", () => {
            walletState.prefs.activeFilter = filterSelect.value;
            saveWalletPrefs();
            refreshWalletUi();
            if (walletState.selectedCategoryKey) {
                showBestCard(walletState.selectedCategoryKey, walletState.cardData, walletState.bankData);
            }
        });
    }

    if (favoriteCategoriesGrid && favoriteCategoriesGrid.dataset.bound !== "true") {
        favoriteCategoriesGrid.dataset.bound = "true";
        favoriteCategoriesGrid.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-category]");
            if (!button) return;
            const categoryKey = String(button.dataset.category || "");
            if (!categoryKey) return;
            selectCategory(categoryKey);
        });
    }

    if (walletCardsGrid && walletCardsGrid.dataset.bound !== "true") {
        walletCardsGrid.dataset.bound = "true";
        walletCardsGrid.addEventListener("click", (event) => {
            const actionButton = event.target.closest("button[data-action]");
            if (!actionButton) return;
            const cardKey = String(actionButton.dataset.cardKey || "");
            if (!cardKey) return;

            if (actionButton.dataset.action === "toggle-favorite") {
                setFavoriteCard(cardKey, !isFavoriteCard(cardKey));
                renderFavoriteCategories();
                renderWalletCardsGrid();
                return;
            }

            if (actionButton.dataset.action === "toggle-wallet") {
                toggleCardInActiveWallet(cardKey);
                renderWalletCardsGrid();
                if (walletState.selectedCategoryKey) {
                    showBestCard(walletState.selectedCategoryKey, walletState.cardData, walletState.bankData);
                }
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

async function fetchAndRenderBonuses() {
    try {
        walletState.prefs = loadWalletPrefs();
        renderLastSync();
        await loadWalletData();
        seedWalletFromLegacyInWalletIfNeeded();
        refreshWalletUi();
        attachWalletControlEvents();
    } catch (error) {
        console.error("Error fetching or rendering bonuses:", error);
        setControlsMessage("Offline: using saved data.", true);
    }
}

fetchAndRenderBonuses();
