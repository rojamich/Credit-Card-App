const fs = require("fs");
const path = require("path");

// Paths
const buildDir = path.join(__dirname, "build");
const staticDir = path.join(__dirname, "static");
const destStaticDir = path.join(buildDir, "static");

// Create the build directory if it doesn't exist
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir);
}

// Copy the "static" directory to the "build" directory
const copyFolderSync = (source, destination) => {
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

// Copy static folder
copyFolderSync(staticDir, destStaticDir);

console.log("Build directory created and static files copied successfully!");
