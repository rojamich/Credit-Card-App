
const {
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    OFFERS_STORAGE_KEY: offersStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeOffersForRuntime: dsNormalizeOffersForRuntime,
    validateAndNormalizeOffers: dsValidateAndNormalizeOffers,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankKey: dsNormalizeBankKey,
    normalizeOfferId: dsNormalizeOfferId,
    normalizeCardId: dsNormalizeCardId,
    prettyLabelFromKey: dsPrettyLabelFromKey,
    getBankValue: dsGetBankValue,
    CATEGORY_DEFS: dsCategoryDefs,
    getCategoryDefsFromCards: dsGetCategoryDefsFromCards,
} = window.CCDataStore;
const {
    loadPersonalState: psLoadPersonalState,
    savePersonalState: psSavePersonalState,
    normalizePersonalState: psNormalizePersonalState,
} = window.CCPersonalStateStore;

const OFFERS_EDITOR_STORAGE_KEY = "offersData";
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
    editingIndex: null,
    offerIdTouched: false,
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

const offersAddButton = document.getElementById("offers-add-button");
const offersSaveButton = document.getElementById("offers-save-button");
const offersExportBackupButton = document.getElementById("offers-export-backup-button");
const offersExportPublishButton = document.getElementById("offers-export-publish-button");
const offersReloadPublishedButton = document.getElementById("offers-reload-published-button");
const offersAdminMessage = document.getElementById("offers-admin-message");
const offersAdminList = document.getElementById("offers-admin-list");

const offerEditorModal = document.getElementById("offer-editor-modal");
const offerEditorTitle = document.getElementById("offer-editor-title");
const offerEditorClose = document.getElementById("offer-editor-close");
const offerEditorErrors = document.getElementById("offer-editor-errors");
const offerEditorForm = document.getElementById("offer-editor-form");
const offerIdInput = document.getElementById("offer-id-input");
const offerMerchantKeyInput = document.getElementById("offer-merchant-key-input");
const offerMerchantNameInput = document.getElementById("offer-merchant-name-input");
const offerLogoInput = document.getElementById("offer-logo-input");
const offerProviderInput = document.getElementById("offer-provider-input");
const offerStartDateInput = document.getElementById("offer-start-date-input");
const offerExpiresInput = document.getElementById("offer-expires-input");
const offerCategoriesInput = document.getElementById("offer-categories-input");
const offerTypeInput = document.getElementById("offer-type-input");
const offerFieldsPercent = document.getElementById("offer-fields-percent");
const offerFieldsFixed = document.getElementById("offer-fields-fixed");
const offerFieldsPoints = document.getElementById("offer-fields-points");
const offerRateInput = document.getElementById("offer-rate-input");
const offerMaxDiscountInput = document.getElementById("offer-max-discount-input");
const offerMinSpendPercentInput = document.getElementById("offer-min-spend-percent-input");
const offerFixedAmountInput = document.getElementById("offer-fixed-amount-input");
const offerMinSpendFixedInput = document.getElementById("offer-min-spend-fixed-input");
const offerPointsInput = document.getElementById("offer-points-input");
const offerProgramKeyInput = document.getElementById("offer-program-key-input");
const offerMinSpendPointsInput = document.getElementById("offer-min-spend-points-input");
const offerAliasesInput = document.getElementById("offer-aliases-input");
const offerNotesInput = document.getElementById("offer-notes-input");
const offerAttachmentsInput = document.getElementById("offer-attachments-input");
const offerAddAttachmentButton = document.getElementById("offer-add-attachment-button");

function savePrefs() {
    state.prefs = psNormalizePersonalState(state.prefs);
    void psSavePersonalState(state.prefs, { updatedBy: "offers" })
        .then(({ state: savedState }) => {
            state.prefs = savedState;
        })
        .catch(() => {
            // Local cache already updated inside the personal-state store.
        });
}

