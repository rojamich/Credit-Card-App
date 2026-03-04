if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {
            // Non-fatal: app still works online without SW.
        });
    });
}
