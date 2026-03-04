const {
    loadDataset: dsLoadDataset,
    CARDS_STORAGE_KEY: cardsStorageKey,
    BANKS_STORAGE_KEY: banksStorageKey,
    normalizeBonusKey: dsNormalizeBonusKey,
    normalizeBankName: dsNormalizeBankName,
    normalizeCardsForRuntime: dsNormalizeCardsForRuntime,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
} = window.CCDataStore;

async function fetchAndRenderBonuses() {
    try {
        const [rawCards, rawBanks] = await Promise.all([
            dsLoadDataset(cardsStorageKey, "./database/cardsData.json"),
            dsLoadDataset(banksStorageKey, "./database/bankData.json"),
        ]);

        const cardData = dsNormalizeCardsForRuntime(rawCards);
        const bankData = dsNormalizeBanksForRuntime(rawBanks);

        const uniqueBonuses = extractUniqueBonuses(cardData);
        const sortedBonuses = sortBonuses(uniqueBonuses);

        renderBonuses(sortedBonuses, cardData, bankData);
    } catch (error) {
        console.error("Error fetching or rendering bonuses:", error);
    }
}

function extractUniqueBonuses(cardData) {
    const bonusSet = new Set();
    cardData.forEach((card) => {
        const bonuses = card.bonuses || {};
        Object.keys(bonuses).forEach((bonusKey) => {
            const normalizedKey = dsNormalizeBonusKey(bonusKey);
            if (normalizedKey) bonusSet.add(normalizedKey);
        });
    });
    return Array.from(bonusSet);
}

function sortBonuses(bonuses) {
    return bonuses.sort((a, b) => {
        if (a === "default") return -1;
        if (b === "default") return 1;
        return a.localeCompare(b);
    });
}

function getBankDetails(bankName, bankData) {
    const normalizedCardBank = dsNormalizeBankName(bankName);
    const matchedBank = bankData.find((bank) => dsNormalizeBankName(bank.name) === normalizedCardBank);

    if (matchedBank) {
        return {
            multiplier: matchedBank.value,
            type: matchedBank.type,
            unknownBank: false,
            displayName: matchedBank.name,
        };
    }

    return {
        multiplier: 1,
        type: "Cash Back",
        unknownBank: true,
        displayName: String(bankName || "").trim(),
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
        box.onclick = () => showBestCard(normalizedBonus, cardData, bankData);

        const logo = document.createElement("img");
        logo.className = "bonus-logo";
        logo.src = `./logo/cardBonusesIcons/${normalizedBonus}-icon.png`;
        logo.alt = `${normalizedBonus} icon`;
        logo.onerror = () => {
            logo.src = "./logo/cardBonusesIcons/default-icon.png";
        };

        const name = document.createElement("span");
        name.className = "bonus-name";
        name.textContent = normalizedBonus.replace(/_/g, " ");

        box.appendChild(logo);
        box.appendChild(name);
        container.appendChild(box);
    });
}

function createInfoLine(text) {
    const line = document.createElement("p");
    line.textContent = text;
    return line;
}

function showBestCard(bonus, cardData, bankData) {
    const normalizedBonus = dsNormalizeBonusKey(bonus);
    if (!normalizedBonus) return;

    const existingPopup = document.querySelector(".popup");
    if (existingPopup) existingPopup.remove();

    const relevantCards = cardData
        .map((card) => {
            const normalizedBonuses = card.bonuses || {};
            const hasCategoryBonus = Object.prototype.hasOwnProperty.call(normalizedBonuses, normalizedBonus);
            const appliedBonus = hasCategoryBonus ? normalizedBonuses[normalizedBonus] : normalizedBonuses.default;
            const numericBonus = Number(appliedBonus);
            if (!Number.isFinite(numericBonus)) return null;

            const bankDetails = getBankDetails(card.bank, bankData);
            const weightedValue = numericBonus * bankDetails.multiplier;

            return {
                card: card.card,
                bank: card.bank,
                photoPath: card.photoPath,
                appliedBonus: numericBonus,
                weightedValue,
                bankType: bankDetails.type,
                bankMultiplier: bankDetails.multiplier,
                source: hasCategoryBonus ? "category" : "default",
                unknownBank: bankDetails.unknownBank,
                unknownBankName: bankDetails.displayName,
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
        popupContent.innerHTML = "";

        const image = document.createElement("img");
        image.className = "popup-card-image";
        image.src = card.photoPath;
        image.alt = card.card;

        const title = document.createElement("h2");
        title.textContent = card.card;

        popupContent.appendChild(image);
        popupContent.appendChild(title);
        popupContent.appendChild(createInfoLine(`Rank: #${currentIndex + 1} of ${relevantCards.length}`));
        popupContent.appendChild(createInfoLine(`Bank: ${card.bank}`));
        popupContent.appendChild(createInfoLine(`Bonus: ${card.appliedBonus.toFixed(1)}x on ${normalizedBonus.replace(/_/g, " ")}`));
        popupContent.appendChild(createInfoLine(`Current Value: ${card.weightedValue.toFixed(2)} (${card.bankType} @ ${card.bankMultiplier.toFixed(2)}x)`));
        popupContent.appendChild(createInfoLine(`Source: ${card.source === "category" ? "Category bonus" : "Default bonus"}`));

        if (card.unknownBank) {
            const warning = createInfoLine(`Unknown bank: ${card.unknownBankName || card.bank} (using multiplier 1)`);
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