function setAdminMessage(message, isError) {
    if (!offersAdminMessage) return;
    offersAdminMessage.textContent = message;
    offersAdminMessage.style.color = isError ? "#b00020" : "#2f5f2f";
}

function setEditorErrors(errors) {
    if (!offerEditorErrors) return;
    offerEditorErrors.textContent = errors && errors.length ? errors.map((error) => `- ${error}`).join("\n") : "";
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

function toNumberOrNull(value) {
    if (value === "" || value === null || typeof value === "undefined") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function getActualOfferCategoryDefs() {
    if (typeof dsGetCategoryDefsFromCards === "function") {
        const defs = dsGetCategoryDefsFromCards(state.cards);
        if (Array.isArray(defs) && defs.length) return defs;
    }
    return Object.entries(dsCategoryDefs || {})
        .map(([key, def]) => ({ key, label: def.label || dsPrettyLabelFromKey(key) }))
        .filter((category) => category.key && category.key !== "default");
}

function offerCategoryList(selectedKeys) {
    const merged = new Map();
    getActualOfferCategoryDefs().forEach((category) => {
        const key = dsNormalizeBonusKey(category.key);
        if (!key || key === "default") return;
        merged.set(key, {
            key,
            label: category.label || dsPrettyLabelFromKey(key),
        });
    });
    (selectedKeys || []).forEach((key) => {
        const normalized = dsNormalizeBonusKey(key);
        if (!normalized || normalized === "default" || merged.has(normalized)) return;
        merged.set(normalized, {
            key: normalized,
            label: dsPrettyLabelFromKey(normalized),
        });
    });
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
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
        if (spend < minSpend) return { value: 0, detail: `${formatMoney(amount)} after ${formatMoney(minSpend)} min spend` };
        return { value: amount, detail: `${formatMoney(amount)} statement credit` };
    }
    if (offer.offerType === "points") {
        const points = Number(offer.points) || 0;
        const cpp = Number(dsGetBankValue(dsNormalizeBankKey(offer.programKey || ""))) || 0;
        if (spend < minSpend) return { value: 0, detail: `${points} pts after ${formatMoney(minSpend)} min spend` };
        return { value: points * (cpp / 100), detail: `${points} pts @ ${cpp.toFixed(2)} cpp` };
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
    return { bestCategory, bestRatePct, rewardDollar: spend * (bestRatePct / 100) };
}

function renderOfferPopupResults() {
    const offer = state.activeOffer;
    if (!offer) return;
    const spend = readSpendInput();
    state.prefs.lastOfferSpend = spend;
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
            used,
            cardName: card.card,
            instanceLabel: getInstanceLabel(card, attachment.cardInstanceId),
            reward,
            offerValue,
            total,
            effectivePct: spend > 0 ? (total / spend) * 100 : 0,
        });
    });

    rows.sort((a, b) => (b.total - a.total) || a.cardName.localeCompare(b.cardName));
    popupResults.innerHTML = "";
    popupUsed.innerHTML = "";
    profileNote.textContent = profile === PROFILE_BOTH ? "Choose Michael or Jenna to mark offers as used." : "";

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
            return `${offer.merchantName} ${offer.merchantKey} ${aliases}`.toLowerCase().includes(search);
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
function renderAdminList() {
    offersAdminList.innerHTML = "";
    if (!state.offers.length) {
        offersAdminList.innerHTML = `<p class="offers-note">No offers yet. Add one.</p>`;
        return;
    }
    state.offers
        .map((offer, index) => ({ offer, index }))
        .sort((a, b) => a.offer.merchantName.localeCompare(b.offer.merchantName))
        .forEach(({ offer, index }) => {
            const row = document.createElement("article");
            row.className = "offers-admin-item";
            const meta = document.createElement("div");
            const topLevelNotes = String(offer.notes || "").trim();
            const attachmentNoteLines = getOfferAttachmentNoteLines(offer);
            const noteMarkup = [];
            if (topLevelNotes) noteMarkup.push(`<p class="offers-admin-subnote">Notes: ${topLevelNotes}</p>`);
            attachmentNoteLines.forEach((line) => noteMarkup.push(`<p class="offers-admin-subnote">${line}</p>`));
            meta.innerHTML = `
                <strong>${offer.merchantName}</strong>
                <p>ID: ${offer.id}</p>
                <p>${offer.offerType.toUpperCase()} | Expires ${offer.expires} | Attachments: ${(offer.attachments || []).length}</p>
                ${noteMarkup.join("")}
            `;
            const actions = document.createElement("div");
            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.textContent = "Edit";
            editButton.onclick = () => openOfferEditor(index);
            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "danger-button";
            deleteButton.textContent = "Delete";
            deleteButton.onclick = () => {
                state.offers.splice(index, 1);
                renderAllOffersViews();
            };
            actions.appendChild(editButton);
            actions.appendChild(deleteButton);
            row.appendChild(meta);
            row.appendChild(actions);
            offersAdminList.appendChild(row);
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
    if (!existing) state.prefs.offerPublishQueue.push({ offerId, cardId, cardInstanceIdOrNull, profile, usedAt });
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
        Object.keys(map).forEach((key) => { if (map[key] && map[key].used) usedAnyProfile.add(key); });
    });
    return state.offers
        .filter((offer) => !offer.expires || offer.expires >= today)
        .map((offer) => ({
            ...offer,
            attachments: (offer.attachments || []).filter((attachment) => {
                const key = attachmentKey(offer.id, attachment.cardId, attachment.cardInstanceId);
                return !(queuedUsedKeys.has(key) || usedAnyProfile.has(key));
            }),
        }))
        .filter((offer) => keepUnattached || (offer.attachments || []).length > 0);
}

