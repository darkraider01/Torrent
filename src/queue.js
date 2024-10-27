'use strict';

const tp = require('./torrentparser');

module.exports = class {
    constructor(torrent) {
        this._torrent = torrent;
        this._queue = [];
        this.choked = true;
    }

    queue(pieceIndex) {
        // Validate the piece index
        if (pieceIndex < 0 || pieceIndex >= tp.totalPieces(this._torrent)) {
            console.error(`Invalid piece index: ${pieceIndex}`);
            return;
        }

        const nBlocks = tp.blocksPerPiece(this._torrent, pieceIndex);
        console.log(`Queueing piece index: ${pieceIndex} with ${nBlocks} blocks.`);

        for (let i = 0; i < nBlocks; i++) {
            const pieceBlock = {
                index: pieceIndex,
                begin: i * tp.BLOCK_LEN,
                length: tp.blockLen(this._torrent, pieceIndex, i)
            };
            this._queue.push(pieceBlock);
            console.log(`Added block to queue:`, pieceBlock);
        }
    }

    deque() {
        const block = this._queue.shift();
        if (block) {
            console.log(`Dequeued block:`, block);
        } else {
            console.warn('Attempted to dequeue from an empty queue.');
        }
        return block;
    }

    peek() { 
        return this._queue[0]; 
    }

    length() { 
        return this._queue.length; 
    }
};
