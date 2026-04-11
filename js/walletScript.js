const {
    loadDataset: dsLoadDataset,
    readLocalJson: dsReadLocalJson,
    writeLocalJson: dsWriteLocalJson,
    validateAndNormalizeCards: dsValidateAndNormalizeCards,
    validateAndNormalizeBanks: dsValidateAndNormalizeBanks,
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    OFFERS_STORAGE_KEY: offersStorageKey,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankName: dsNormalizeBankName,
    normalizeBankKey: dsNormalizeBankKey,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    prettyLabelFromKey: dsPrettyLabelFromKey,
    normalizeCardId: dsNormalizeCardId,
    getCategoryDefsFromCards: dsGetCategoryDefsFromCards,
    normalizeOffersForRuntime: dsNormalizeOffersForRuntime,
    getBankValue: dsGetBankValue,
} = window.CCDataStore;

const WALLET_PREFS_STORAGE_KEY = "walletAppPrefs";
const LAST_SYNC_STORAGE_KEY = "wallet.lastSync";
const DEFAULT_ONLY_CATEGORY_KEY = "__default__";
const PROFILE_MICHAEL = "michael";
const PROFILE_JENNA = "jenna";
const PROFILE_BOTH = "both";
const FILTER_ALL = "all";
const FILTER_WALLET = "wallet";
const FILTER_FAVORITES = "favorites";
const FILTER_FAVORITES_WALLET = "favorites_wallet";
const EASTERN_TIME_ZONE = "America/New_York";
const CITI_NIGHTS_BONUS_KEY = "citinights_fri_sat_6am_6pm_est";
const CITI_NIGHTS_POPUP_NOTE = "Citinights nighttime restaurant window active (based on Eastern time).";

const walletState = {
    cardData: [],
    bankData: [],
    offerData: [],
    categories: [],
    selectedCategoryKey: null,
    prefs: null,
    isFreshPrefs: false,
};

const profileSelect = document.getElementById("wallet-profile-select");
const filterSelect = document.getElementById("wallet-filter-select");
const noFtfToggle = document.getElementById("wallet-no-ftf-toggle");
const profileNoteEl = document.getElementById("wallet-profile-note");
const favoriteCategoriesGrid = document.getElementById("favorite-categories-grid");
const favoriteCategoriesEmpty = document.getElementById("favorite-categories-empty");
const refreshDataButton = document.getElementById("refresh-wallet-data-button");
const resetDataButton = document.getElementById("reset-wallet-data-button");
const controlsMessageEl = document.getElementById("wallet-controls-message");
const lastSyncEl = document.getElementById("wallet-last-sync");
const bonusContainer = document.getElementById("bonus-container");

function createDefaultPrefs() {
    return {
        version: 2,
        activeProfile: PROFILE_MICHAEL,
        activeFilter: FILTER_ALL,
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
        usedOfferAttachmentsByProfile: {
            michael: {},
            jenna: {},
        },
        offerPublishQueue: [],
        lastOfferSpend: 50,
        lastWalletPurchasePrice: 50,
    };
}

function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function asCategoryArray(value) {
    return asStringArray(value)
        .map((item) => dsNormalizeBonusKey(item))
        .filter((item) => item && item !== "default");
}