function setQueryFilters() {
    const params = new URLSearchParams(window.location.search);
    const category = dsNormalizeBonusKey(params.get("category") || "");
    const search = params.get("search");
    if (search) searchInput.value = search;
    const validCategories = new Set(getActualOfferCategoryDefs().map((item) => item.key));
    state.selectedCategory = category && validCategories.has(category) ? category : "all";
}
function renderCategoryOptions(selectedKeys) {
    const selected = new Set((selectedKeys || []).map((key) => dsNormalizeBonusKey(key)));
    offerCategoriesInput.innerHTML = "";
    offerCategoryList(selectedKeys).forEach((category) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = category.key;
        checkbox.checked = selected.has(category.key);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(category.label));
        offerCategoriesInput.appendChild(label);
    });
}

function renderProgramKeyOptions(selectedKey) {
    const normalized = dsNormalizeBankKey(selectedKey || "");
    offerProgramKeyInput.innerHTML = `<option value="">Select program</option>`;
    state.banks.forEach((bank) => {
        const option = document.createElement("option");
        option.value = bank.key;
        option.textContent = `${bank.label} (${bank.key})`;
        offerProgramKeyInput.appendChild(option);
    });
    offerProgramKeyInput.value = normalized;
}

function updateOfferTypeFields() {
    const type = offerTypeInput.value;
    offerFieldsPercent.classList.toggle("hidden", type !== "percent");
    offerFieldsFixed.classList.toggle("hidden", type !== "fixed");
    offerFieldsPoints.classList.toggle("hidden", type !== "points");
}

function populateInstanceOptions(selectEl, cardId, selectedInstanceId) {
    selectEl.innerHTML = `<option value="">(None)</option>`;
    const card = getCardById(cardId);
    const instances = card && Array.isArray(card.instances) ? card.instances : [];
    instances.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.label || item.id;
        selectEl.appendChild(option);
    });
    selectEl.value = selectedInstanceId || "";
}

