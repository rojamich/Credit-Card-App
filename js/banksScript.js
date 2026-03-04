const banksContainer = document.getElementById("banks-container");
const messageEl = document.getElementById("banks-message");
const addBankButton = document.getElementById("add-bank-button");
const saveBanksButton = document.getElementById("save-banks-button");
const exportBanksButton = document.getElementById("export-banks-button");
const exportBanksPublishButton = document.getElementById("export-banks-publish-button");
const importBanksButton = document.getElementById("import-banks-button");
const syncBanksButton = document.getElementById("sync-banks-button");
const importBanksFile = document.getElementById("import-banks-file");

const bankModal = document.getElementById("bank-editor-modal");
const bankForm = document.getElementById("bank-editor-form");
const bankFormErrors = document.getElementById("bank-editor-errors");
const bankLabelInput = document.getElementById("bank-label-input");
const bankKeyInput = document.getElementById("bank-key-input");
const bankTypeInput = document.getElementById("bank-type-input");
const bankValueInput = document.getElementById("bank-value-input");
const bankKeyManualCheckbox = document.getElementById("bank-key-manual-checkbox");
const closeBankEditorButton = document.getElementById("close-bank-editor-button");
const bankEditorTitle = document.getElementById("bank-editor-title");

const {
    BANKS_STORAGE_KEY: banksStorageKey,
    loadDataset: dsLoadDataset,
    writeLocalJson: dsWriteLocalJson,
    validateAndNormalizeBanks: dsValidateAndNormalizeBanks,
    normalizeBanksForRuntime: dsNormalizeBanksForRuntime,
    normalizeBankKey: dsNormalizeBankKey,
} = window.CCDataStore;

let banks = [];
let editingIndex = null;

function setMessage(text, isError) {
    messageEl.textContent = text;
    messageEl.className = `message ${isError ? "error" : "success"}`;
}

function setFormErrors(errors) {
    if (!errors || !errors.length) {
        bankFormErrors.textContent = "";
        return;
    }
    bankFormErrors.textContent = errors.map((error) => `- ${error}`).join("\n");
}

function createMetaLine(text) {
    const p = document.createElement("p");
    p.className = "entity-meta";
    p.textContent = text;
    return p;
}

function renderBanks() {
    banksContainer.innerHTML = "";

    if (!banks.length) {
        const empty = document.createElement("p");
        empty.className = "entity-meta";
        empty.textContent = "No banks yet. Add one to get started.";
        banksContainer.appendChild(empty);
        return;
    }

    banks.forEach((bank, index) => {
        const tile = document.createElement("article");
        tile.className = "entity-tile";

        const title = document.createElement("h3");
        title.className = "entity-title";
        title.textContent = bank.label;
        tile.appendChild(title);
        tile.appendChild(createMetaLine(`Key: ${bank.key}`));
        tile.appendChild(createMetaLine(`Type: ${bank.type}`));
        tile.appendChild(createMetaLine(`Multiplier: ${bank.value}`));

        const actions = document.createElement("div");
        actions.className = "tile-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.onclick = () => openBankEditor(index);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "Delete";
        deleteButton.onclick = () => {
            banks.splice(index, 1);
            renderBanks();
        };

        actions.appendChild(editButton);
        actions.appendChild(deleteButton);
        tile.appendChild(actions);
        banksContainer.appendChild(tile);
    });
}

function openBankEditor(index) {
    editingIndex = typeof index === "number" ? index : null;
    const bank = editingIndex === null ? { label: "", key: "", type: "Cash Back", value: 1 } : banks[editingIndex];

    bankEditorTitle.textContent = editingIndex === null ? "Add Bank" : "Edit Bank";
    bankLabelInput.value = bank.label || "";
    bankKeyInput.value = bank.key || "";
    bankTypeInput.value = bank.type || "Cash Back";
    bankValueInput.value = String(bank.value ?? 1);
    bankKeyManualCheckbox.checked = false;
    bankKeyInput.readOnly = true;
    setFormErrors([]);

    bankModal.classList.remove("hidden");
}

function closeBankEditor() {
    bankModal.classList.add("hidden");
    editingIndex = null;
    setFormErrors([]);
}