function normalizePrefsStructure(rawPrefs) {
    const defaults = createDefaultPrefs();
    const source = rawPrefs && typeof rawPrefs === "object" ? rawPrefs : {};
    const sourceProfiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
    const sourcePins = source.pinnedCategoriesByProfile && typeof source.pinnedCategoriesByProfile === "object"
        ? source.pinnedCategoriesByProfile
        : {};
    const sourceUsed = source.usedOfferAttachmentsByProfile && typeof source.usedOfferAttachmentsByProfile === "object"
        ? source.usedOfferAttachmentsByProfile
        : {};
    const fromV2Favorites = source.favoritesByCardId && typeof source.favoritesByCardId === "object"
        ? source.favoritesByCardId
        : {};
    const fromV1Favorites = source.favoritesByCardKey && typeof source.favoritesByCardKey === "object"
        ? source.favoritesByCardKey
        : {};

    const mergedFavorites = {};
    Object.keys(fromV2Favorites).forEach((cardId) => {
        if (fromV2Favorites[cardId]) mergedFavorites[String(cardId)] = true;
    });
    Object.keys(fromV1Favorites).forEach((legacyKey) => {
        if (fromV1Favorites[legacyKey]) mergedFavorites[String(legacyKey)] = true;
    });

    const normalized = {
        version: 2,
        activeProfile: [PROFILE_MICHAEL, PROFILE_JENNA, PROFILE_BOTH].includes(source.activeProfile)
            ? source.activeProfile
            : defaults.activeProfile,
        activeFilter: [FILTER_ALL, FILTER_WALLET, FILTER_FAVORITES, FILTER_FAVORITES_WALLET].includes(source.activeFilter)
            ? source.activeFilter
            : defaults.activeFilter,
        requireNoFtf: Boolean(source.requireNoFtf),
        favoritesByCardId: mergedFavorites,
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
            michael: asCategoryArray(sourcePins.michael),
            jenna: asCategoryArray(sourcePins.jenna),
        },
        usedOfferAttachmentsByProfile: {
            michael: sourceUsed.michael && typeof sourceUsed.michael === "object" ? sourceUsed.michael : {},
            jenna: sourceUsed.jenna && typeof sourceUsed.jenna === "object" ? sourceUsed.jenna : {},
        },
        offerPublishQueue: Array.isArray(source.offerPublishQueue) ? source.offerPublishQueue : [],
        lastOfferSpend: Number.isFinite(Number(source.lastOfferSpend)) ? Number(source.lastOfferSpend) : defaults.lastOfferSpend,
        lastWalletPurchasePrice: Number.isFinite(Number(source.lastWalletPurchasePrice))
            ? Number(source.lastWalletPurchasePrice)
            : defaults.lastWalletPurchasePrice,
    };

    return normalized;
}

function loadWalletPrefs() {
    try {
        const raw = localStorage.getItem(WALLET_PREFS_STORAGE_KEY);
        if (!raw) {
            walletState.isFreshPrefs = true;
            return createDefaultPrefs();
        }
        walletState.isFreshPrefs = false;
        return normalizePrefsStructure(JSON.parse(raw));
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
    lastSyncEl.textContent = `Last synced: ${formatTimestamp(localStorage.getItem(LAST_SYNC_STORAGE_KEY))}`;
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

function normalizeWalletPurchasePrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 50;
    return numeric;
}

function getWalletPurchasePrice() {
    return normalizeWalletPurchasePrice(walletState.prefs && walletState.prefs.lastWalletPurchasePrice);
}

function setWalletPurchasePrice(value) {
    walletState.prefs.lastWalletPurchasePrice = normalizeWalletPurchasePrice(value);
    saveWalletPrefs();
}

function getNormalizedWalletCardName(card) {
    return dsNormalizeBonusKey((card && (card.card || card.name)) || "");
}

function isCitiNightsCard(card) {
    if (!card || typeof card !== "object") return false;
    if (card.id === "citinights") return true;
    const normalizedName = getNormalizedWalletCardName(card);
    return normalizedName === "citinights" || normalizedName === "citi_strata_elite_card";
}

function isCitiNightsRestaurantsWindow(currentMoment = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: EASTERN_TIME_ZONE,
        hour: "numeric",
        hour12: false,
    });
    const hourPart = formatter.formatToParts(currentMoment).find((part) => part.type === "hour");
    const hour = Number(hourPart ? hourPart.value : Number.NaN);
    if (!Number.isFinite(hour)) return false;
    return hour >= 18 || hour < 6;
}

