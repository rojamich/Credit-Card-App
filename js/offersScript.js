const {
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    OFFERS_STORAGE_KEY: offersStorageKey,
    loadDataset: dsLoadDataset,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeOffersForRuntime: dsNormalizeOffersForRuntime,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankKey: dsNormalizeBankKey,
    prettyLabelFromKey: dsPrettyLabelFromKey,
    getBankValue: dsGetBankValue,
    CATEGORY_DEFS: dsCategoryDefs,
} = window.CCDataStore;

const WALLET_PREFS_STORAGE_KEY = "walletAppPrefs";
const PROFILE_MICHAEL = "michael";
const PROFILE_JENNA = "jenna";
const PROFILE_BOTH = "both";

const state = {
    cards: [],
    banks: [],
    offers: [],
    prefs: null,
    activeOffer: null,
    selectedCategory: "all",
};

const profileSelect = document.getElementById("offers-profile-select");
const searchInput = document.getElementById("offers-search-input");
const statusSelect = document.getElementById("offers-status-select");
const providerSelect = document.getElementById("offers-provider-select");
const categoryStrip = document.getElementById("offers-category-strip");
const profileNote = document.getElementById("offers-profile-note");
const offersList = document.getElementById("offers-list");

const popup = document.getElementById("offer-popup");
const popupLogo = document.getElementById("offer-popup-logo");
const popupAvatar = document.getElementById("offer-popup-avatar");
const popupTitle = document.getElementById("offer-popup-title");
const popupMeta = document.getElementById("offer-popup-meta");
const popupSpend = document.getElementById("offer-popup-spend");
const popupResults = document.getElementById("offer-popup-results");
const popupUsed = document.getElementById("offer-popup-used");
const popupClose = document.getElementById("offer-popup-close");
const toastEl = document.getElementById("offers-toast");

const maintenanceQueueCount = document.getElementById("maintenance-queue-count");
const maintenanceKeepUnattached = document.getElementById("maintenance-keep-unattached");
const maintenanceQueueTable = document.getElementById("maintenance-queue-table");
const downloadCleanedButton = document.getElementById("download-cleaned-offers");
const clearQueueButton = document.getElementById("clear-publish-queue");

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
        offerPublishQueue: [],
        lastOfferSpend: 50,
    };
}

function normalizeUsedMap(raw) {
    if (!raw || typeof raw !== "object") return {};
    const normalized = {};
    Object.entries(raw).forEach(([key, value]) => {
        if (!value) return;
        if (value === true) {
            normalized[key] = { used: true, usedAt: "" };
            return;
        }
        if (typeof value === "object" && value.used) {
            normalized[key] = {
                used: true,
                usedAt: String(value.usedAt || ""),
            };
        }
    });
    return normalized;
}

function normalizePublishQueue(rawQueue) {
    if (!Array.isArray(rawQueue)) return [];
    const dedupe = new Set();
    const list = [];
    rawQueue.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const offerId = String(item.offerId || "").trim();
        const cardId = String(item.cardId || "").trim();
        const cardInstanceIdOrNull = item.cardInstanceIdOrNull ? String(item.cardInstanceIdOrNull).trim() : null;
        const profile = [PROFILE_MICHAEL, PROFILE_JENNA].includes(item.profile) ? item.profile : PROFILE_MICHAEL;
        if (!offerId || !cardId) return;
        const key = `${offerId}|${cardId}|${cardInstanceIdOrNull || ""}`;
        if (dedupe.has(key)) return;
        dedupe.add(key);
        list.push({
            offerId,
            cardId,
            cardInstanceIdOrNull,
            profile,
            usedAt: String(item.usedAt || ""),
        });
    });
    return list;
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
                michael: normalizeUsedMap(parsed.usedOfferAttachmentsByProfile && parsed.usedOfferAttachmentsByProfile.michael),
                jenna: normalizeUsedMap(parsed.usedOfferAttachmentsByProfile && parsed.usedOfferAttachmentsByProfile.jenna),
            },
            offerPublishQueue: normalizePublishQueue(parsed.offerPublishQueue),
            lastOfferSpend: Number.isFinite(Number(parsed.lastOfferSpend)) ? Number(parsed.lastOfferSpend) : 50,
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
    return Boolean(offer.expires && offer.expires < todayIso());
}

