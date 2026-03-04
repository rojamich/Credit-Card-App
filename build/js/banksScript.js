const tableBody = document.getElementById("banks-table-body");
const messageEl = document.getElementById("banks-message");
const addBankButton = document.getElementById("add-bank-button");
const saveBanksButton = document.getElementById("save-banks-button");

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function createBankRow(bank = { name: "", type: "", value: 1 }) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td><input type="text" data-field="name" value="${bank.name}"></td>
        <td><input type="text" data-field="type" value="${bank.type}"></td>
        <td><input type="number" data-field="value" value="${bank.value}" step="0.01"></td>
    `;
    return tr;
}

async function loadBanks() {
    setMessage("Loading bank data...", false);
    try {
        const response = await fetch("/api/banks");
        if (!response.ok) throw new Error("Could not fetch bank data.");
        const banks = await response.json();

        tableBody.innerHTML = "";
        banks.forEach((bank) => tableBody.appendChild(createBankRow(bank)));
        setMessage("Bank data loaded.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function collectBanksFromTable() {
    const rows = tableBody.querySelectorAll("tr");
    return Array.from(rows).map((row) => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        const type = row.querySelector('[data-field="type"]').value.trim();
        const value = Number(row.querySelector('[data-field="value"]').value);

        return { name, type, value };
    });
}

async function saveBanks() {
    try {
        const payload = collectBanksFromTable();
        const response = await fetch("/api/banks", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(errorBody.error || "Failed to save bank data.");
        }

        setMessage("Bank data saved.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

addBankButton.addEventListener("click", () => {
    tableBody.appendChild(createBankRow());
});

saveBanksButton.addEventListener("click", saveBanks);

loadBanks();
