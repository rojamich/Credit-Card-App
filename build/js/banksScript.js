const tableBody = document.getElementById("banks-table-body");
const messageEl = document.getElementById("banks-message");
const addBankButton = document.getElementById("add-bank-button");
const saveBanksButton = document.getElementById("save-banks-button");
const exportBanksButton = document.getElementById("export-banks-button");
const importBanksButton = document.getElementById("import-banks-button");
const syncBanksButton = document.getElementById("sync-banks-button");
const importBanksFile = document.getElementById("import-banks-file");
const {
    BANKS_STORAGE_KEY: banksStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
} = window.CCDataStore;

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
        const banks = await dsLoadDataset(banksStorageKey, "./database/bankData.json");

        tableBody.innerHTML = "";
        banks.forEach((bank) => tableBody.appendChild(createBankRow(bank)));
        setMessage("Bank data loaded from device storage.", false);
    } catch (error) {
        setMessage(`Could not load bank data: ${error.message}`, true);
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

function isValidBanksPayload(payload) {
    if (!Array.isArray(payload)) return false;
    return payload.every((bank) =>
        bank &&
        typeof bank === "object" &&
        typeof bank.name === "string" &&
        typeof bank.type === "string" &&
        typeof bank.value === "number" &&
        Number.isFinite(bank.value)
    );
}

function saveBanks() {
    try {
        const payload = collectBanksFromTable();
        dsWriteLocalJson(banksStorageKey, payload);
        setMessage("Bank data saved locally on this device.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportBanks() {
    try {
        const payload = collectBanksFromTable();
        downloadJson("bankData-export.json", payload);
        setMessage("Banks exported.", false);
    } catch (error) {
        setMessage(error.message, true);
    }
}

function importBanksFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!isValidBanksPayload(parsed)) {
                throw new Error("Invalid banks JSON format.");
            }

            dsWriteLocalJson(banksStorageKey, parsed);
            tableBody.innerHTML = "";
            parsed.forEach((bank) => tableBody.appendChild(createBankRow(bank)));
            setMessage("Banks imported and saved locally.", false);
        } catch (error) {
            setMessage(`Import failed: ${error.message}`, true);
        } finally {
            importBanksFile.value = "";
        }
    };
    reader.readAsText(file);
}

async function syncBanksFromSource() {
    if (!navigator.onLine) {
        setMessage("Offline: cannot sync from online source.", true);
        return;
    }

    setMessage("Syncing banks from online source...", false);
    try {
        const response = await fetch(`./database/bankData.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not fetch online bank data.");
        const banks = await response.json();
        if (!isValidBanksPayload(banks)) throw new Error("Online bank data format is invalid.");

        dsWriteLocalJson(banksStorageKey, banks);
        tableBody.innerHTML = "";
        banks.forEach((bank) => tableBody.appendChild(createBankRow(bank)));
        setMessage("Banks synced from online source and saved locally.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

addBankButton.addEventListener("click", () => {
    tableBody.appendChild(createBankRow());
});

saveBanksButton.addEventListener("click", saveBanks);
exportBanksButton.addEventListener("click", exportBanks);
importBanksButton.addEventListener("click", () => importBanksFile.click());
importBanksFile.addEventListener("change", importBanksFromFile);
syncBanksButton.addEventListener("click", syncBanksFromSource);

loadBanks();
