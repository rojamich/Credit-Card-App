const {
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    OFFERS_STORAGE_KEY: offersStorageKey,
    loadDataset: dsLoadDataset,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeOffersForRuntime: dsNormalizeOffersForRuntime,
    getCategoryDefsFromCards: dsGetCategoryDefsFromCards,
    prettyLabelFromKey: dsPrettyLabelFromKey,
} = window.CCDataStore;

const WALLET_PREFS_STORAGE_KEY = "walletAppPrefs";
const PROFILE_MICHAEL = "michael";
const PROFILE_JENNA = "jenna";
const PROFILE_BOTH = "both";
const OFFER_SPEND_STORAGE_KEY = "offers.lastSpend";

const state = {
    cards: [],
    banks: [],
    offers: [],
    prefs: null,
    activeOffer: null,
};

const profileSelect = document.getElementById("offers-profile-select");
const searchInput = document.getElementById("offers-search-input");
const statusSelect = document.getElementById("offers-status-select");
const providerSelect = document.getElementById("offers-provider-select");
const categorySelect = document.getElementById("offers-category-select");
const profileNote = document.getElementById("offers-profile-note");
const offersList = document.getElementById("offers-list");

const pointsAmexInput = document.getElementById("points-amex-mr");
const pointsChaseInput = document.getElementById("points-chase-ur");
const pointsCashInput = document.getElementById("points-cash");

const popup = document.getElementById("offer-popup");
const popupTitle = document.getElementById("offer-popup-title");
const popupMeta = document.getElementById("offer-popup-meta");
const popupSpend = document.getElementById("offer-popup-spend");
const popupResults = document.getElementById("offer-popup-results");
const popupUsed = document.getElementById("offer-popup-used");
const popupClose = document.getElementById("offer-popup-close");

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
        usedOfferAttachmentsByProfile: {
            michael: {},
            jenna: {},
        },
        pointsValueByProgram: {
            amex_mr: 0.01,
            chase_ur: 0.015,
            cash: 0.01,
        },
    };
}

function loadPrefs() {
    try {
        const raw = localStorage.getItem(WALLET_PREFS_STORAGE_KEY);
        if (!raw) return createDefaultPrefs();
        const parsed = JSON.parse(raw);
        const defaults = createDefaultPrefs();
        return {
            ...defaults,
            ...parsed,
            usedOfferAttachmentsByProfile: {
                michael: (parsed.usedOfferAttachmentsByProfile && parsed.usedOfferAttachmentsByProfile.michael) || {},
                jenna: (parsed.usedOfferAttachmentsByProfile && parsed.usedOfferAttachmentsByProfile.jenna) || {},
            },
            pointsValueByProgram: {
                ...defaults.pointsValueByProgram,
                ...(parsed.pointsValueByProgram || {}),
            },
        };
    } catch (error) {
        return createDefaultPrefs();
    }
}