function getEffectiveBonusForWalletCategory(card, normalizedBonus, isDefaultOnly) {
    const bonuses = card && typeof card.bonuses === "object" ? card.bonuses : {};
    const hasCategoryBonus = !isDefaultOnly && Object.prototype.hasOwnProperty.call(bonuses, normalizedBonus);
    let appliedBonus = hasCategoryBonus ? bonuses[normalizedBonus] : bonuses.default;
    let source = hasCategoryBonus ? "category" : "default";
    let popupNote = "";
    let isCitiNightsOverrideActive = false;

    if (
        !isDefaultOnly
        && normalizedBonus === "restaurants"
        && isCitiNightsCard(card)
        && isCitiNightsRestaurantsWindow()
    ) {
        const citiNightsBonus = Number(bonuses[CITI_NIGHTS_BONUS_KEY]);
        if (Number.isFinite(citiNightsBonus)) {
            appliedBonus = citiNightsBonus;
            source = "category";
            popupNote = CITI_NIGHTS_POPUP_NOTE;
            isCitiNightsOverrideActive = true;
        }
    }

    const numericBonus = Number(appliedBonus);
    if (!Number.isFinite(numericBonus)) return null;

    return {
        appliedBonus: numericBonus,
        source,
        popupNote,
        isCitiNightsOverrideActive,
    };
}

function getLegacyCardKey(card, counts, seen) {
    const base = dsNormalizeBonusKey(card.card || card.name || "") || "card";
    const duplicates = counts.get(base) || 0;
    let legacyKey = base;
    if (duplicates > 1) {
        const bankKey = dsNormalizeBonusKey(dsNormalizeBankKey(card.bank || "")) || "bank";
        legacyKey = `${base}__${bankKey}`;
    }
    let next = legacyKey;
    let suffix = 2;
    while (seen.has(next)) {
        next = `${legacyKey}__${suffix}`;
        suffix += 1;
    }
    seen.add(next);
    return next;
}

function applyCardRuntimeFields(cards) {
    const idSet = new Set();
    const legacyCounts = new Map();
    cards.forEach((card) => {
        const base = dsNormalizeBonusKey(card.card || card.name || "") || "card";
        legacyCounts.set(base, (legacyCounts.get(base) || 0) + 1);
    });
    const seenLegacy = new Set();

    return cards.map((card, index) => {
        const baseId = dsNormalizeCardId(card.id || card.cardId || card.key || card.card || "") || `card_${index + 1}`;
        let id = baseId;
        let suffix = 2;
        while (idSet.has(id)) {
            id = `${baseId}_${suffix}`;
            suffix += 1;
        }
        idSet.add(id);

        const legacyKey = getLegacyCardKey(card, legacyCounts, seenLegacy);
        return { ...card, id, _legacyKey: legacyKey };
    });
}

function migratePrefsCardRefs() {
    const idByAlias = new Map();
    walletState.cardData.forEach((card) => {
        idByAlias.set(card.id, card.id);
        idByAlias.set(card._legacyKey, card.id);
        const fromName = dsNormalizeBonusKey(card.card || "");
        if (fromName && !idByAlias.has(fromName)) idByAlias.set(fromName, card.id);
    });

    const nextFavorites = {};
    Object.keys(walletState.prefs.favoritesByCardId || {}).forEach((key) => {
        if (!walletState.prefs.favoritesByCardId[key]) return;
        const mapped = idByAlias.get(String(key)) || "";
        if (mapped) nextFavorites[mapped] = true;
    });
    walletState.prefs.favoritesByCardId = nextFavorites;

    [PROFILE_MICHAEL, PROFILE_JENNA].forEach((profileKey) => {
        const currentIds = asStringArray(walletState.prefs.profiles[profileKey].walletCardIds);
        const migrated = currentIds
            .map((key) => idByAlias.get(key) || "")
            .filter(Boolean);
        walletState.prefs.profiles[profileKey].walletCardIds = Array.from(new Set(migrated));
    });

    if (
        walletState.isFreshPrefs
        && walletState.prefs.profiles.michael.walletCardIds.length === 0
        && walletState.prefs.profiles.jenna.walletCardIds.length === 0
    ) {
        walletState.prefs.profiles.michael.walletCardIds = walletState.cardData
            .filter((card) => card.inWallet !== false)
            .map((card) => card.id);
    }

    saveWalletPrefs();
}

