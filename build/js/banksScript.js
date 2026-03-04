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
    validateAndNormalizeBanks: dsValidateAndNormalizeBanks,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
} = window.CCDataStore;

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function createBankRow(bank = { key: "", label: "", type: "", value: 1 }) {
    const tr = document.createElement("tr");

    const keyTd = document.createElement("td");
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.dataset.field = "key";
    keyInput.value = bank.key || "";
    keyTd.appendChild(keyInput);

    const labelTd = document.createElement("td");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.dataset.field = "label";
    labelInput.value = bank.label || "";
    labelTd.appendChild(labelInput);

    const typeTd = document.createElement("td");
    const typeInput = document.createElement("input");
    typeInput.type = "text";
    typeInput.dataset.field = "type";
    typeInput.value = bank.type || "";
    typeTd.appendChild(typeInput);

    const valueTd = document.createElement("td");
    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.step = "0.01";
    valueInput.dataset.field = "value";
    valueInput.value = typeof bank.value === "number" && Number.isFinite(bank.value) ? String(bank.value) : "";
    valueTd.appendChild(valueInput);

    tr.appendChild(keyTd);
    tr.appendChild(labelTd);
    tr.appendChild(typeTd);
    tr.appendChild(valueTd);
    return tr;
}

function renderBanks(banks) {
    tableBody.innerHTML = "";
    banks.forEach((bank) => tableBody.appendChild(createBankRow(bank)));
}

function collectBanksFromTableRaw() {
    const rows = tableBody.querySelectorAll("tr");
    return Array.from(rows).map((row) => ({
        key: row.querySelector('[data-field="key"]').value,
        label: row.querySelector('[data-field="label"]').value,
        type: row.querySelector('[data-field="type"]').value,
        value: row.querySelector('[data-field="value"]').value,
    }));
}

function formatErrors(prefix, errors) {
    return `${prefix}\n${errors.map((error) => `- ${error}`).join("\n")}`;
}

function validateFromTable() {
    const rawPayload = collectBanksFromTableRaw();
    return dsValidateAndNormalizeBanks(rawPayload);
}

async function loadBanks() {
    setMessage("Loading bank data...", false);
    try {
        const rawBanks = await dsLoadDataset(banksStorageKey, "./database/bankData.json");
        const banks = dsNormalizeBanksForRuntime(rawBanks);
        renderBanks(banks);
        setMessage("Bank data loaded from device storage.", false);
    } catch (error) {
        setMessage(`Could not load bank data: ${error.message}`, true);
    }
}

function saveBanks() {
    const validation = validateFromTable();
    if (!validation.ok) {
        setMessage(formatErrors("Save blocked. Fix these bank rows:", validation.errors), true);
        return;
    }

    dsWriteLocalJson(banksStorageKey, validation.data);
    renderBanks(validation.data);
    setMessage("Bank data saved locally on this device.", false);
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
    const validation = validateFromTable();
    if (!validation.ok) {
        setMessage(formatErrors("Export blocked. Fix these bank rows:", validation.errors), true);
        return;
    }

    downloadJson("bankData-export.json", validation.data);
    setMessage("Banks exported.", false);
}

function importBanksFromFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const validation = dsValidateAndNormalizeBanks(parsed);
            if (!validation.ok) {
                setMessage(formatErrors("Import blocked. Fix these bank rows:", validation.errors), true);
                return;
            }

            dsWriteLocalJson(banksStorageKey, validation.data);
            renderBanks(validation.data);
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
        const parsed = await response.json();
        const validation = dsValidateAndNormalizeBanks(parsed);
        if (!validation.ok) {
            setMessage(formatErrors("Sync blocked. Source bank data is invalid:", validation.errors), true);
            return;
        }

        dsWriteLocalJson(banksStorageKey, validation.data);
        renderBanks(validation.data);
        setMessage("Banks synced from online source and saved locally.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

addBankButton.addEventListener("click", () => {
    tableBody.appendChild(createBankRow({ key: "", label: "", type: "", value: 1 }));
});

saveBanksButton.addEventListener("click", saveBanks);
exportBanksButton.addEventListener("click", exportBanks);
importBanksButton.addEventListener("click", () => importBanksFile.click());
importBanksFile.addEventListener("change", importBanksFromFile);
syncBanksButton.addEventListener("click", syncBanksFromSource);

loadBanks();