function savePrefs() {
    localStorage.setItem(WALLET_PREFS_STORAGE_KEY, JSON.stringify(state.prefs));
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

function isOfferExpired(offer) {
    if (!offer.expires) return false;
    return offer.expires < todayIso();
}

function isOfferStarted(offer) {
    if (!offer.startDate) return true;
    return offer.startDate <= todayIso();
}

function attachmentKey(offerId, cardId, cardInstanceId) {
    return `${offerId}|${cardId}|${cardInstanceId || ""}`;
}

function getUsedMapForProfile(profile) {
    if (profile === PROFILE_BOTH) return {};
    return state.prefs.usedOfferAttachmentsByProfile[profile] || {};
}

function isAttachmentUsedForProfile(profile, key) {
    if (profile === PROFILE_BOTH) {
        const m = Boolean(state.prefs.usedOfferAttachmentsByProfile.michael[key]);
        const j = Boolean(state.prefs.usedOfferAttachmentsByProfile.jenna[key]);
        return m && j;
    }
    return Boolean(getUsedMapForProfile(profile)[key]);
}

function getBankMultiplier(bankKey) {
    const bank = state.banks.find((item) => String(item.key || "").toLowerCase() === String(bankKey || "").toLowerCase());
    return bank && Number.isFinite(Number(bank.value)) ? Number(bank.value) : 1;
}

function getCardById(cardId) {
    return state.cards.find((card) => card.id === cardId) || null;
}

function getInstanceLabel(card, instanceId) {
    if (!instanceId) return "";
    const match = Array.isArray(card.instances) ? card.instances.find((item) => item && item.id === instanceId) : null;
    if (!match) return instanceId;
    const maskedLast4 = match.last4 ? ` ••${String(match.last4).slice(-2)}` : "";
    return `${match.label || instanceId}${maskedLast4}`;
}

function computeOfferValue(offer, spend) {
    const minSpend = Number.isFinite(Number(offer.minSpend)) ? Number(offer.minSpend) : 0;
    if (offer.offerType === "percent") {
        const rate = Number(offer.rate) || 0;
        const raw = spend * rate;
        const cap = Number.isFinite(Number(offer.maxDiscount)) ? Number(offer.maxDiscount) : null;
        return cap === null ? raw : Math.min(raw, cap);
    }
    if (offer.offerType === "fixed") {
        const amount = Number(offer.fixedAmount) || 0;
        return spend >= minSpend ? amount : 0;
    }
    if (offer.offerType === "points") {
        const points = Number(offer.points) || 0;
        const valuePerPoint = Number(state.prefs.pointsValueByProgram[offer.program]) || 0;
        return spend >= minSpend ? points * valuePerPoint : 0;
    }
    return 0;
}

function computeRewardValue(card, offer, spend) {
    const categories = Array.isArray(offer.categories) && offer.categories.length ? offer.categories : ["default"];
    let bestMultiplier = 0;
    let bestCategory = "default";
    categories.forEach((categoryKey) => {
        const bonuses = card.bonuses || {};
        const direct = Object.prototype.hasOwnProperty.call(bonuses, categoryKey) ? bonuses[categoryKey] : bonuses.default;
        const numeric = Number(direct);
        if (!Number.isFinite(numeric)) return;
        const weighted = numeric * getBankMultiplier(card.bank);
        if (weighted > bestMultiplier) {
            bestMultiplier = weighted;
            bestCategory = categoryKey;
        }
    });
    const rewardDollar = spend * (bestMultiplier / 100);
    return { rewardDollar, bestMultiplier, bestCategory };
}

function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function readSpendInput() {
    const raw = Number(popupSpend.value);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
}

function renderOfferPopupResults() {
    const offer = state.activeOffer;
    if (!offer) return;
    const spend = readSpendInput();
    localStorage.setItem(OFFER_SPEND_STORAGE_KEY, String(spend));
    const profile = profileSelect.value;

    const rows = [];
    (offer.attachments || []).forEach((attachment) => {
        const card = getCardById(attachment.cardId);
        if (!card) return;
        const key = attachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
        const used = isAttachmentUsedForProfile(profile, key);
        const offerValue = computeOfferValue(offer, spend);
        const reward = computeRewardValue(card, offer, spend);
        rows.push({
            key,
            used,
            cardName: card.card,
            instanceLabel: getInstanceLabel(card, attachment.cardInstanceId),
            rewardLabel: `${formatMoney(reward.rewardDollar)} (${dsPrettyLabelFromKey(reward.bestCategory)} @ ${reward.bestMultiplier.toFixed(2)}x)`,
            offerLabel: formatMoney(offerValue),
            total: reward.rewardDollar + offerValue,
        });
    });

    rows.sort((a, b) => b.total - a.total);
    popupResults.innerHTML = "";
    popupUsed.innerHTML = "";

    const canMarkUsed = profile !== PROFILE_BOTH;
    if (!canMarkUsed) profileNote.textContent = "Choose Michael or Jenna to mark offers as used.";
    else profileNote.textContent = "";

    rows.forEach((row) => {
        const card = document.createElement("article");
        card.className = "offer-result-card";
        card.innerHTML = `
            <strong>${row.cardName}${row.instanceLabel ? ` - ${row.instanceLabel}` : ""}</strong>
            <p>Reward: ${row.rewardLabel}</p>
            <p>Offer: ${row.offerLabel}</p>
            <p>Total: ${formatMoney(row.total)}</p>
        `;
        const actions = document.createElement("div");
        actions.className = "offer-result-actions";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.attachmentKey = row.key;
        button.textContent = row.used ? "Undo used" : "Mark used";
        button.disabled = !canMarkUsed;
        actions.appendChild(button);
        card.appendChild(actions);

        if (row.used) popupUsed.appendChild(card);
        else popupResults.appendChild(card);
    });
}

function openOfferPopup(offer) {
    state.activeOffer = offer;
    popupTitle.textContent = offer.merchantName;
    popupMeta.textContent = `${offer.provider.toUpperCase()} • Expires ${offer.expires}`;
    const lastSpend = Number(localStorage.getItem(OFFER_SPEND_STORAGE_KEY));
    popupSpend.value = Number.isFinite(lastSpend) ? String(lastSpend) : "50";
    popup.classList.remove("hidden");
    renderOfferPopupResults();
}

function closeOfferPopup() {
    popup.classList.add("hidden");
    state.activeOffer = null;
}

function getFilteredOffers() {
    const search = searchInput.value.trim().toLowerCase();
    const status = statusSelect.value;
    const provider = providerSelect.value;
    const category = categorySelect.value;

    return state.offers
        .filter((offer) => {
            const expired = isOfferExpired(offer);
            const started = isOfferStarted(offer);
            if (status === "active" && (expired || !started)) return false;
            if (status === "expired" && !expired) return false;
            if (provider !== "all" && offer.provider !== provider) return false;
            if (category !== "all" && !(offer.categories || []).includes(category)) return false;
            if (!search) return true;
            const aliases = Array.isArray(offer.aliases) ? offer.aliases.join(" ").toLowerCase() : "";
            const haystack = `${offer.merchantName} ${offer.merchantKey} ${aliases}`.toLowerCase();
            return haystack.includes(search);
        })
        .sort((a, b) => a.merchantName.localeCompare(b.merchantName));
}

function renderOffersList() {
    const offers = getFilteredOffers();
    offersList.innerHTML = "";
    if (!offers.length) {
        offersList.innerHTML = `<p class="offers-note">No offers for current filters.</p>`;
        return;
    }

    offers.forEach((offer) => {
        const card = document.createElement("article");
        card.className = "offer-card";
        card.dataset.offerId = offer.id;
        const categories = Array.isArray(offer.categories) ? offer.categories : [];
        const chips = categories.map((key) => `<span class="offer-chip">${dsPrettyLabelFromKey(key)}</span>`).join("");
        card.innerHTML = `
            <div class="offer-card-head">
                <div class="offer-merchant">
                    <span class="offer-avatar">${(offer.merchantName || "?").charAt(0).toUpperCase()}</span>
                    <div>
                        <strong>${offer.merchantName}</strong>
                        <p class="offers-note">Expires ${offer.expires}</p>
                    </div>
                </div>
                <span class="provider-badge">${offer.provider.toUpperCase()}</span>
            </div>
            <div class="offer-chips">${chips}</div>
            <p class="offers-note">Attached cards: ${(offer.attachments || []).length}</p>
        `;
        offersList.appendChild(card);
    });
}

function setQueryFilters() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category");
    const search = params.get("search");
    if (search) searchInput.value = search;
    if (category && Array.from(categorySelect.options).some((option) => option.value === category)) {
        categorySelect.value = category;
    }
}

