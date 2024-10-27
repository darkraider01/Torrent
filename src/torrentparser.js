'use strict';

const fs = require('fs');
const bencode = require('bencode');
const crypto = require('crypto');
const BN = require('bn.js'); // Using bn.js to handle large numbers

// Function to open and decode the torrent file
const openTorrent = (filepath) => {
    try {
        console.log("Reading torrent file...");

        // Read the torrent file
        const fileContent = fs.readFileSync(filepath);
        console.log("Torrent file read successfully, size:", fileContent.length, "bytes");
        
        console.log("Decoding torrent...");
        const decoded = bencode.decode(fileContent);

        // Log the decoded content for debugging purposes
        console.log("Decoded torrent content:", JSON.stringify(decoded, null, 2));

        // Validate the decoded data
        if (!decoded || !decoded.info) {
            throw new Error("Invalid torrent file structure: 'info' property missing.");
        }

        // Log the info object for debugging
        console.log("Info object:", JSON.stringify(decoded.info, null, 2));

        // Validate and convert large numbers
        if (decoded.info.length) {
            const length = new BN(decoded.info.length);
            console.log("File length (in bytes):", length.toString());
            // Check if the length exceeds the maximum allowable size
            if (length.gt(new BN(2).pow(new BN(32)).sub(new BN(1)))) {
                throw new Error("File length exceeds the maximum allowable size (4 GB).");
            }
        } else {
            console.warn("Length property is missing from the torrent info.");
        }

        // Check if piece length is valid
        if (decoded.info['piece length']) {
            const pieceLength = new BN(decoded.info['piece length']);
            console.log("Piece length (in bytes):", pieceLength.toString());
            if (pieceLength.gt(new BN(2).pow(new BN(32)).sub(new BN(1)))) {
                throw new Error("Piece length exceeds the maximum allowable size (4 GB).");
            }
        } else {
            console.warn("Piece length is missing from the torrent info.");
        }

        // Log the pieces buffer for debugging
        if (decoded.info.pieces) {
            console.log("Pieces buffer length:", decoded.info.pieces.length);
            const numberOfPieces = decoded.info.pieces.length / 20; // Each piece hash is 20 bytes
            console.log("Total number of pieces:", numberOfPieces);
        } else {
            console.warn("Pieces are missing from the torrent info.");
        }

        return decoded;
    } catch (error) {
        console.error("Error reading or decoding torrent file:", error.message);
        throw error; // Rethrow the error for further handling
    }
};

// Function to compute the info hash
const computeInfoHash = (torrent) => {
    if (!torrent.info) {
        throw new Error("No info property found in the torrent data.");
    }

    const info = bencode.encode(torrent.info);
    const infoHash = crypto.createHash('sha1').update(info).digest();

    console.log("Computed info hash:", infoHash.toString('hex')); // Log the computed info hash
    return infoHash; // Return the computed info hash
};

// Exporting the functions
module.exports = {
    openTorrent,
    computeInfoHash,
};
