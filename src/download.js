'use strict';

const fs = require('fs');
const net = require('net');
const tracker = require('./tracker');
const message = require('./message');
const Pieces = require('./pieces');
const Queue = require('./queue');

module.exports = (torrent, path) => {
    tracker.getPeers(torrent, peers => {
        const pieces = new Pieces(torrent);
        const file = fs.openSync(path, 'w');

        // Start downloading from each peer with reconnect handling
        peers.forEach(peer => {
            download(peer, torrent, pieces, file);
        });
    });
};

function download(peer, torrent, pieces, file) {
    const socket = new net.Socket();

    // Handle socket errors
    socket.on('error', (err) => {
        console.error(`Socket error with peer ${peer.ip}:${peer.port}:`, err.message);
        // Attempt to reconnect or handle errors here as needed
    });

    // Connect to the peer and initiate handshake
    socket.connect(peer.port, peer.ip, () => {
        console.log(`Connected to peer: ${peer.ip}:${peer.port}`);
        socket.write(message.buildHandshake(torrent));
    });

    const queue = new Queue(torrent);
    // Listen for complete messages from the peer
    onWholeMsg(socket, msg => msgHandler(msg, socket, pieces, queue, torrent, file));
}

function onWholeMsg(socket, callback) {
    let savedBuf = Buffer.alloc(0);
    let handshake = true;

    socket.on('data', recvBuf => {
        const msgLen = () => handshake ? savedBuf.readUInt8(0) + 49 : savedBuf.readInt32BE(0) + 4;
        savedBuf = Buffer.concat([savedBuf, recvBuf]);

        // Process all complete messages in the buffer
        while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
            callback(savedBuf.slice(0, msgLen()));
            savedBuf = savedBuf.slice(msgLen());
            handshake = false; // After the first message, the handshake is complete
        }
    });
}

function msgHandler(msg, socket, pieces, queue, torrent, file) {
    if (isHandshake(msg)) {
        // Respond to handshake with interested message
        console.log('Handshake successful, sending interested message.');
        socket.write(message.buildInterested());
    } else {
        const m = message.parse(msg);
        console.log('Received message:', m);

        // Handle different message types
        switch (m.id) {
            case 0: // choke
                chokeHandler(socket);
                break;
            case 1: // unchoke
                unchokeHandler(socket, pieces, queue);
                break;
            case 4: // have
                haveHandler(socket, pieces, queue, m.payload);
                break;
            case 5: // bitfield
                bitfieldHandler(socket, pieces, queue, m.payload);
                break;
            case 7: // piece
                pieceHandler(socket, pieces, queue, torrent, file, m.payload);
                break;
            default:
                console.warn('Unknown message ID:', m.id);
                break;
        }
    }
}

function isHandshake(msg) {
    return msg.length === msg.readUInt8(0) + 49 &&
           msg.toString('utf8', 1, 20) === 'BitTorrent protocol';
}

function chokeHandler(socket) {
    console.log('Choked by peer. Closing connection.');
    socket.end();
}

function unchokeHandler(socket, pieces, queue) {
    console.log('Unchoked by peer. We can now request pieces.');
    queue.choked = false;
    requestPiece(socket, pieces, queue);
}

function haveHandler(socket, pieces, queue, payload) {
    const pieceIndex = payload.readUInt32BE(0);
    console.log('Received HAVE for piece:', pieceIndex);
    queue.queue(pieceIndex); // Add the piece to the queue
    requestPiece(socket, pieces, queue);
}

function bitfieldHandler(socket, pieces, queue, payload) {
    console.log('Received bitfield message.');
    payload.forEach((byte, i) => {
        for (let j = 0; j < 8; j++) {
            if (byte & (1 << (7 - j))) {
                queue.queue(i * 8 + j);
                console.log('Queuing piece:', i * 8 + j);
            }
        }
    });
    requestPiece(socket, pieces, queue);
}

function pieceHandler(socket, pieces, queue, torrent, file, pieceResp) {
    console.log('Received piece:', pieceResp.index);
    pieces.printPercentDone();
    pieces.addReceived(pieceResp);

    const offset = pieceResp.index * torrent.info['piece length'] + pieceResp.begin;
    console.log(`Writing piece to file at offset: ${offset}`);

    fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, (err) => {
        if (err) {
            console.error('Error writing piece to file:', err);
        } else {
            console.log(`Piece ${pieceResp.index} written successfully.`);
        }
    });

    if (pieces.isDone()) {
        console.log('Download complete!');
        socket.end();
        try {
            fs.closeSync(file);
        } catch (e) {
            console.error('Error closing file:', e);
        }
    } else {
        requestPiece(socket, pieces, queue);
    }
}

function requestPiece(socket, pieces, queue) {
    if (queue.choked) {
        console.log('Cannot request pieces, we are choked.');
        return;
    }

    while (queue.length()) {
        const pieceBlock = queue.deque();
        if (pieces.needed(pieceBlock)) {
            console.log('Requesting piece:', pieceBlock);
            socket.write(message.buildRequest(pieceBlock));
            pieces.addRequested(pieceBlock);
            break;
        }
    }
}