function populateCategoryFilter() {
    const defs = dsGetCategoryDefsFromCards(state.cards);
    categorySelect.innerHTML = `<option value="all">All</option>`;
    defs.forEach((def) => {
        const option = document.createElement("option");
        option.value = def.key;
        option.textContent = def.label;
        categorySelect.appendChild(option);
    });
}

function renderPointsSettings() {
    pointsAmexInput.value = String(state.prefs.pointsValueByProgram.amex_mr ?? 0.01);
    pointsChaseInput.value = String(state.prefs.pointsValueByProgram.chase_ur ?? 0.015);
    pointsCashInput.value = String(state.prefs.pointsValueByProgram.cash ?? 0.01);
}

function applyPointsSettings() {
    state.prefs.pointsValueByProgram.amex_mr = Number(pointsAmexInput.value) || 0;
    state.prefs.pointsValueByProgram.chase_ur = Number(pointsChaseInput.value) || 0;
    state.prefs.pointsValueByProgram.cash = Number(pointsCashInput.value) || 0;
    savePrefs();
    if (state.activeOffer) renderOfferPopupResults();
}

async function loadData() {
    const [rawCards, rawBanks, rawOffers] = await Promise.all([
        dsLoadDataset(cardsStorageKey, "./database/cards.json"),
        dsLoadDataset(banksStorageKey, "./database/banks.json"),
        dsLoadDataset(offersStorageKey, "./database/offers.json"),
    ]);
    state.cards = dsNormalizeCardsForRuntime(rawCards);
    state.banks = dsNormalizeBanksForRuntime(rawBanks);
    state.offers = dsNormalizeOffersForRuntime(rawOffers);
    state.prefs = loadPrefs();
}

