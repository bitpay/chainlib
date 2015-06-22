'use strict';

var async = require('async');
var chainlib = require('../');
var log = chainlib.log;
var errors = chainlib.errors;
var bitcore = require('bitcore');
var $ = bitcore.util.preconditions;
var BN = bitcore.crypto.BN;
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Builder = require('./builder');
var Block = require('./block');
var Reorg = require('./reorg');
var utils = require('./utils');
var levelup = require('levelup');

var MAX_STACK_DEPTH = 1000;

function Chain(opts) {
  var self = this;
  if(!opts) {
    opts = {};
  }

  this.db = opts.db;
  this.p2p = opts.p2p;
  
  this.genesis = opts.genesis;
  this.genesisOptions = opts.genesisOptions;
  this.tip = null;
  this.tipWeight = null;
  this.overrideTip = opts.overrideTip;
  this.cache = {
    hashes: {}, // dictionary of hash -> prevHash
    chainHashes: {},
    weights: {} // dictionary of hash -> baseWeight
  };
  this.lastSavedMetadata = null;
  this.lastSavedMetadataThreshold = 0; // Set this during syncing for faster performance
  this.blockQueue = [];
  this.processingBlockQueue = false;
  this.builder = opts.builder || false;
  this.ready = false;

  this.on('initialized', function() {
    self.initialized = true;
  });

  this.on('initialized', this._onInitialized.bind(this));

  this.on('ready', function() {
    log.debug('Chain is ready');
    self.ready = true;
    self.startBuilder();
  });
}

util.inherits(Chain, EventEmitter);

Chain.prototype._onInitialized = function() {
  this.emit('ready');
};

Chain.prototype.initialize = function() {
  var self = this;

  if (!this.genesis) {
    self.genesis = self.buildGenesisBlock(this.genesisOptions);
  }

  var merkleError = self._validateMerkleRoot(self.genesis);
  if (merkleError) {
    throw merkleError;
  }

  // Add mempool block listener
  self.db.mempool.on('block', self._onMempoolBlock.bind(self));

  // Does our database already have a tip?
  self.db.getMetadata(function getMetadataCallback(err, metadata) {
    if(err) {
      return self.emit('error', err);
    } else if(!metadata || !metadata.tip) {
      self.tip = self.genesis;
      self.tip.__height = 0;
      self.tipWeight = new BN(0, 10);
      self.db.putBlock(self.genesis, function putBlockCallback(err) {
        if(err) {
          return self.emit('error', err);
        }
        self.db._onChainAddBlock(self.genesis, function(err) {
          if(err) {
            return self.emit('error', err);
          }

          self.emit('addblock', self.genesis);
          self.saveMetadata();
          self.emit('initialized');
        });
      });
    } else {
      metadata.tip = self.overrideTip || metadata.tip;
      self.db.getBlock(metadata.tip, function getBlockCallback(err, tip) {
        if(err) {
          return self.emit('error', err);
        }

        self.tip = tip;
        self.tipWeight = new BN(metadata.tipWeight, 10);
        self.cache = metadata.cache;
        self.getHeightForBlock(self.tip.hash, function(err, height) {
          if(err) {
            return self.emit('error', err);
          }

          self.tip.__height = height;
          self.emit('initialized');
        });
      });
    }
  });
};

Chain.prototype.startBuilder = function() {
  if (this.builder) {
    this.builder = new Builder({db: this.db, chain: this});
    this.builder.start();
  }
};

Chain.prototype.buildGenesisBlock = function buildGenesisBlock(options) {
  if (!options) {
    options = {};
  }
  var genesis = new Block({
    prevHash: null,
    height: 0,
    timestamp: options.timestamp || new Date()
  });
  var data = this.db.buildGenesisData();
  genesis.merkleRoot = data.merkleRoot;
  genesis.data = data.buffer;
  return genesis;
};

Chain.prototype.addBlock = function addBlock(block, callback) {
  this.blockQueue.push([block, callback]);
  this._processBlockQueue();
};

