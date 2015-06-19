'use strict';

var util = require('util');
var chainlib = require('../');
var log = chainlib.log;
var EventEmitter = require('events').EventEmitter;
var BitcoreP2P = require('bitcore-p2p');
var Pool = BitcoreP2P.Pool;
var Messages = BitcoreP2P.Messages;
var Inventory = BitcoreP2P.Inventory;
var bitcore = require('bitcore');
var _ = bitcore.deps._;
var BufferReader = bitcore.encoding.BufferReader;

function P2P(options) {
  var self = this;

  if(!options) {
    options = {};
  }

  this.messages = new Messages(options);
  this.pool = new Pool({
    network: options.network,
    addrs: options.addrs,
    messages: this.messages,
    dnsSeed: options.dnsSeed
  });
  this.db = options.db;
  this.chain = options.chain;
  this.noListen = _.isUndefined(options.noListen) ? P2P.NO_LISTEN : options.noListen;
  this.maxBlocks = options.maxBlocks || P2P.MAX_BLOCKS;
  this.staleTipAge = options.staleTipAge || P2P.STALE_TIP_AGE;
  this.lastBlockAge = options.lastBlockAge || P2P.LAST_BLOCK_AGE;
  this.syncInterval = options.syncInterval || P2P.SYNC_INTERVAL;
  this.ready = false;
  this.lastBlockReceived = 0;
  this.numBlocksDownloading = 0;
  this.synced = false;

  this.on('synced', function() {
    self.chain.lastSavedMetadataThreshold = 0;
    self.chain.saveMetadata();
  });
}

util.inherits(P2P, EventEmitter);

P2P.NO_LISTEN = false;
P2P.MAX_BLOCKS = 500;
P2P.STALE_TIP_AGE = 10 * 60 * 1000;
P2P.LAST_BLOCK_AGE = 5000;
P2P.SYNC_INTERVAL = 5000;

P2P.prototype.initialize = function() {
  var self = this;
  this.mempool = this.db.mempool;

  this.chain.lastSavedMetadataThreshold = 30000; // While syncing, only save metadata every 30 seconds

  this.chain.on('addblock', this._onChainAddBlock.bind(this));
  this.mempool.on('transaction', this._onMempoolTransaction.bind(this));
  this.pool.on('peerready', this._onPeerReady.bind(this));
  this.pool.on('peerinv', this._onPeerInv.bind(this));
  this.pool.on('peerblock', this._onPeerBlock.bind(this));
  this.pool.on('peertx', this._onPeerTx.bind(this));
  this.pool.on('peergetdata', this._onPeerGetData.bind(this));
  this.pool.on('peergetblocks', this._onPeerGetBlocks.bind(this));

  setImmediate(function() {
    self.pool.connect();
    if (!self.noListen) {
      self.pool.listen();
    }
  });

  this.emit('initialized');
};

P2P.prototype.sendMessage = function(message) {
  this.pool.sendMessage(message);
};

P2P.prototype._onPeerReady = function(peer) {
  log.info('Connected to peer', (peer.host + ':' + peer.port));

  if(!this.ready) {
    setInterval(this._sync.bind(this), this.syncInterval);
    this._sync(true);
    this.ready = true;
    this.emit('ready');
  }
};

P2P.prototype._onPeerInv = function(peer, message) {
  var self = this;

  log.debug('Received inv from ' + peer.host, message);

  var inventory = message.inventory;
  var numBlocks = 0;

  // check that we don't already have the data
  var filtered = inventory.filter(function(a) {
    if (a.type === Inventory.TYPE.TX) {
      return !self.mempool.hasTransaction(self._bufferToHash(a.hash));
    } else if (a.type === Inventory.TYPE.BLOCK) {
      numBlocks++;
      return !self.mempool.hasBlock(self._bufferToHash(a.hash));
    } else {
      return false;
    }
  });

  if (filtered.length) {
    this.numBlocksDownloading = numBlocks;
    var message = self.messages.GetData(filtered);
    peer.sendMessage(message);
  }
};

P2P.prototype._onPeerBlock = function(peer, message) {
  var self = this;

  var block = message.block;
  if(block && block.hash) {
    log.debug('Received block ' + block.hash + ' from ' + peer.host);
  } else {
    return log.debug('Received malformed block message from ' + peer.host, message);
  }

  self.lastBlockReceived = Date.now();
  self.numBlocksDownloading--;

  this.mempool.addBlock(block);
};

P2P.prototype._onPeerTx = function(peer, message) {
  var transaction = message.transaction;
  if(transaction && transaction.hash) {
    log.debug('Received transaction ' + transaction.hash + ' from ' + peer.host);
  } else {
    log.debug('Received malformed transaction message from ' + peer.host, message);
  }
  this.mempool.addTransaction(transaction, function(err) {
    if(err) {
      log.error('Transaction ' + transaction.hash + ' failed to validate: ' + err);
    }
  });
};