function isOfferStarted(offer) {
    return !offer.startDate || offer.startDate <= todayIso();
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

function isAttachmentUsedForAnyProfile(key) {
    return Boolean(state.prefs.usedOfferAttachmentsByProfile.michael[key] || state.prefs.usedOfferAttachmentsByProfile.jenna[key]);
}

function getCardById(cardId) {
    return state.cards.find((card) => card.id === cardId) || null;
}

function getInstanceLabel(card, instanceId) {
    if (!instanceId) return "";
    const match = Array.isArray(card.instances) ? card.instances.find((item) => item && item.id === instanceId) : null;
    if (!match) return instanceId;
    const maskedLast4 = match.last4 ? ` \u2022\u2022${String(match.last4).slice(-2)}` : "";
    return `${match.label || instanceId}${maskedLast4}`;
}

function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function offerCategoryList() {
    return Object.entries(dsCategoryDefs || {})
        .map(([key, def]) => ({ key, label: def.label || dsPrettyLabelFromKey(key) }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function renderCategoryStrip() {
    categoryStrip.innerHTML = "";
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = `offers-category-btn${state.selectedCategory === "all" ? " is-active" : ""}`;
    allButton.dataset.category = "all";
    allButton.textContent = "All";
    categoryStrip.appendChild(allButton);

    offerCategoryList().forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `offers-category-btn${state.selectedCategory === category.key ? " is-active" : ""}`;
        button.dataset.category = category.key;
        button.textContent = category.label;
        categoryStrip.appendChild(button);
    });
}

function readSpendInput() {
    const raw = Number(popupSpend.value);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
}

function computeOfferValue(offer, spend) {
    const minSpend = Number.isFinite(Number(offer.minSpend)) ? Number(offer.minSpend) : 0;
    if (offer.offerType === "percent") {
        const rate = Number(offer.rate) || 0;
        const raw = spend * rate;
        const cap = Number.isFinite(Number(offer.maxDiscount)) ? Number(offer.maxDiscount) : null;
        const value = cap === null ? raw : Math.min(raw, cap);
        return {
            value,
            detail: cap !== null && raw > cap
                ? `${(rate * 100).toFixed(0)}% off (cap hit at ${formatMoney(cap)})`
                : `${(rate * 100).toFixed(0)}% off`,
        };
    }
    if (offer.offerType === "fixed") {
        const amount = Number(offer.fixedAmount) || 0;
        if (spend < minSpend) {
            return {
                value: 0,
                detail: `${formatMoney(amount)} after ${formatMoney(minSpend)} min spend`,
            };
        }
        return {
            value: amount,
            detail: `${formatMoney(amount)} statement credit`,
        };
    }
    if (offer.offerType === "points") {
        const points = Number(offer.points) || 0;
        const programKey = dsNormalizeBankKey(offer.programKey || "");
        const cpp = Number(dsGetBankValue(programKey)) || 0;
        if (spend < minSpend) {
            return {
                value: 0,
                detail: `${points} pts after ${formatMoney(minSpend)} min spend`,
            };
        }
        return {
            value: points * (cpp / 100),
            detail: `${points} pts @ ${cpp.toFixed(2)} cpp`,
        };
    }
    return { value: 0, detail: "" };
}

function computeRewardValue(card, offer, spend) {
    const categories = Array.isArray(offer.categories) && offer.categories.length ? offer.categories : ["default"];
    let bestRatePct = 0;
    let bestCategory = "default";
    categories.forEach((categoryKey) => {
        const bonuses = card.bonuses || {};
        const rawMultiplier = Object.prototype.hasOwnProperty.call(bonuses, categoryKey) ? bonuses[categoryKey] : bonuses.default;
        const multiplier = Number(rawMultiplier);
        if (!Number.isFinite(multiplier)) return;
        const effectiveRatePct = multiplier * (Number(dsGetBankValue(card.bank)) || 1);
        if (effectiveRatePct > bestRatePct) {
            bestRatePct = effectiveRatePct;
            bestCategory = categoryKey;
        }
    });
    return {
        bestCategory,
        bestRatePct,
        rewardDollar: spend * (bestRatePct / 100),
    };
}

function renderOfferPopupResults() {
    const offer = state.activeOffer;
    if (!offer) return;

    const spend = readSpendInput();
    state.prefs.lastOfferSpend = spend;
    savePrefs();
    const profile = profileSelect.value;

    const rows = [];
    (offer.attachments || []).forEach((attachment) => {
        const card = getCardById(attachment.cardId);
        if (!card) return;
        const key = attachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
        const used = isAttachmentUsedForProfile(profile, key);
        const reward = computeRewardValue(card, offer, spend);
        const offerValue = computeOfferValue(offer, spend);
        const total = reward.rewardDollar + offerValue.value;
        rows.push({
            key,
            offer,
            card,
            used,
            cardName: card.card,
            instanceLabel: getInstanceLabel(card, attachment.cardInstanceId),
            reward,
            offerValue,
            total,
            effectivePct: spend > 0 ? (total / spend) * 100 : 0,
        });
    });

    rows.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.cardName.localeCompare(b.cardName);
    });

    popupResults.innerHTML = "";
    popupUsed.innerHTML = "";
    if (profile === PROFILE_BOTH) {
        profileNote.textContent = "Choose Michael or Jenna to mark offers as used.";
    } else {
        profileNote.textContent = "";
    }

    rows.forEach((row) => {
        const cardEl = document.createElement("article");
        cardEl.className = "offer-result-card";
        cardEl.innerHTML = `
            <strong>${row.cardName}${row.instanceLabel ? ` - ${row.instanceLabel}` : ""}</strong>
            <p>Rewards: ${formatMoney(row.reward.rewardDollar)} (${dsPrettyLabelFromKey(row.reward.bestCategory)} @ ${row.reward.bestRatePct.toFixed(2)}%)</p>
            <p>Offer: ${formatMoney(row.offerValue.value)} (${row.offerValue.detail})</p>
            <p class="offer-total">Total: ${formatMoney(row.total)} | Effective: ${row.effectivePct.toFixed(2)}%</p>
        `;
        const actions = document.createElement("div");
        actions.className = "offer-result-actions";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.attachmentKey = row.key;
        button.textContent = row.used ? "Undo used" : "Mark used";
        button.disabled = profile === PROFILE_BOTH;
        actions.appendChild(button);
        cardEl.appendChild(actions);
        if (row.used) popupUsed.appendChild(cardEl);
        else popupResults.appendChild(cardEl);
    });
}