function createAttachmentRow(attachment) {
    const row = document.createElement("div");
    row.className = "offer-attachment-row";

    const cardSelect = document.createElement("select");
    cardSelect.className = "offer-attachment-card";
    state.cards.forEach((card) => {
        const option = document.createElement("option");
        option.value = card.id;
        option.textContent = `${card.card} (${card.id})`;
        cardSelect.appendChild(option);
    });
    cardSelect.value = attachment.cardId || (state.cards[0] ? state.cards[0].id : "");

    const instanceSelect = document.createElement("select");
    instanceSelect.className = "offer-attachment-instance";
    populateInstanceOptions(instanceSelect, cardSelect.value, attachment.cardInstanceId || "");
    cardSelect.addEventListener("change", () => populateInstanceOptions(instanceSelect, cardSelect.value, ""));

    const noteWrap = document.createElement("label");
    noteWrap.className = "offer-attachment-note-wrap";
    const noteLabel = document.createElement("span");
    noteLabel.textContent = "Attachment note / card note";
    const noteInput = document.createElement("input");
    noteInput.className = "offer-attachment-note";
    noteInput.type = "text";
    noteInput.placeholder = "Belongs to Sapphire ending 1234";
    noteInput.value = attachment.note || "";
    noteWrap.appendChild(noteLabel);
    noteWrap.appendChild(noteInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger-button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => row.remove();

    row.appendChild(cardSelect);
    row.appendChild(instanceSelect);
    row.appendChild(noteWrap);
    row.appendChild(removeButton);
    offerAttachmentsInput.appendChild(row);
}

function readAttachmentsFromForm() {
    return Array.from(offerAttachmentsInput.querySelectorAll(".offer-attachment-row")).map((row) => {
        const cardField = row.querySelector(".offer-attachment-card");
        const instanceField = row.querySelector(".offer-attachment-instance");
        const noteField = row.querySelector(".offer-attachment-note");
        return {
            cardId: dsNormalizeCardId(cardField ? cardField.value : ""),
            cardInstanceId: dsNormalizeCardId(instanceField ? instanceField.value : ""),
            note: String(noteField ? noteField.value : "").trim(),
        };
    }).filter((item) => item.cardId);
}

function selectedCategoryKeysFromForm() {
    return Array.from(offerCategoriesInput.querySelectorAll("input[type='checkbox']:checked"))
        .map((input) => dsNormalizeBonusKey(input.value))
        .filter(Boolean);
}

function generateOfferId() {
    const merchantKey = dsNormalizeBonusKey(offerMerchantKeyInput.value || offerMerchantNameInput.value || "offer");
    const type = dsNormalizeBonusKey(offerTypeInput.value || "offer");
    const expires = String(offerExpiresInput.value || "").replace(/-/g, "_");
    return dsNormalizeOfferId(`${merchantKey}_${type}_${expires || "date"}`) || "offer";
}

function maybeAutoUpdateOfferId() {
    if (state.offerIdTouched) return;
    offerIdInput.value = generateOfferId();
}

function collectOfferFromForm() {
    const type = offerTypeInput.value;
    let minSpend = 0;
    if (type === "percent") minSpend = toNumberOrNull(offerMinSpendPercentInput.value);
    if (type === "fixed") minSpend = toNumberOrNull(offerMinSpendFixedInput.value);
    if (type === "points") minSpend = toNumberOrNull(offerMinSpendPointsInput.value);
    return {
        id: dsNormalizeOfferId(offerIdInput.value || generateOfferId()),
        merchantKey: dsNormalizeBonusKey(offerMerchantKeyInput.value || offerMerchantNameInput.value),
        merchantName: String(offerMerchantNameInput.value || "").trim(),
        logo: String(offerLogoInput.value || "").trim(),
        provider: String(offerProviderInput.value || "other").trim().toLowerCase(),
        startDate: String(offerStartDateInput.value || "").trim(),
        expires: String(offerExpiresInput.value || "").trim(),
        categories: selectedCategoryKeysFromForm(),
        offerType: type,
        rate: type === "percent" ? toNumberOrNull(offerRateInput.value) : null,
        maxDiscount: type === "percent" ? toNumberOrNull(offerMaxDiscountInput.value) : null,
        minSpend: minSpend === null ? 0 : minSpend,
        fixedAmount: type === "fixed" ? toNumberOrNull(offerFixedAmountInput.value) : null,
        points: type === "points" ? toNumberOrNull(offerPointsInput.value) : null,
        programKey: type === "points" ? dsNormalizeBankKey(offerProgramKeyInput.value) : "",
        aliases: String(offerAliasesInput.value || "").split(",").map((item) => item.trim()).filter(Boolean),
        notes: String(offerNotesInput.value || "").trim(),
        attachments: readAttachmentsFromForm(),
    };
}

function validateOffersWithRelations(offers) {
    const validation = dsValidateAndNormalizeOffers(offers);
    if (!validation.ok) return validation;

    const errors = [];
    const categoryKeys = new Set(getActualOfferCategoryDefs().map((item) => item.key));
    validation.data.forEach((offer) => {
        offer.categories.forEach((key) => {
            if (key) categoryKeys.add(key);
        });
    });
    const cardIds = new Set(state.cards.map((card) => card.id));
    const bankKeys = new Set(state.banks.map((bank) => dsNormalizeBankKey(bank.key)));

    validation.data.forEach((offer, index) => {
        offer.categories.forEach((key) => {
            if (!categoryKeys.has(key)) errors.push(`Offer ${index + 1}: invalid category "${key}".`);
        });
        offer.attachments.forEach((attachment) => {
            if (!cardIds.has(attachment.cardId)) {
                errors.push(`Offer ${index + 1}: attachment cardId "${attachment.cardId}" does not exist.`);
            }
        });
        if (offer.offerType === "points" && !bankKeys.has(dsNormalizeBankKey(offer.programKey))) {
            errors.push(`Offer ${index + 1}: points offer programKey "${offer.programKey}" not found in banks.`);
        }
    });

    return {
        ok: errors.length === 0,
        data: validation.data,
        errors: [...validation.errors, ...errors],
    };
}

function getOfferAttachmentNoteLines(offer) {
    return (offer.attachments || []).map((attachment) => {
        const note = String(attachment.note || "").trim();
        if (!note) return "";
        const card = getCardById(attachment.cardId);
        const cardName = card ? card.card : attachment.cardId;
        const instanceLabel = card ? getInstanceLabel(card, attachment.cardInstanceId) : attachment.cardInstanceId;
        return `${cardName}${instanceLabel ? ` - ${instanceLabel}` : ""}: ${note}`;
    }).filter(Boolean);
}
function openOfferEditor(index) {
    state.editingIndex = typeof index === "number" ? index : null;
    state.offerIdTouched = false;
    const offer = state.editingIndex === null
        ? {
            id: "",
            merchantKey: "",
            merchantName: "",
            logo: "",
            provider: "other",
            startDate: "",
            expires: "",
            categories: [],
            offerType: "percent",
            rate: 0.1,
            maxDiscount: null,
            minSpend: 0,
            fixedAmount: null,
            points: null,
            programKey: "",
            aliases: [],
            notes: "",
            attachments: [],
        }
        : state.offers[state.editingIndex];

    offerEditorTitle.textContent = state.editingIndex === null ? "Add Offer" : "Edit Offer";
    offerIdInput.value = offer.id || "";
    offerMerchantKeyInput.value = offer.merchantKey || "";
    offerMerchantNameInput.value = offer.merchantName || "";
    offerLogoInput.value = offer.logo || "";
    offerProviderInput.value = offer.provider || "other";
    offerStartDateInput.value = offer.startDate || "";
    offerExpiresInput.value = offer.expires || "";
    renderCategoryOptions(offer.categories || []);
    offerTypeInput.value = offer.offerType || "percent";
    offerRateInput.value = offer.rate ?? "";
    offerMaxDiscountInput.value = offer.maxDiscount ?? "";
    offerMinSpendPercentInput.value = offer.offerType === "percent" ? (offer.minSpend ?? 0) : 0;
    offerFixedAmountInput.value = offer.fixedAmount ?? "";
    offerMinSpendFixedInput.value = offer.offerType === "fixed" ? (offer.minSpend ?? 0) : 0;
    offerPointsInput.value = offer.points ?? "";
    renderProgramKeyOptions(offer.programKey || "");
    offerMinSpendPointsInput.value = offer.offerType === "points" ? (offer.minSpend ?? 0) : 0;
    offerAliasesInput.value = Array.isArray(offer.aliases) ? offer.aliases.join(", ") : "";
    offerNotesInput.value = offer.notes || "";
    offerAttachmentsInput.innerHTML = "";
    (offer.attachments && offer.attachments.length ? offer.attachments : [{ cardId: "", cardInstanceId: "", note: "" }])
        .forEach((attachment) => createAttachmentRow(attachment));
    updateOfferTypeFields();
    setEditorErrors([]);
    offerEditorModal.classList.remove("hidden");
    maybeAutoUpdateOfferId();
}

function closeOfferEditor() {
    offerEditorModal.classList.add("hidden");
    state.editingIndex = null;
    state.offerIdTouched = false;
    setEditorErrors([]);
}

function upsertOfferFromForm() {
    const candidate = collectOfferFromForm();
    const next = [...state.offers];
    if (state.editingIndex === null) next.push(candidate);
    else next[state.editingIndex] = candidate;
    const validation = validateOffersWithRelations(next);
    if (!validation.ok) {
        setEditorErrors(validation.errors);
        return;
    }
    state.offers = validation.data;
    closeOfferEditor();
    renderAllOffersViews();
    setAdminMessage("Offer updated in editor list. Click Save All Offers to persist locally.", false);
}

function saveOffersLocally() {
    const validation = validateOffersWithRelations(state.offers);
    if (!validation.ok) {
        setAdminMessage(`Save blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
        return;
    }
    state.offers = validation.data;
    localStorage.setItem(OFFERS_EDITOR_STORAGE_KEY, JSON.stringify(validation.data));
    dsWriteLocalJson(offersStorageKey, validation.data);
    renderAllOffersViews();
    setAdminMessage("Offers saved locally on this device.", false);
}

function getOffersBackupFilename() {
    return `offersData-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

function exportOffersBackup() {
    const validation = validateOffersWithRelations(state.offers);
    if (!validation.ok) {
        setAdminMessage(`Export blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
        return;
    }
    downloadJson(getOffersBackupFilename(), validation.data);
    setAdminMessage("Offers backup exported.", false);
}

function exportOffersForPublish() {
    const validation = validateOffersWithRelations(state.offers);
    if (!validation.ok) {
        setAdminMessage(`Export blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
        return;
    }
    downloadJson("offers.json", validation.data);
    setAdminMessage("Saved offers.json. Replace /database/offers.json in your repo with this file and commit.", false);
}

async function fetchPublishedOffers() {
    const response = await fetch(`./database/offers.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to fetch published offers.json");
    return response.json();
}

async function loadOffersForEditor() {
    const localRaw = localStorage.getItem(OFFERS_EDITOR_STORAGE_KEY);
    if (localRaw) {
        try {
            return JSON.parse(localRaw);
        } catch (error) {
            localStorage.removeItem(OFFERS_EDITOR_STORAGE_KEY);
        }
    }
    try {
        return await fetchPublishedOffers();
    } catch (error) {
        return dsLoadDataset(offersStorageKey, "./database/offers.json");
    }
}

async function reloadPublishedOffers() {
    if (!window.confirm("Discard local offersData edits and reload published offers.json?")) return;
    try {
        localStorage.removeItem(OFFERS_EDITOR_STORAGE_KEY);
        const published = await fetchPublishedOffers();
        const validation = validateOffersWithRelations(published);
        if (!validation.ok) {
            setAdminMessage(`Reload blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
            return;
        }
        state.offers = validation.data;
        dsWriteLocalJson(offersStorageKey, validation.data);
        renderAllOffersViews();
        setAdminMessage("Published offers reloaded.", false);
    } catch (error) {
        setAdminMessage(`Reload failed: ${error.message}`, true);
    }
}

function renderAllOffersViews() {
    renderOffersList();
    renderAdminList();
    renderMaintenancePanel();
}

async function loadData() {
    const [rawCards, rawBanks, rawOffers, personalStateResult] = await Promise.all([
        dsLoadDataset(cardsStorageKey, "./database/cards.json"),
        dsLoadDataset(banksStorageKey, "./database/banks.json"),
        loadOffersForEditor(),
        psLoadPersonalState(),
    ]);
    state.cards = dsNormalizeCardsForRuntime(rawCards);
    state.banks = dsNormalizeBanksForRuntime(rawBanks);
    const normalizedOffers = dsNormalizeOffersForRuntime(rawOffers);
    const validation = validateOffersWithRelations(normalizedOffers);
    state.offers = validation.ok ? validation.data : normalizedOffers;
    state.prefs = personalStateResult.state;
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
        const offer = state.offers.find((item) => item.id === String(card.dataset.offerId || ""));
        if (offer) openOfferPopup(offer);
    });

    popupSpend.addEventListener("input", renderOfferPopupResults);
    popupSpend.addEventListener("change", () => {
        state.prefs.lastOfferSpend = readSpendInput();
        savePrefs();
    });
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
    popup.addEventListener("click", (event) => { if (event.target === popup) closeOfferPopup(); });

    downloadCleanedButton.addEventListener("click", () => {
        downloadJson("offers-cleaned.json", buildCleanedOffers());
        showToast("Downloaded offers-cleaned.json");
    });
    clearQueueButton.addEventListener("click", () => {
        if (!window.confirm("Clear publish queue?")) return;
        state.prefs.offerPublishQueue = [];
        savePrefs();
        renderMaintenancePanel();
    });

    offersAddButton.addEventListener("click", () => openOfferEditor(null));
    offersSaveButton.addEventListener("click", saveOffersLocally);
    offersExportBackupButton.addEventListener("click", exportOffersBackup);
    offersExportPublishButton.addEventListener("click", exportOffersForPublish);
    offersReloadPublishedButton.addEventListener("click", reloadPublishedOffers);

    offerEditorClose.addEventListener("click", closeOfferEditor);
    offerEditorModal.addEventListener("click", (event) => { if (event.target === offerEditorModal) closeOfferEditor(); });
    offerEditorForm.addEventListener("submit", (event) => {
        event.preventDefault();
        upsertOfferFromForm();
    });
    offerTypeInput.addEventListener("change", () => {
        updateOfferTypeFields();
        maybeAutoUpdateOfferId();
    });
    offerMerchantKeyInput.addEventListener("input", maybeAutoUpdateOfferId);
    offerMerchantNameInput.addEventListener("input", () => {
        if (!offerMerchantKeyInput.value.trim()) offerMerchantKeyInput.value = dsNormalizeBonusKey(offerMerchantNameInput.value);
        maybeAutoUpdateOfferId();
    });
    offerExpiresInput.addEventListener("change", maybeAutoUpdateOfferId);
    offerIdInput.addEventListener("input", () => {
        state.offerIdTouched = true;
        offerIdInput.value = dsNormalizeOfferId(offerIdInput.value);
    });
    offerAddAttachmentButton.addEventListener("click", () => createAttachmentRow({ cardId: "", cardInstanceId: "", note: "" }));
}

async function init() {
    await loadData();
    setQueryFilters();
    profileSelect.value = state.prefs.activeProfile || PROFILE_MICHAEL;
    popupSpend.value = String(Number.isFinite(Number(state.prefs.lastOfferSpend)) ? Number(state.prefs.lastOfferSpend) : 50);
    renderProgramKeyOptions("");
    bindEvents();
    renderCategoryStrip();
    renderAllOffersViews();
}

init().catch((error) => {
    offersList.innerHTML = `<p class="offers-note">Could not load offers: ${error.message}</p>`;
});