function getProfileWalletSet(profileKey) {
    if (profileKey === PROFILE_BOTH) {
        const union = new Set(walletState.prefs.profiles.michael.walletCardIds);
        walletState.prefs.profiles.jenna.walletCardIds.forEach((id) => union.add(id));
        return union;
    }
    const profile = walletState.prefs.profiles[profileKey];
    return new Set(profile ? profile.walletCardIds : []);
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function isOfferActive(offer) {
    const today = todayIso();
    if (offer.startDate && offer.startDate > today) return false;
    if (offer.expires && offer.expires < today) return false;
    return true;
}

function offerAttachmentKey(offerId, cardId, cardInstanceId) {
    return `${offerId}|${cardId}|${cardInstanceId || ""}`;
}

function isAttachmentUsedForProfile(profileKey, offer, attachment) {
    const key = offerAttachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
    if (profileKey === PROFILE_BOTH) {
        const m = Boolean(walletState.prefs.usedOfferAttachmentsByProfile.michael[key]);
        const j = Boolean(walletState.prefs.usedOfferAttachmentsByProfile.jenna[key]);
        return m && j;
    }
    return Boolean((walletState.prefs.usedOfferAttachmentsByProfile[profileKey] || {})[key]);
}

function getActiveOffersForCategory(categoryKey) {
    const normalized = dsNormalizeBonusKey(categoryKey);
    if (!normalized) return [];
    return walletState.offerData
        .filter((offer) => isOfferActive(offer))
        .filter((offer) => Array.isArray(offer.categories) && offer.categories.includes(normalized))
        .filter((offer) => {
            const attachments = Array.isArray(offer.attachments) ? offer.attachments : [];
            return attachments.some((attachment) => !isAttachmentUsedForProfile(walletState.prefs.activeProfile, offer, attachment));
        });
}

function isFavoriteCard(cardId) {
    return Boolean(walletState.prefs.favoritesByCardId[cardId]);
}

function setFavoriteCard(cardId, isFavorite) {
    if (isFavorite) walletState.prefs.favoritesByCardId[cardId] = true;
    else delete walletState.prefs.favoritesByCardId[cardId];
    saveWalletPrefs();
}

function getPinnedForProfile(profileKey) {
    return asCategoryArray(walletState.prefs.pinnedCategoriesByProfile[profileKey]);
}

function getPinnedForActiveProfile() {
    if (walletState.prefs.activeProfile === PROFILE_BOTH) {
        const combined = new Set(getPinnedForProfile(PROFILE_MICHAEL));
        getPinnedForProfile(PROFILE_JENNA).forEach((key) => combined.add(key));
        return Array.from(combined);
    }
    return getPinnedForProfile(walletState.prefs.activeProfile);
}

function isPinnedCategory(categoryKey) {
    return getPinnedForActiveProfile().includes(categoryKey);
}

function togglePinnedCategory(categoryKey) {
    const profileKey = walletState.prefs.activeProfile;
    if (profileKey === PROFILE_BOTH) return;
    const current = new Set(getPinnedForProfile(profileKey));
    if (current.has(categoryKey)) current.delete(categoryKey);
    else current.add(categoryKey);
    walletState.prefs.pinnedCategoriesByProfile[profileKey] = Array.from(current);
    saveWalletPrefs();
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

function getAllCategoriesFromCards(cardData) {
    if (typeof dsGetCategoryDefsFromCards === "function") {
        return dsGetCategoryDefsFromCards(cardData).map((item) => item.key);
    }
    const categorySet = new Set();
    cardData.forEach((card) => {
        Object.keys(card.bonuses || {}).forEach((bonusKey) => {
            const normalized = dsNormalizeBonusKey(bonusKey);
            if (!normalized || normalized === "default") return;
            categorySet.add(normalized);
        });
    });
    return Array.from(categorySet);
}

function sortBonuses(bonuses) {
    return bonuses.slice().sort((a, b) => prettyLabelFromKey(a).localeCompare(prettyLabelFromKey(b)));
}

function getBankDetails(bankName, bankData) {
    const normalizedCardBank = dsNormalizeBankName(bankName);
    const matchedBank = bankData.find((bank) => dsNormalizeBankName(bank.key) === normalizedCardBank);
    if (matchedBank) {
        return {
            multiplier: dsGetBankValue(matchedBank.key),
            type: matchedBank.type,
        };
    }
    return { multiplier: dsGetBankValue(bankName), type: "Cash Back" };
}

function cardPassesFilters(card) {
    const inWallet = getProfileWalletSet(walletState.prefs.activeProfile).has(card.id);
    const favorite = isFavoriteCard(card.id);

    let passesMain = true;
    switch (walletState.prefs.activeFilter) {
        case FILTER_WALLET:
            passesMain = inWallet;
            break;
        case FILTER_FAVORITES:
            passesMain = favorite;
            break;
        case FILTER_FAVORITES_WALLET:
            passesMain = favorite && inWallet;
            break;
        default:
            passesMain = true;
            break;
    }
    if (!passesMain) return false;
    if (walletState.prefs.requireNoFtf && card.foreignTransactionFee !== false) return false;
    return true;
}

function getEffectiveCardsForRanking(cards) {
    return cards.filter(cardPassesFilters);
}

function renderProfileUi() {
    if (profileSelect) profileSelect.value = walletState.prefs.activeProfile;
    if (filterSelect) filterSelect.value = walletState.prefs.activeFilter;
    if (noFtfToggle) noFtfToggle.checked = walletState.prefs.requireNoFtf;
    if (!profileNoteEl) return;
    if (walletState.prefs.activeProfile === PROFILE_BOTH) {
        profileNoteEl.textContent = "Both uses Michael + Jenna cards. Switch profiles to edit pinned categories.";
        return;
    }
    profileNoteEl.textContent = "";
}

function renderFavoriteCategories() {
    if (!favoriteCategoriesGrid || !favoriteCategoriesEmpty) return;
    const pinned = getPinnedForActiveProfile();
    favoriteCategoriesGrid.innerHTML = "";
    favoriteCategoriesEmpty.classList.toggle("hidden", pinned.length > 0);

    pinned.forEach((categoryKey) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "favorite-category-chip";
        button.dataset.category = categoryKey;

        const icon = document.createElement("img");
        icon.className = "favorite-category-icon";
        icon.src = `./logo/cardBonusesIcons/${categoryKey}-icon.png`;
        icon.alt = "";
        icon.onerror = () => { icon.src = "./logo/cardBonusesIcons/default-icon.png"; };

        const label = document.createElement("span");
        label.textContent = prettyLabelFromKey(categoryKey);

        button.appendChild(icon);
        button.appendChild(label);
        favoriteCategoriesGrid.appendChild(button);
    });
}

function updateBonusSelectionHighlight(selectedCategoryKey) {
    document.querySelectorAll(".bonus-box").forEach((box) => {
        box.classList.toggle("is-selected", box.dataset.bonus === selectedCategoryKey);
    });
}

function renderBonuses(categories) {
    if (!bonusContainer) return;
    bonusContainer.innerHTML = "";
    const activePins = new Set(getPinnedForActiveProfile());
    const canEditPins = walletState.prefs.activeProfile !== PROFILE_BOTH;

    categories.forEach((bonus) => {
        const normalizedBonus = dsNormalizeBonusKey(bonus);
        if (!normalizedBonus) return;

        const box = document.createElement("div");
        box.className = "bonus-box";
        box.dataset.bonus = normalizedBonus;
        if (activePins.has(normalizedBonus)) box.classList.add("is-pinned");

        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.className = "bonus-pin";
        pinButton.dataset.action = "toggle-pin";
        pinButton.dataset.category = normalizedBonus;
        pinButton.disabled = !canEditPins;
        pinButton.setAttribute("aria-pressed", activePins.has(normalizedBonus) ? "true" : "false");
        pinButton.title = canEditPins ? "Pin category shortcut" : "Switch to Michael or Jenna to edit pins";
        pinButton.textContent = activePins.has(normalizedBonus) ? "\u2605" : "\u2606";

        const logo = document.createElement("img");
        logo.className = "bonus-logo";
        logo.src = `./logo/cardBonusesIcons/${normalizedBonus}-icon.png`;
        logo.alt = `${prettyLabelFromKey(normalizedBonus)} icon`;
        logo.onerror = () => { logo.src = "./logo/cardBonusesIcons/default-icon.png"; };

        const name = document.createElement("span");
        name.className = "bonus-name";
        name.textContent = prettyLabelFromKey(normalizedBonus);

        const hasOffers = getActiveOffersForCategory(normalizedBonus).length > 0;
        if (hasOffers) {
            const alert = document.createElement("span");
            alert.className = "bonus-offer-alert";
            alert.textContent = "!";
            alert.title = "Active offer available";
            box.appendChild(alert);
        }

        box.appendChild(pinButton);
        box.appendChild(logo);
        box.appendChild(name);
        bonusContainer.appendChild(box);
    });
}

function selectCategory(categoryKey) {
    walletState.selectedCategoryKey = categoryKey;
    updateBonusSelectionHighlight(categoryKey);
    showBestCard(categoryKey, walletState.cardData, walletState.bankData);
}

function closePopupAndClearSelection() {
    const popup = document.querySelector(".popup");
    if (popup) popup.remove();
    walletState.selectedCategoryKey = null;
    updateBonusSelectionHighlight(null);
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

function renderPopupHeader(contentWrap, cardName, cardId) {
    const head = document.createElement("div");
    head.className = "popup-head";
    const title = document.createElement("h2");
    title.className = "popup-title";
    title.textContent = cardName;
    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "popup-favorite-button";
    favoriteButton.setAttribute("aria-label", `Favorite ${cardName}`);
    favoriteButton.setAttribute("aria-pressed", isFavoriteCard(cardId) ? "true" : "false");
    favoriteButton.dataset.action = "popup-favorite";
    favoriteButton.dataset.cardId = cardId;
    favoriteButton.textContent = isFavoriteCard(cardId) ? "\u2605" : "\u2606";
    head.appendChild(title);
    head.appendChild(favoriteButton);
    contentWrap.appendChild(head);
}

function computeWalletRewardDollar(weightedValue, purchasePrice) {
    return purchasePrice * (weightedValue / 100);
}

function showBestCard(bonus, cardData, bankData) {
    const isDefaultOnly = bonus === DEFAULT_ONLY_CATEGORY_KEY;
    const normalizedBonus = isDefaultOnly ? "default" : dsNormalizeBonusKey(bonus);
    if (!normalizedBonus) return;

    const existingPopup = document.querySelector(".popup");
    if (existingPopup) existingPopup.remove();

    const relevantCards = getEffectiveCardsForRanking(cardData)
        .map((card) => {
            const effectiveBonus = getEffectiveBonusForWalletCategory(card, normalizedBonus, isDefaultOnly);
            if (!effectiveBonus) return null;
            const bankDetails = getBankDetails(card.bank, bankData);
            return {
                cardId: card.id,
                cardName: card.card,
                photoPath: card.photo || card.photoPath || "",
                network: card.network,
                tier: card.tier,
                appliedBonus: effectiveBonus.appliedBonus,
                weightedValue: effectiveBonus.appliedBonus * bankDetails.multiplier,
                source: effectiveBonus.source,
                popupNote: effectiveBonus.popupNote,
                isCitiNightsOverrideActive: effectiveBonus.isCitiNightsOverrideActive,
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (b.weightedValue !== a.weightedValue) return b.weightedValue - a.weightedValue;
            if (b.appliedBonus !== a.appliedBonus) return b.appliedBonus - a.appliedBonus;
            if (a.source !== b.source) return a.source === "category" ? -1 : 1;
            return a.cardName.localeCompare(b.cardName);
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
        const purchasePrice = getWalletPurchasePrice();
        const rewardDollar = computeWalletRewardDollar(card.weightedValue, purchasePrice);
        popupContent.innerHTML = "";

        const image = document.createElement("img");
        image.className = "popup-card-image";
        image.src = card.photoPath || "./logo/cardBonusesIcons/default-icon.png";
        image.alt = card.cardName;
        image.onerror = () => { image.src = "./logo/cardBonusesIcons/default-icon.png"; };
        popupContent.appendChild(image);
        renderPopupHeader(popupContent, card.cardName, card.cardId);

        const purchaseWrap = document.createElement("label");
        purchaseWrap.className = "popup-purchase-wrap";
        const purchaseLabel = document.createElement("span");
        purchaseLabel.textContent = "Purchase price";
        const purchaseInput = document.createElement("input");
        purchaseInput.type = "number";
        purchaseInput.min = "0";
        purchaseInput.step = "0.01";
        purchaseInput.value = String(purchasePrice);
        purchaseInput.setAttribute("inputmode", "decimal");
        purchaseInput.setAttribute("aria-label", "Purchase price");
        purchaseInput.addEventListener("change", () => {
            setWalletPurchasePrice(purchaseInput.value);
            updatePopupContent();
        });
        purchaseWrap.appendChild(purchaseLabel);
        purchaseWrap.appendChild(purchaseInput);
        popupContent.appendChild(purchaseWrap);

        const stats = document.createElement("div");
        stats.className = "popup-stats-grid";
        stats.appendChild(createStatCard("Rank", `#${currentIndex + 1} of ${relevantCards.length}`, false));
        stats.appendChild(createStatCard("Network Tier", formatNetworkTier(card.network, card.tier), true));
        stats.appendChild(createStatCard("Bonus", `${card.appliedBonus.toFixed(1)}x ${categoryLabel}`, false));
        stats.appendChild(createStatCard("Effective Reward", `${card.weightedValue.toFixed(2)}%`, false));
        stats.appendChild(createStatCard("Purchase Price", `$${purchasePrice.toFixed(2)}`, false));
        stats.appendChild(createStatCard("Reward Value", `$${rewardDollar.toFixed(2)}`, false));
        popupContent.appendChild(stats);

        if (card.popupNote) {
            const banner = document.createElement("div");
            banner.className = "wallet-offer-banner";
            banner.textContent = card.popupNote;
            popupContent.appendChild(banner);
        }

        const categoryOffers = getActiveOffersForCategory(normalizedBonus).slice(0, 2);
        if (categoryOffers.length) {
            const banner = document.createElement("div");
            banner.className = "wallet-offer-banner";
            const merchantText = categoryOffers.map((offer) => offer.merchantName).join(", ");
            banner.innerHTML = `<strong>Offer available:</strong> ${merchantText}`;
            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.className = "wallet-offer-link";
            viewButton.textContent = "View offers";
            viewButton.onclick = () => {
                window.location.href = `./offers.html?category=${encodeURIComponent(normalizedBonus)}`;
            };
            banner.appendChild(viewButton);
            popupContent.appendChild(banner);
        }

        const buttons = document.createElement("div");
        buttons.className = "popup-buttons";
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
        buttons.appendChild(prevButton);
        buttons.appendChild(nextButton);
        buttons.appendChild(closeButton);
        popupContent.appendChild(buttons);
    };

    popup.addEventListener("click", (event) => {
        if (event.target === popup) closePopup();
    });

    popupContent.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
            event.stopPropagation();
            return;
        }
        if (button.dataset.action === "popup-favorite") {
            const cardId = String(button.dataset.cardId || "");
            if (!cardId) return;
            setFavoriteCard(cardId, !isFavoriteCard(cardId));
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
    });

    updatePopupContent();
    document.body.appendChild(popup);
    document.addEventListener("keydown", onKeyDown);
}

async function loadWalletData() {
    const [rawCards, rawBanks, rawOffers] = await Promise.all([
        dsLoadDataset(cardsStorageKey, "./database/cards.json"),
        dsLoadDataset(banksStorageKey, "./database/banks.json"),
        dsLoadDataset(offersStorageKey, "./database/offers.json"),
    ]);
    walletState.cardData = applyCardRuntimeFields(dsNormalizeCardsForRuntime(rawCards));
    walletState.bankData = dsNormalizeBanksForRuntime(rawBanks);
    walletState.offerData = dsNormalizeOffersForRuntime(rawOffers);
}

function refreshWalletUi() {
    const allCategories = getAllCategoriesFromCards(walletState.cardData);
    walletState.categories = [...allCategories, DEFAULT_ONLY_CATEGORY_KEY];
    renderProfileUi();
    renderFavoriteCategories();
    renderBonuses(sortBonuses(allCategories));
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
        const remoteOffers = await fetchFirstAvailableJson(["./database/offers.json"]);
        const cardsValidation = dsValidateAndNormalizeCards(remoteCards);
        const banksValidation = dsValidateAndNormalizeBanks(remoteBanks);
        if (!cardsValidation.ok) throw new Error(cardsValidation.errors.join(" "));
        if (!banksValidation.ok) throw new Error(banksValidation.errors.join(" "));
        dsWriteLocalJson(cardsStorageKey, cardsValidation.data);
        dsWriteLocalJson(banksStorageKey, banksValidation.data);
        dsWriteLocalJson(offersStorageKey, dsNormalizeOffersForRuntime(remoteOffers));
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());
        renderLastSync();
        await loadWalletData();
        migratePrefsCardRefs();
        refreshWalletUi();
        setControlsMessage("Data refreshed.", false);
    } catch (error) {
        const localCards = dsReadLocalJson(cardsStorageKey);
        const localBanks = dsReadLocalJson(banksStorageKey);
        if (localCards && localBanks) {
            await loadWalletData();
            migratePrefsCardRefs();
            refreshWalletUi();
        }
        setControlsMessage("Offline: using saved data.", true);
    }
}