function openOfferPopup(offer) {
    state.activeOffer = offer;
    popupTitle.textContent = offer.merchantName;
    popupMeta.textContent = `${offer.provider.toUpperCase()} | Expires ${offer.expires}`;
    popupSpend.value = String(Number.isFinite(Number(state.prefs.lastOfferSpend)) ? Number(state.prefs.lastOfferSpend) : 50);

    popupAvatar.textContent = (offer.merchantName || "?").charAt(0).toUpperCase();
    if (offer.logo) {
        popupLogo.src = offer.logo;
        popupLogo.classList.remove("hidden");
        popupAvatar.classList.add("hidden");
        popupLogo.onerror = () => {
            popupLogo.classList.add("hidden");
            popupAvatar.classList.remove("hidden");
        };
    } else {
        popupLogo.classList.add("hidden");
        popupAvatar.classList.remove("hidden");
    }

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
    const category = state.selectedCategory;

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
        const activeAttachmentCount = (offer.attachments || []).filter((attachment) => {
            const key = attachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
            return !isAttachmentUsedForProfile(profileSelect.value, key);
        }).length;

        card.innerHTML = `
            <div class="offer-card-head">
                <div class="offer-merchant">
                    ${offer.logo ? `<img class="offer-logo" src="${offer.logo}" alt="${offer.merchantName}">` : `<span class="offer-avatar">${(offer.merchantName || "?").charAt(0).toUpperCase()}</span>`}
                    <div>
                        <strong>${offer.merchantName}</strong>
                        <p class="offers-note">Expires ${offer.expires}</p>
                    </div>
                </div>
                <span class="provider-badge">${offer.provider.toUpperCase()}</span>
            </div>
            <div class="offer-chips">${chips}</div>
            <p class="offers-note">Attached cards: ${activeAttachmentCount}</p>
        `;
        offersList.appendChild(card);
    });

    offersList.querySelectorAll(".offer-logo").forEach((logo) => {
        logo.addEventListener("error", () => {
            const merchant = logo.getAttribute("alt") || "?";
            const fallback = document.createElement("span");
            fallback.className = "offer-avatar";
            fallback.textContent = merchant.charAt(0).toUpperCase();
            logo.replaceWith(fallback);
        }, { once: true });
    });
}

