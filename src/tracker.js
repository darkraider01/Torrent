'use strict';

const dgram = require('dgram');
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;
const crypto = require('crypto');
const torrentParser = require('./torrentparser');
const util = require('./util');

module.exports.getPeers = (torrent, callback) => {
    const socket = dgram.createSocket('udp4');
    const url = torrent.announce.toString('utf8');

    // 1. send connect request
    udpSend(socket, buildConnReq(), url);

    socket.on('message', response => {
        const responseType = respType(response);
        if (responseType === 'connect') {
            // 2. receive and parse connect response
            const connResp = parseConnResp(response);
            console.log(`Connected to tracker: ${url}`);
            // 3. send announce request
            const announceReq = buildAnnounceReq(connResp.connectionId, torrent);
            udpSend(socket, announceReq, url);
        } else if (responseType === 'announce') {
            // 4. parse announce response
            const announceResp = parseAnnounceResp(response);
            console.log(`Received announce response: ${JSON.stringify(announceResp)}`);
            // 5. pass peers to callback
            callback(announceResp.peers);
            socket.close(); // Close socket after receiving peers
        } else {
            console.warn('Unexpected response type:', responseType);
        }
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        callback([]); // Handle error and return empty peers
    });

    // Timeout handling in case of no response from tracker
    setTimeout(() => {
        console.warn('No response from tracker. Closing socket.');
        socket.close();
        callback([]);
    }, 5000); // 5 seconds timeout
};

function udpSend(socket, message, rawUrl, callback = () => {}) {
    const url = urlParse(rawUrl);
    socket.send(message, 0, message.length, url.port, url.hostname, (err) => {
        if (err) {
            console.error(`Error sending message to ${url.hostname}:${url.port}:`, err);
            callback(err);
        } else {
            callback();
        }
    });
}

function respType(resp) {
    const action = resp.readUInt32BE(0);
    if (action === 0) return 'connect';
    if (action === 1) return 'announce';
    return 'unknown'; // Add unknown case for better debugging
}

function buildConnReq() {
    const buf = Buffer.allocUnsafe(16);
    // connection id
    buf.writeUInt32BE(0x41727101980, 0);
    // action
    buf.writeUInt32BE(0, 8);
    // transaction id
    crypto.randomBytes(4).copy(buf, 12);
    return buf;
}

function parseConnResp(resp) {
    return {
        action: resp.readUInt32BE(0),
        transactionId: resp.readUInt32BE(4),
        connectionId: resp.slice(8)
    };
}

function buildAnnounceReq(connId, torrent, port = 6881) {
    const buf = Buffer.allocUnsafe(98);
    // connection id
    connId.copy(buf, 0);
    // action
    buf.writeUInt32BE(1, 8);
    // transaction id
    crypto.randomBytes(4).copy(buf, 12);
    // info hash
    torrentParser.infoHash(torrent).copy(buf, 16);
    // peerId
    util.genId().copy(buf, 36);
    // downloaded
    Buffer.alloc(8).copy(buf, 56);
    // left
    torrentParser.size(torrent).copy(buf, 64);
    // uploaded
    Buffer.alloc(8).copy(buf, 72);
    // event (0: none, 1: completed, 2: started, 3: stopped)
    buf.writeUInt32BE(0, 80);
    // ip address
    buf.writeUInt32BE(0, 84);
    // key
    crypto.randomBytes(4).copy(buf, 88);
    // num want (default -1 for all)
    buf.writeInt32BE(-1, 92);
    // port
    buf.writeUInt16BE(port, 96);
    return buf;
}

function parseAnnounceResp(resp) {
    function group(iterable, groupSize) {
        let groups = [];
        for (let i = 0; i < iterable.length; i += groupSize) {
            groups.push(iterable.slice(i, i + groupSize));
        }
        return groups;
    }

    return {
        action: resp.readUInt32BE(0),
        transactionId: resp.readUInt32BE(4),
        leechers: resp.readUInt32BE(8),
        seeders: resp.readUInt32BE(12),
        peers: group(resp.slice(20), 6).map(address => {
            return {
                ip: `${address.readUInt8(0)}.${address.readUInt8(1)}.${address.readUInt8(2)}.${address.readUInt8(3)}`,
                port: address.readUInt16BE(4)
            };
        })
    };
}