P2P.prototype._onPeerGetData = function(peer, message) {
  var self = this;

  log.debug('Received getdata from ' + peer.host, message);
  var inventory = message.inventory;

  inventory.forEach(function(item) {
    if(item.type === Inventory.TYPE.BLOCK) {
      self.db.getBlock(self._bufferToHash(item.hash), function(err, block) {
        if(err) {
          return self.emit('error', err);
        } else if(!block) {
          message = self.messages.NotFound.forBlock(item.hash);
          return peer.sendMessage(message);
        }

        var message = self.messages.Block(block);
        peer.sendMessage(message);
      });
    } else if(item.type === Inventory.TYPE.TX) {

      var message;

      self.db.getTransaction(self._bufferToHash(item.hash), true, function(err, tx) {
        if(err) {
          return self.emit('error', err);
        } else if(!tx) {
          message = self.messages.NotFound.forTransaction(item.hash);
          return peer.sendMessage(message);
        }

        message = self.messages.Transaction(tx);
        peer.sendMessage(message);
      });
    }
  });
};

P2P.prototype._onChainAddBlock = function(block) {
  var message = this.messages.Inventory.forBlock(block.hash);
  this.pool.sendMessage(message);
  if(!this.synced && !this.numBlocksDownloading && !this.chain.blockQueue.length) {
    // This must be the last block in the sync
    this.synced = true;
    this.emit('synced');
  }
};

P2P.prototype._onMempoolTransaction = function(transaction) {
  var message = this.messages.Inventory.forTransaction(transaction.hash);
  this.pool.sendMessage(message);
};

P2P.prototype._bufferToHash = function(buffer) {
  return BufferReader(buffer).readReverse().toString('hex');
};

P2P.prototype._hashToBuffer = function(hash) {
  var buffer = new Buffer(hash, 'hex');
  return BufferReader(buffer).readReverse();
};

P2P.prototype._sync = function(forceSync) {
  var self = this;

  if((self.chain.tip.timestamp.getTime() > (Date.now() - self.staleTipAge)) && !self.synced) {
    // Just emit synced immediately if the block is reasonably new
    self.synced = true;
    self.emit('synced');
  }

  // If forceSync, sync
  // If chain does not have anything in its queue and
  // chain tip is older than STALE_TIP_AGE and
  // last block received was greater than threshold
  // pick a random peer and sync
  if(forceSync ||
    (!self.chain.blockQueue.length &&
    self.chain.tip.timestamp.getTime() < Date.now() - self.staleTipAge &&
    self.lastBlockReceived < Date.now() - self.lastBlockAge)) {
    self.chain.getHashes(self.chain.tip.hash, function(err, hashes) {
      if(err) {
        return self.emit('error', err);
      }

      var peer = self._getRandomPeer();
      if(peer) {
        var getBlocksMessage = self._buildGetBlocksMessage(hashes);
        peer.sendMessage(getBlocksMessage);
      }

      if(!forceSync && !self.synced) {
        // We've already done the initial sync and no one gave us any blocks...
        // so we must be already synced
        self.synced = true;
        self.emit('synced');
      }
    });
  }
};

P2P.prototype._getRandomPeer = function() {
  var peerCount = Object.keys(this.pool._connectedPeers).length;
  if(!peerCount) {
    return null;
  }
  var key = Object.keys(this.pool._connectedPeers)[Math.floor(Math.random() * peerCount)];
  return this.pool._connectedPeers[key];
};

P2P.prototype._buildGetBlocksMessage = function(hashes) {
  // Based off of https://en.bitcoin.it/wiki/Protocol_documentation

  var filtered = [];
  // Push last 10 indices first
  var step = 1;
  var start = 0;

  for(var i = hashes.length - 1; i > 0; i -= step, ++start) {
    if(start >= 10) {
      step *= 2;
    }

    filtered.push(this._hashToBuffer(hashes[i]));
  }
  filtered.push(this._hashToBuffer(hashes[0]));

  var message = this.messages.GetBlocks({
    starts: filtered,
    stop: new Buffer(Array(32))
  });

  return message;
};

P2P.prototype._onPeerGetBlocks = function(peer, message, callback) {
  var self = this;

  log.debug('Received getblocks from ' + peer.host, message);

  if(!callback) {
    callback = function() {};
  }

  // See if they are on the main chain via the block locator
  // Figure out all the blocks they need
  // Respond with an inv message
  var locatorHashes = message.starts.map(this._bufferToHash);
  var stopHash = message.stop.readUInt32LE(0) === 0 ? null : this._bufferToHash(message.stop);

  self.chain.getHashes(self.chain.tip.hash, function(err, hashes) {
    if(err) {
      return self.emit('error', err);
    }

    var hashesDictionary = {};

    // Convert hashes to dictionary (this can probably be cached too)
    for(var i = 0; i < hashes.length; i++) {
      hashesDictionary[hashes[i]] = i;
    }

    // Find first common ancestor
    var commonAncestor;
    var startHeight = 0;

    for(var i = 0; i < locatorHashes.length; i++) {
      if(hashesDictionary.hasOwnProperty(locatorHashes[i])) {
        commonAncestor = locatorHashes[i];
        startHeight = hashesDictionary[locatorHashes[i]] + 1;
        break;
      }
    }

    if(!commonAncestor) {
      // If none of the hashes match start with the genesis block
      commonAncestor = self.chain.genesis.hash;
    }

    var inventory = [];

    // Add up to MAX_BLOCKS to an inventory message
    for(var i = startHeight; i < startHeight + self.maxBlocks; i++) {
      if(i >= hashes.length || hashes[i] === stopHash) {
        break;
      }
      inventory.push(Inventory.forBlock(hashes[i]));
    }

    // Send an inventory message if we have any blocks that they need
    if(inventory.length) {
      var message = self.messages.Inventory(inventory);
      peer.sendMessage(message);
    }

    callback();
  });
};

module.exports = P2P;
