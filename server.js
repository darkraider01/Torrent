const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/', // Directory where files will be stored
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB (optional)
});

// Enable CORS
app.use(cors());

// Endpoint to handle file uploads
app.post('/upload', upload.single('torrent'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    console.log('Torrent file uploaded:', req.file);
    // Process the torrent file here (e.g., start download)

    res.json({ message: 'Torrent file uploaded successfully', file: req.file });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