Chain.prototype._processBlockQueue = function() {
  var self = this;

  if(self.processingBlockQueue) {
    return;
  }

  self.processingBlockQueue = true;

  async.doWhilst(
    function(next) {
      var item = self.blockQueue.shift();
      log.debug('Processing block', item[0].hash);
      self._processBlock(item[0], function(err) {
        item[1].call(self, err);
        next();
      });
    }, function() {
      return self.blockQueue.length;
    }, function() {
      self.processingBlockQueue = false;
    }
  );
};

Chain.prototype._validateMerkleRoot = function(block) {
  var transactions = this.db.getTransactionsFromBlock(block);
  var merkleRoot = this.db.getMerkleRoot(transactions);
  if (!merkleRoot || block.merkleRoot === merkleRoot) {
    return;
  }
  return new Error(
    'Invalid merkleRoot for block, expected merkleRoot to equal: ' + merkleRoot +
      ' instead got: ' + block.merkleRoot
  );
};

Chain.prototype._checkExisting = function(block, callback) {
  this.db.getBlock(block.hash, function(err) {
    if (err instanceof levelup.errors.NotFoundError) {
      callback();
    } else if (err) {
      callback(err);
    } else {
      return callback(
        new errors.Consensus.BlockExists('Block ' + block.hash + ' already exists')
      );
    }
  });
};

Chain.prototype._validateBlock = function(block, callback) {
  log.debug('Chain is validating block: ' + block.hash);
  block.validate(this, callback);
};

Chain.prototype._writeBlock = function(block, callback) {
  log.debug('Chain is putting block to db:' + block.hash);
  // Update hashes
  this.cache.hashes[block.hash] = block.prevHash;
  // Write to db
  this.db.putBlock(block, callback);
};

Chain.prototype._updateWeightCache = function(block, callback) {
  var self = this;

  // Update weights
  self.getBlockWeight(block.hash, function(err, weight) {
    if(err) {
      log.warn('Could not update weight cache for block ' + block.hash + ': ', err);
      return callback();
    }

    self.cache.weights[block.hash] = weight;
    callback();
  });
};

Chain.prototype._updateTip = function(block, callback) {
  log.debug('Chain updating the tip for: ' + block.hash);
  var self = this;
  $.checkState(utils.isHash(block.hash));

  self.getWeight(block.hash, function getWeightCallback(err, weight) {
    /* jshint maxstatements: 16 */
    if (err) {
      return callback(err);
    }
    log.debug('Chain calculated weight as ' + weight.toString('hex'));

    if (weight.cmp(self.tipWeight) === 1) {
      // Handle reorg if necessary
      if (block.prevHash !== self.tip.hash) {
        log.debug('Chain is starting reorg');
        var reorg = new Reorg(self, block, self.tip, weight);
        reorg.go(callback);
      } else {
        // Populate height
        block.__height = self.tip.__height + 1;
        async.series(
          [
            self._validateBlock.bind(self, block),
            self.db._onChainAddBlock.bind(self.db, block)
          ],
          function(err) {
            if(err) {
              return callback(err);
            }

            self.tip = block;
            self.tipWeight = weight;
            log.debug('Saving metadata');
            self.saveMetadata();
            log.debug('Chain added block to main chain');
            self.emit('addblock', block);
            callback();
          }
        );
      }
    } else {
      log.debug('Chain added block to forked chain');
      self.emit('forkblock', block);
      callback();
    }
  });
};

Chain.prototype._processBlock = function(block, callback) {

  var merkleError = this._validateMerkleRoot(block);
  if (merkleError) {
    return callback(merkleError);
  }

  async.series(
    [
      this._checkExisting.bind(this, block),
      this._writeBlock.bind(this, block),
      this._updateWeightCache.bind(this, block),
      this._updateTip.bind(this, block)
    ],
    callback
  );
};

/**
 * Will get an array of hashes all the way to the genesis block for
 * the chain based on "block hash" as the tip.
 *
 * @param {String} block hash - a block hash
 * @param {Function} callback - A function that accepts: Error and Array of hashes
 */
