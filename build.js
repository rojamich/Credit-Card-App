const fs = require("fs");
const path = require("path");

// Paths
const buildDir = path.join(__dirname, "build");
const assetDirs = ["styles", "js", "database", "logo"];
const rootFiles = ["index.html", "404.html", "banks.html", "cards.html", "offers.html", "manifest.json", "sw.js", "favicon.ico"];

// Recreate build directory to avoid stale/duplicated output
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });

// Copy a source folder recursively to destination
const copyFolderSync = (source, destination) => {
    if (!fs.existsSync(source)) return;

    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    fs.readdirSync(source).forEach((item) => {
        const srcPath = path.join(source, item);
        const destPath = path.join(destination, item);

        if (fs.lstatSync(srcPath).isDirectory()) {
            copyFolderSync(srcPath, destPath); // Recursively copy directories
        } else {
            fs.copyFileSync(srcPath, destPath); // Copy files
        }
    });
};

// Copy source asset directories
assetDirs.forEach((dir) => {
    const source = path.join(__dirname, dir);
    const destination = path.join(buildDir, dir);
    copyFolderSync(source, destination);
});

// Copy top-level HTML files
rootFiles.forEach((file) => {
    const source = path.join(__dirname, file);
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(buildDir, file));
    }
});

console.log("Build output generated successfully.");
