const cardsContainer = document.getElementById("cards-container");
const messageEl = document.getElementById("cards-message");
const addCardButton = document.getElementById("add-card-button");
const saveCardsButton = document.getElementById("save-cards-button");

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function formatBonuses(bonuses) {
    return JSON.stringify(bonuses, null, 2);
}

function createCardEditor(card = { card: "", bank: "", photoPath: "", bonuses: { default: 1 } }) {
    const wrapper = document.createElement("section");
    wrapper.className = "card-editor";

    wrapper.innerHTML = `
        <h3>Card</h3>
        <div class="card-fields">
            <label>Card Name</label>
            <input type="text" data-field="card" value="${card.card}">

            <label>Bank Name Key</label>
            <input type="text" data-field="bank" value="${card.bank}">

            <label>Photo URL</label>
            <input type="text" data-field="photoPath" value="${card.photoPath}">

            <label>Bonuses JSON</label>
            <textarea data-field="bonuses">${formatBonuses(card.bonuses)}</textarea>
        </div>
    `;

    return wrapper;
}

async function loadCards() {
    setMessage("Loading card data...", false);
    try {
        const response = await fetch("/api/cards");
        if (!response.ok) throw new Error("Could not fetch card data.");
        const cards = await response.json();

        cardsContainer.innerHTML = "";
        cards.forEach((card) => cardsContainer.appendChild(createCardEditor(card)));
        setMessage("Card data loaded.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function collectCardsFromEditors() {
    const editors = cardsContainer.querySelectorAll(".card-editor");

    return Array.from(editors).map((editor, index) => {
        const cardName = editor.querySelector('[data-field="card"]').value.trim();
        const bank = editor.querySelector('[data-field="bank"]').value.trim();
        const photoPath = editor.querySelector('[data-field="photoPath"]').value.trim();
        const bonusesRaw = editor.querySelector('[data-field="bonuses"]').value.trim();

        let bonuses;
        try {
            bonuses = JSON.parse(bonusesRaw);
        } catch (error) {
            throw new Error(`Invalid bonuses JSON at card #${index + 1}.`);
        }

        if (!bonuses || typeof bonuses !== "object" || Array.isArray(bonuses)) {
            throw new Error(`Bonuses must be an object at card #${index + 1}.`);
        }

        return {
            card: cardName,
            bank,
            photoPath,
            bonuses,
        };
    });
}

async function saveCards() {
    try {
        const payload = collectCardsFromEditors();

        const response = await fetch("/api/cards", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error || "Failed to save card data.");
        }

        setMessage("Card data saved.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

addCardButton.addEventListener("click", () => {
    cardsContainer.appendChild(createCardEditor());
});

saveCardsButton.addEventListener("click", saveCards);

loadCards();
