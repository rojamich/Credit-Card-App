async function serviceWorkerScriptExists() {
    try {
        const headResponse = await fetch("./sw.js", { method: "HEAD", cache: "no-store" });
        if (headResponse.ok) return true;
        if (headResponse.status === 404) return false;
    } catch (error) {
        // Some static hosts may block HEAD. Fall through to GET.
    }

    try {
        const getResponse = await fetch("./sw.js", { method: "GET", cache: "no-store" });
        return getResponse.ok;
    } catch (error) {
        return false;
    }
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        const swExists = await serviceWorkerScriptExists();
        if (!swExists) {
            console.info("Service worker skipped: ./sw.js not found.");
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register("./sw.js");
            console.info("Service worker registered:", registration.scope);
        } catch (error) {
            console.warn("Service worker registration failed:", error);
        }
    });
}