function resetLocalWalletData() {
    [
        cardsStorageKey,
        banksStorageKey,
        LAST_SYNC_STORAGE_KEY,
        WALLET_PREFS_STORAGE_KEY,
        "wallet.favoriteCategories",
        "wallet.onlyInWalletCards",
    ].forEach((key) => localStorage.removeItem(key));
    location.reload();
}

function attachWalletControlEvents() {
    if (profileSelect && profileSelect.dataset.bound !== "true") {
        profileSelect.dataset.bound = "true";
        profileSelect.addEventListener("change", () => {
            walletState.prefs.activeProfile = profileSelect.value;
            saveWalletPrefs();
            closePopupAndClearSelection();
            refreshWalletUi();
        });
    }
    if (filterSelect && filterSelect.dataset.bound !== "true") {
        filterSelect.dataset.bound = "true";
        filterSelect.addEventListener("change", () => {
            walletState.prefs.activeFilter = filterSelect.value;
            saveWalletPrefs();
            closePopupAndClearSelection();
            refreshWalletUi();
        });
    }
    if (noFtfToggle && noFtfToggle.dataset.bound !== "true") {
        noFtfToggle.dataset.bound = "true";
        noFtfToggle.addEventListener("change", () => {
            walletState.prefs.requireNoFtf = Boolean(noFtfToggle.checked);
            saveWalletPrefs();
            closePopupAndClearSelection();
            refreshWalletUi();
        });
    }
    if (favoriteCategoriesGrid && favoriteCategoriesGrid.dataset.bound !== "true") {
        favoriteCategoriesGrid.dataset.bound = "true";
        favoriteCategoriesGrid.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-category]");
            if (!button) return;
            const categoryKey = String(button.dataset.category || "");
            if (categoryKey) selectCategory(categoryKey);
        });
    }
    if (bonusContainer && bonusContainer.dataset.bound !== "true") {
        bonusContainer.dataset.bound = "true";
        bonusContainer.addEventListener("click", (event) => {
            const pin = event.target.closest("button[data-action='toggle-pin']");
            if (pin) {
                event.preventDefault();
                event.stopPropagation();
                const categoryKey = String(pin.dataset.category || "");
                if (categoryKey) {
                    togglePinnedCategory(categoryKey);
                    refreshWalletUi();
                }
                return;
            }
            const box = event.target.closest(".bonus-box");
            if (!box) return;
            const categoryKey = String(box.dataset.bonus || "");
            if (categoryKey) selectCategory(categoryKey);
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

async function initWallet() {
    try {
        walletState.prefs = loadWalletPrefs();
        renderLastSync();
        await loadWalletData();
        migratePrefsCardRefs();
        refreshWalletUi();
        attachWalletControlEvents();
    } catch (error) {
        console.error("Error loading wallet:", error);
        setControlsMessage("Offline: using saved data.", true);
    }
}

initWallet();