function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove("hidden");
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

function enqueuePublishItem(offerId, cardId, cardInstanceIdOrNull, profile, usedAt) {
    const key = `${offerId}|${cardId}|${cardInstanceIdOrNull || ""}`;
    const existing = state.prefs.offerPublishQueue.some(
        (item) => `${item.offerId}|${item.cardId}|${item.cardInstanceIdOrNull || ""}` === key,
    );
    if (existing) return;
    state.prefs.offerPublishQueue.push({
        offerId,
        cardId,
        cardInstanceIdOrNull,
        profile,
        usedAt,
    });
}

function markAttachmentUsed(profile, key) {
    const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
    if (map[key]) return;
    const [offerId, cardId, cardInstanceIdRaw] = key.split("|");
    const usedAt = new Date().toISOString();
    map[key] = { used: true, usedAt };
    state.prefs.usedOfferAttachmentsByProfile[profile] = map;
    enqueuePublishItem(offerId, cardId, cardInstanceIdRaw || null, profile, usedAt);
}

function unmarkAttachmentUsed(profile, key) {
    const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
    delete map[key];
    state.prefs.usedOfferAttachmentsByProfile[profile] = map;
}

function renderMaintenancePanel() {
    const queue = state.prefs.offerPublishQueue || [];
    maintenanceQueueCount.textContent = `Queued used attachments: ${queue.length}`;
    if (!queue.length) {
        maintenanceQueueTable.innerHTML = `<p class="offers-note">Queue is empty.</p>`;
        return;
    }
    maintenanceQueueTable.innerHTML = "";
    queue.forEach((item) => {
        const offer = state.offers.find((entry) => entry.id === item.offerId);
        const card = getCardById(item.cardId);
        const instanceLabel = card ? getInstanceLabel(card, item.cardInstanceIdOrNull || "") : "";
        const row = document.createElement("div");
        row.className = "maintenance-row";
        row.textContent = `${offer ? offer.merchantName : item.offerId} | ${card ? card.card : item.cardId}${instanceLabel ? ` - ${instanceLabel}` : ""} | ${item.profile} | ${item.usedAt || ""}`;
        maintenanceQueueTable.appendChild(row);
    });
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function buildCleanedOffers() {
    const today = todayIso();
    const keepUnattached = Boolean(maintenanceKeepUnattached && maintenanceKeepUnattached.checked);
    const queuedUsedKeys = new Set(
        (state.prefs.offerPublishQueue || []).map((item) => `${item.offerId}|${item.cardId}|${item.cardInstanceIdOrNull || ""}`),
    );
    const usedAnyProfile = new Set();
    [PROFILE_MICHAEL, PROFILE_JENNA].forEach((profile) => {
        const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
        Object.keys(map).forEach((key) => {
            if (map[key] && map[key].used) usedAnyProfile.add(key);
        });
    });

    const cleaned = state.offers
        .filter((offer) => !offer.expires || offer.expires >= today)
        .map((offer) => {
            const attachments = (offer.attachments || []).filter((attachment) => {
                const key = attachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
                if (queuedUsedKeys.has(key)) return false;
                if (usedAnyProfile.has(key)) return false;
                return true;
            });
            return {
                ...offer,
                attachments,
            };
        })
        .filter((offer) => keepUnattached || (offer.attachments || []).length > 0);

    return cleaned;
}

function setQueryFilters() {
    const params = new URLSearchParams(window.location.search);
    const category = dsNormalizeBonusKey(params.get("category") || "");
    const search = params.get("search");
    if (search) searchInput.value = search;
    const validCategories = new Set(Object.keys(dsCategoryDefs || {}));
    if (category && validCategories.has(category)) {
        state.selectedCategory = category;
    } else {
        state.selectedCategory = "all";
    }
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
    [searchInput, statusSelect, providerSelect].forEach((element) => {
        element.addEventListener("input", renderOffersList);
        element.addEventListener("change", renderOffersList);
    });

    profileSelect.addEventListener("change", () => {
        state.prefs.activeProfile = profileSelect.value;
        savePrefs();
        if (state.activeOffer) renderOfferPopupResults();
        renderOffersList();
    });

    categoryStrip.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-category]");
        if (!button) return;
        state.selectedCategory = String(button.dataset.category || "all");
        renderCategoryStrip();
        renderOffersList();
    });

    offersList.addEventListener("click", (event) => {
        const card = event.target.closest(".offer-card");
        if (!card) return;
        const offerId = String(card.dataset.offerId || "");
        const offer = state.offers.find((item) => item.id === offerId);
        if (offer) openOfferPopup(offer);
    });

    popupSpend.addEventListener("input", renderOfferPopupResults);

    function onPopupAction(event) {
        const button = event.target.closest("button[data-attachment-key]");
        if (!button || !state.activeOffer) return;
        const profile = profileSelect.value;
        if (profile === PROFILE_BOTH) return;
        const key = String(button.dataset.attachmentKey || "");
        const map = state.prefs.usedOfferAttachmentsByProfile[profile] || {};
        if (map[key]) {
            unmarkAttachmentUsed(profile, key);
            showToast("Usage cleared.");
        } else {
            markAttachmentUsed(profile, key);
            showToast("Marked used. Added to publish queue.");
        }
        savePrefs();
        renderOfferPopupResults();
        renderOffersList();
        renderMaintenancePanel();
    }

    popupResults.addEventListener("click", onPopupAction);
    popupUsed.addEventListener("click", onPopupAction);

    popupClose.addEventListener("click", closeOfferPopup);
    popup.addEventListener("click", (event) => {
        if (event.target === popup) closeOfferPopup();
    });

    downloadCleanedButton.addEventListener("click", () => {
        const cleaned = buildCleanedOffers();
        downloadJson("offers-cleaned.json", cleaned);
        showToast("Downloaded offers-cleaned.json");
    });

    clearQueueButton.addEventListener("click", () => {
        const confirmed = window.confirm("Clear publish queue?");
        if (!confirmed) return;
        state.prefs.offerPublishQueue = [];
        savePrefs();
        renderMaintenancePanel();
    });
}

async function init() {
    await loadData();
    setQueryFilters();
    profileSelect.value = state.prefs.activeProfile || PROFILE_MICHAEL;
    popupSpend.value = String(Number.isFinite(Number(state.prefs.lastOfferSpend)) ? Number(state.prefs.lastOfferSpend) : 50);
    bindEvents();
    renderCategoryStrip();
    renderOffersList();
    renderMaintenancePanel();
}

init().catch((error) => {
    offersList.innerHTML = `<p class="offers-note">Could not load offers: ${error.message}</p>`;
});