function bindEvents() {
    [profileSelect, searchInput, statusSelect, providerSelect, categorySelect].forEach((element) => {
        element.addEventListener("input", renderOffersList);
        element.addEventListener("change", renderOffersList);
    });

    profileSelect.addEventListener("change", () => {
        state.prefs.activeProfile = profileSelect.value;
        savePrefs();
        if (state.activeOffer) renderOfferPopupResults();
        renderOffersList();
    });

    [pointsAmexInput, pointsChaseInput, pointsCashInput].forEach((input) => {
        input.addEventListener("change", applyPointsSettings);
    });

    offersList.addEventListener("click", (event) => {
        const card = event.target.closest(".offer-card");
        if (!card) return;
        const offerId = String(card.dataset.offerId || "");
        const offer = state.offers.find((item) => item.id === offerId);
        if (offer) openOfferPopup(offer);
    });

    popupSpend.addEventListener("input", renderOfferPopupResults);
    popupResults.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-attachment-key]");
        if (!button || !state.activeOffer) return;
        const profile = profileSelect.value;
        if (profile === PROFILE_BOTH) return;
        const key = String(button.dataset.attachmentKey || "");
        const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
        if (map[key]) delete map[key];
        else map[key] = true;
        state.prefs.usedOfferAttachmentsByProfile[profile] = map;
        savePrefs();
        renderOfferPopupResults();
    });
    popupUsed.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-attachment-key]");
        if (!button || !state.activeOffer) return;
        const profile = profileSelect.value;
        if (profile === PROFILE_BOTH) return;
        const key = String(button.dataset.attachmentKey || "");
        const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
        if (map[key]) delete map[key];
        state.prefs.usedOfferAttachmentsByProfile[profile] = map;
        savePrefs();
        renderOfferPopupResults();
    });

    popupClose.addEventListener("click", closeOfferPopup);
    popup.addEventListener("click", (event) => {
        if (event.target === popup) closeOfferPopup();
    });
}

async function init() {
    await loadData();
    profileSelect.value = state.prefs.activeProfile || PROFILE_MICHAEL;
    renderPointsSettings();
    populateCategoryFilter();
    setQueryFilters();
    bindEvents();
    renderOffersList();
}

init().catch((error) => {
    offersList.innerHTML = `<p class="offers-note">Could not load offers: ${error.message}</p>`;
});
