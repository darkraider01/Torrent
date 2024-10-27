'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const download = require('./src/download');
const torrentParser = require('./src/torrentparser');

// Check if a file path is provided
const torrentPath = process.argv[2];

// Create the main application window
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // Set to true for better security in production
        }
    });

    win.loadFile(path.join(__dirname, 'index.html')); // Load the GUI layout
}

// App ready event
app.whenReady().then(() => {
    createWindow();

    // Check if a torrent file path was provided through the command line
    if (!torrentPath) {
        console.error('Error: Please provide a torrent file path as an argument.');
        process.exit(1); // Exit if no file path is provided
    }

    try {
        // Open and parse the torrent file using the openTorrent function
        const torrent = torrentParser.openTorrent(torrentPath);
        console.log('Torrent file parsed successfully.');

        // Start the download process
        download(torrent, torrent.info.name.toString()); // Ensure name is a string
        console.log(`Download started for: ${torrent.info.name.toString()}`);
    } catch (error) {
        console.error('Error reading or decoding torrent file:', error.message);
    }
});

// Handle window all closed event
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit(); // Quit the app when all windows are closed (except on macOS)
    }
});

// Handle app activation (macOS)
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(); // Create a new window if none are open
    }
});
