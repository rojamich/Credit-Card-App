// Setup
const fs = require("fs");
const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log("== New Request");
    console.log(" -- URL:", req.url);
    console.log(" -- Body:", req.body);
    console.log("----------------------------------------------------");
    next();
});

/*----------------------------------------------------------------
Routes
----------------------------------------------------------------*/

// Serve wallet page for root
app.get("/", (req, res) => {
    res.status(200).sendFile(path.join(__dirname, "/index.html"));
});

// Serve a dummy favicon to avoid 404
app.get("/favicon.ico", (req, res) => {
    res.status(204).end(); // No content response
});

// Catch-all route for undefined paths
app.get("*", (req, res) => {
    res.status(404).sendFile(path.join(__dirname, "404.html"));
});

// Start the server
const server = app.listen(port, () => {
    console.log(`Card Optimizer listening on port ${port}!`);
});
