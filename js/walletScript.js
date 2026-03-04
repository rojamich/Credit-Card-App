// Fetch data and render unique bonuses
async function fetchAndRenderBonuses() {
    try {
        const [cardData, bankData] = await Promise.all([
            window.CCDataStore.loadDataset(window.CCDataStore.CARDS_STORAGE_KEY, './database/cardsData.json'),
            window.CCDataStore.loadDataset(window.CCDataStore.BANKS_STORAGE_KEY, './database/bankData.json'),
        ]);

        const uniqueBonuses = extractUniqueBonuses(cardData);
        const sortedBonuses = sortBonuses(uniqueBonuses);

        renderBonuses(sortedBonuses, cardData, bankData);
    } catch (error) {
        console.error("Error fetching or rendering bonuses:", error);
    }
}

// Extract unique bonuses from card data
function extractUniqueBonuses(cardData) {
    const bonusSet = new Set();
    cardData.forEach(card => {
        Object.keys(card.bonuses).forEach(bonus => bonusSet.add(bonus));
    });
    return Array.from(bonusSet);
}

// Sort bonuses alphabetically with "Default" first
function sortBonuses(bonuses) {
    return bonuses.sort((a, b) => {
        if (a === "default") return -1;
        if (b === "default") return 1;
        return a.localeCompare(b);
    });
}

// Render bonuses into the DOM
function renderBonuses(bonuses, cardData, bankData) {
    const container = document.getElementById('bonus-container');
    if (!container) return;

    container.innerHTML = "";

    bonuses.forEach(bonus => {
        const box = document.createElement('div');
        box.className = 'bonus-box';
        box.setAttribute('data-bonus', bonus);
        box.onclick = () => showBestCard(bonus, cardData, bankData);

        const logo = document.createElement('img');
        logo.className = 'bonus-logo';
        logo.src = `./logo/cardBonusesIcons/${bonus}-icon.png`;
        logo.alt = `${bonus} Icon`;
        logo.onerror = () => {
            logo.src = './logo/cardBonusesIcons/default-icon.png';
        };

        const name = document.createElement('span');
        name.className = 'bonus-name';
        name.textContent = bonus.replace(/_/g, " ");

        box.appendChild(logo);
        box.appendChild(name);
        container.appendChild(box);
    });
}

// Show the best card for the selected category
function getBankDetails(bankName, bankData) {
    const bank = bankData.find(b => b.name === bankName);
    return bank ? { multiplier: bank.value, type: bank.type } : { multiplier: 1, type: "Cash Back" };
}

function showBestCard(bonus, cardData, bankData) {
    const existingPopup = document.querySelector('.popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    const relevantCards = cardData
        .map(card => {
            const hasCategoryBonus = Object.prototype.hasOwnProperty.call(card.bonuses, bonus);
            const appliedBonus = hasCategoryBonus ? card.bonuses[bonus] : card.bonuses.default;
            if (typeof appliedBonus !== "number") return null;
            const bankDetails = getBankDetails(card.bank, bankData);
            const weightedValue = appliedBonus * bankDetails.multiplier;

            return {
                card: card.card,
                bank: card.bank,
                photoPath: card.photoPath,
                appliedBonus,
                weightedValue,
                bankType: bankDetails.type,
                bankMultiplier: bankDetails.multiplier,
                source: hasCategoryBonus ? "category" : "default",
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
        console.warn(`No valid cards found for bonus: ${bonus}`);
        return;
    }

    let currentIndex = 0;

    // Create and display the popup
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'true');

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

    // Function to update popup content dynamically
    const updatePopupContent = () => {
        const card = relevantCards[currentIndex];

        popupContent.innerHTML = `
            <img src="${card.photoPath}" alt="${card.card}" class="popup-card-image">
            <h2>${card.card}</h2>
            <p>Rank: #${currentIndex + 1} of ${relevantCards.length}</p>
            <p>Bank: ${card.bank}</p>
            <p>Bonus: ${card.appliedBonus.toFixed(1)}x on ${bonus.replace(/_/g, " ")}</p>
            <p>Current Value: ${card.weightedValue.toFixed(2)} (${card.bankType} @ ${card.bankMultiplier.toFixed(2)}x)</p>
            <p>Source: ${card.source === "category" ? "Category bonus" : "Default bonus"}</p>
            <div class="popup-buttons">
                <button type="button" data-action="prev">Previous Card</button>
                <button type="button" data-action="next">Next Best Card</button>
                <button type="button" data-action="close">Close</button>
            </div>
        `;

        const prevButton = popupContent.querySelector('[data-action="prev"]');
        const nextButton = popupContent.querySelector('[data-action="next"]');
        const closeButton = popupContent.querySelector('[data-action="close"]');

        if (prevButton) {
            prevButton.onclick = function () {
                currentIndex = (currentIndex - 1 + relevantCards.length) % relevantCards.length;
                updatePopupContent();
            };
        }

        if (nextButton) {
            nextButton.onclick = function () {
                currentIndex = (currentIndex + 1) % relevantCards.length;
                updatePopupContent();
            };
        }

        if (closeButton) {
            closeButton.onclick = function () {
                closePopup();
            };
        }
    };

    popup.addEventListener('click', (event) => {
        if (event.target === popup) {
            closePopup();
        }
    });

    popupContent.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    updatePopupContent();
    document.body.appendChild(popup);
    document.addEventListener("keydown", onKeyDown);
}

// Fetch and render bonuses on page load
fetchAndRenderBonuses();