function collectBankFromForm() {
    return {
        label: bankLabelInput.value.trim(),
        key: bankKeyInput.value.trim(),
        type: bankTypeInput.value.trim(),
        value: bankValueInput.value,
    };
}

function upsertEditedBank() {
    const candidate = collectBankFromForm();
    const nextBanks = [...banks];
    if (editingIndex === null) nextBanks.push(candidate);
    else nextBanks[editingIndex] = candidate;

    const validation = dsValidateAndNormalizeBanks(nextBanks);
    if (!validation.ok) {
        setFormErrors(validation.errors);
        return false;
    }

    banks = validation.data;
    renderBanks();
    closeBankEditor();
    return true;
}

function validateCurrentBanks() {
    return dsValidateAndNormalizeBanks(banks);
}

function saveBanks() {
    const validation = validateCurrentBanks();
    if (!validation.ok) {
        setMessage(buildSaveBlockedMessage(validation.errors), true);
        return;
    }

    banks = validation.data;
    dsWriteLocalJson(banksStorageKey, banks);
    renderBanks();
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

function buildSaveBlockedMessage(errors) {
    return `Save blocked:\n${errors.map((e) => `- ${e}`).join("\n")}`;
}

function getBackupBanksFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `bankData-export-${stamp}.json`;
}

function exportBanks() {
    const validation = validateCurrentBanks();
    if (!validation.ok) {
        setMessage(buildSaveBlockedMessage(validation.errors), true);
        return;
    }
    downloadJson(getBackupBanksFilename(), validation.data);
    setMessage("Banks backup exported.", false);
}

function exportBanksForPublish() {
    const validation = validateCurrentBanks();
    if (!validation.ok) {
        setMessage(buildSaveBlockedMessage(validation.errors), true);
        return;
    }
    downloadJson("banks.json", validation.data);
    setMessage("Saved banks.json. Replace /database/banks.json in your repo with this file and commit.", false);
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
                setMessage(`Import blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
                return;
            }
            banks = validation.data;
            dsWriteLocalJson(banksStorageKey, banks);
            renderBanks();
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

    try {
        const response = await fetch(`./database/bankData.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not fetch online bank data.");
        const parsed = await response.json();
        const validation = dsValidateAndNormalizeBanks(parsed);
        if (!validation.ok) {
            setMessage(`Sync blocked:\n${validation.errors.map((e) => `- ${e}`).join("\n")}`, true);
            return;
        }
        banks = validation.data;
        dsWriteLocalJson(banksStorageKey, banks);
        renderBanks();
        setMessage("Banks synced from database JSON.", false);
    } catch (error) {
        setMessage(`Sync failed: ${error.message}`, true);
    }
}

async function loadBanks() {
    try {
        const raw = await dsLoadDataset(banksStorageKey, "./database/bankData.json");
        banks = dsNormalizeBanksForRuntime(raw);
        renderBanks();
        setMessage("Bank data loaded.", false);
    } catch (error) {
        setMessage(`Could not load bank data: ${error.message}`, true);
    }
}

bankKeyManualCheckbox.addEventListener("change", () => {
    const manual = bankKeyManualCheckbox.checked;
    bankKeyInput.readOnly = !manual;
    if (!manual) {
        bankKeyInput.value = dsNormalizeBankKey(bankLabelInput.value);
    }
});

bankLabelInput.addEventListener("input", () => {
    if (!bankKeyManualCheckbox.checked) {
        bankKeyInput.value = dsNormalizeBankKey(bankLabelInput.value);
    }
});

bankForm.addEventListener("submit", (event) => {
    event.preventDefault();
    upsertEditedBank();
});

closeBankEditorButton.addEventListener("click", closeBankEditor);
bankModal.addEventListener("click", (event) => {
    if (event.target === bankModal) closeBankEditor();
});

addBankButton.addEventListener("click", () => openBankEditor(null));
saveBanksButton.addEventListener("click", saveBanks);
exportBanksButton.addEventListener("click", exportBanks);
if (exportBanksPublishButton) {
    exportBanksPublishButton.addEventListener("click", exportBanksForPublish);
}
importBanksButton.addEventListener("click", () => importBanksFile.click());
importBanksFile.addEventListener("change", importBanksFromFile);
syncBanksButton.addEventListener("click", syncBanksFromSource);

loadBanks();
