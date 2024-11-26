// Fetch data and render unique bonuses
async function fetchAndRenderBonuses() {
    try {
        // Fetch the card and bank data
        const [cardResponse, bankResponse] = await Promise.all([
            fetch('./database/cardsData.json'),
            fetch('./database/bankData.json'),
        ]);

        if (!cardResponse.ok || !bankResponse.ok)
            throw new Error("Failed to fetch card or bank data.");

        const [cardData, bankData] = await Promise.all([
            cardResponse.json(),
            bankResponse.json(),
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

// Get the bank multiplier and type for a given bank
function getBankDetails(bankName, bankData) {
    const bank = bankData.find(b => b.name === bankName);
    return bank ? { multiplier: bank.value, type: bank.type } : { multiplier: 1, type: "cash" }; // Default
}

// Render bonuses into the DOM
function renderBonuses(bonuses, cardData, bankData) {
    const container = document.getElementById('bonus-container');

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
        name.textContent = bonus;

        box.appendChild(logo);
        box.appendChild(name);
        container.appendChild(box);
    });
}

// Show the best card for the selected category
function showBestCard(bonus, cardData, bankData) {
    const relevantCards = cardData
        .map(card => {
            const cardBonus = card.bonuses[bonus] || card.bonuses.default; // Fallback to Default bonus
            const { multiplier, type } = getBankDetails(card.bank, bankData);
            const weightedBonus = cardBonus * multiplier;

            return {
                card: card.card,
                bank: card.bank,
                photoPath: card.photoPath,
                originalBonus: cardBonus, // Original bonus value
                weightedBonus, // Weighted bonus value
                bankType: type, // e.g., "UR points", "cash"
            };
        })
        .filter(card => card.weightedBonus) // Ensure valid cards
        .sort((a, b) => b.weightedBonus - a.weightedBonus); // Sort by weighted bonus value descending

    let currentIndex = 0;

    // Create and display the popup
    const popup = document.createElement('div');
    popup.className = 'popup';

    // Function to update popup content dynamically
    const updatePopupContent = () => {
        const card = relevantCards[currentIndex];

        popup.innerHTML = `
            <div class="popup-content">
                <img src="${card.photoPath}" alt="${card.card}" class="popup-card-image">
                <h2>${card.card}</h2>
                <p>Bank: ${card.bank}</p>
                <p>Bonus: ${card.originalBonus.toFixed(1)}x on ${bonus}</p>
                <p>Valued at ${card.weightedBonus.toFixed(2)} ${card.bankType}</p>
                <div class="popup-buttons">
                    <button id="prev-card-button">Previous Card</button>
                    <button id="next-card-button">Next Best Card</button>
                    <button id="close-popup-button">Close</button>
                </div>
            </div>
        `;

        // Attach event listeners for the buttons
        setTimeout(() => {
            const prevButton = document.getElementById('prev-card-button');
            const nextButton = document.getElementById('next-card-button');
            const closeButton = document.getElementById('close-popup-button');

            if (prevButton) {
                prevButton.addEventListener('click', () => {
                    currentIndex = (currentIndex - 1 + relevantCards.length) % relevantCards.length;
                    updatePopupContent(); // Update popup with the previous card
                });
            }

            if (nextButton) {
                nextButton.addEventListener('click', () => {
                    currentIndex = (currentIndex + 1) % relevantCards.length;
                    updatePopupContent(); // Update popup with the next card
                });
            }

            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    if (popup.parentNode) popup.parentNode.removeChild(popup);
                });
            }
        }, 0);
    };

    updatePopupContent();
    document.body.appendChild(popup);
}

// Fetch and render bonuses on page load
fetchAndRenderBonuses();