Chain.prototype.getHashes = function getHashes(tipHash, callback) {
  var self = this;

  $.checkArgument(utils.isHash(tipHash));

  var hashes = [];
  var depth = 0;

  getHashAndContinue(null, tipHash);

  function getHashAndContinue(err, hash) {
    if (err) {
      return callback(err);
    }

    depth++;

    hashes.unshift(hash);

    if (hash === self.genesis.hash) {
      // Stop at the genesis block
      self.cache.chainHashes[tipHash] = hashes;
      callback(null, hashes);
    } else if(self.cache.chainHashes[hash]) {
      hashes.shift();
      hashes = self.cache.chainHashes[hash].concat(hashes);
      delete self.cache.chainHashes[hash];
      self.cache.chainHashes[tipHash] = hashes;
      callback(null, hashes);
    } else {
      // Continue with the previous hash
      // check cache first
      var prevHash = self.cache.hashes[hash];
      if(prevHash) {
        // Don't let the stack get too deep. Otherwise we will crash.
        if(depth >= MAX_STACK_DEPTH) {
          depth = 0;
          return setImmediate(function() {
            getHashAndContinue(null, prevHash);
          });
        } else {
          return getHashAndContinue(null, prevHash);
        }
      } else {
        // do a db call if we don't have it
        self.db.getPrevHash(hash, function(err, prevHash) {
          if(err) {
            return callback(err);
          }

          return getHashAndContinue(null, prevHash);
        });
      }
    }
  }

};

/**
 * Will get the total weight for a chain from the "block" as the
 * tip of the chain.
 *
 * @param {String} blockHash - The hash of the block
 * @param {Function} callback - A function that accepts: Error and Number
 */
Chain.prototype.getWeight = function getWeight(blockHash, callback) {
  var self = this;

  $.checkArgument(utils.isHash(blockHash));

  if(self.cache.hashes[blockHash] === self.tip.hash) {
    self.getBlockWeight(blockHash, function(err, weight) {
      if(err) {
        return callback(err);
      }

      callback(null, self.tipWeight.add(weight));
    });
    return;
  }

  self.getHashes(blockHash, getHashesCallback);

  function getHashesCallback(err, hashes) {
    if (err) {
      return callback(err);
    }
    async.map(hashes, mapGetWeight, mapCallback);
  }

  function mapGetWeight(hash, mapGetWeightCallback) {
    self.getBlockWeight(hash, mapGetWeightCallback);
  }

  function mapCallback(err, weights) {
    if (err) {
      return callback(err);
    }
    callback(null, weights.reduce(sumWeight));
  }

  function sumWeight(a, b) {
    return a.add(b);
  }
};

Chain.prototype.getBlockWeight = function getBlockWeight(block, callback) {
  return callback(null, new BN(1, 10));
};

Chain.prototype.getBlockAtHeight = function getBlockAtHeight(block, height, callback) {

  var self = this;
  $.checkState(utils.isHash(block.hash));

  self.getHashes(block.hash, function(err, hashes) {
    if (err) {
      return callback(err);
    }
    var hash = hashes[height];
    if (hash) {
      self.db.getBlock(hash, function(err, block) {
        if (err) {
          return callback(err);
        }
        callback(null, block);
      });
    } else {
      callback(new Error('Height out of range of chain'));
    }
  });

};

Chain.prototype.getHeightForBlock = function getHeightForBlock(blockHash, callback) {
  var self = this;

  self.getHashes(blockHash, function(err, hashes) {
    if (err) {
      return callback(err);
    }

    callback(null, hashes.length - 1);
  });
};

Chain.prototype.saveMetadata = function saveMetadata(callback) {
  var self = this;

  callback = callback || function() {};

  if(self.lastSavedMetadata && Date.now() < self.lastSavedMetadata.getTime() + self.lastSavedMetadataThreshold) {
    return callback();
  }

  var metadata = {
    tip: self.tip ? self.tip.hash : null,
    tipWeight: self.tipWeight ? self.tipWeight.toString(10) : 0,
    cache: self.cache
  };

  self.lastSavedMetadata = new Date();

  self.db.putMetadata(metadata, callback);
};

Chain.prototype._onMempoolBlock = function _onMempoolBlock(block) {
  // For basic consensus algorithm, add block to the chain immediately
  var self = this;
  this.addBlock(block, function(err) {
    if(err) {
      self.emit('error', err);
    }
  });
};

module.exports = Chain;
