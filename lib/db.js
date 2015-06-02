'use strict';

var async = require('async');
var crypto = require('crypto');
var MemPool = require('./mempool');
var levelup = require('levelup');
var Transaction = require('./transaction');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var jsondiffpatch = require('jsondiffpatch');
var bitcore = require('bitcore');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var chainlib = require('./');
var log = chainlib.log;
var levelup = require('levelup');
var leveldown = require('leveldown');
var utils = require('./utils');
var $ = bitcore.util.preconditions;

function DB(options) {

  if(!options) {
    options = {};
  }

  this.coinbaseAmount = options.coinbaseAmount || 50 * 1e8;

  var levelupStore = leveldown;

  if(options.store) {
    levelupStore = options.store;
  } else if(!options.path) {
    throw new Error('Please include database path in options');
  }

  this.store = levelup(options.path, { db: levelupStore });
  this.chain = options.chain;
  this.Block = options.Block || require('./block');
  this.txPrefix = options.txPrefix || DB.PREFIXES.TX;
  this.prevHashPrefix = options.prevHashPrefix || DB.PREFIXES.PREV_HASH;
  this.blockPrefix = options.blockPrefix || DB.PREFIXES.BLOCK;
  this.dataPrefix = options.dataPrefix || DB.PREFIXES.DATA;
  this.mempool = new MemPool({db: this});
  this.Transaction = Transaction;
}

DB.PREFIXES = {
  TX: 'tx',
  PREV_HASH: 'ph',
  BLOCK: 'blk',
  DATA: 'data'
};

util.inherits(DB, EventEmitter);

DB.prototype.initialize = function() {
  this.emit('ready');
};

DB.prototype.put = function(key, value, callback) {
  var self = this;

  // Get the diff
  self.getDiff(key, value, function(err, diff) {
    if(err) {
      return callback(err);
    }

    var transaction = new self.Transaction();
    transaction.addDiff(key, diff);

    // Add to mempool
    self.mempool.addTransaction(transaction, function(err) {
      if(err) {
        return callback(err);
      }
      callback(null, transaction.hash);
    });
  });
};

DB.prototype.get = function(key, callback) {
  this.store.get([this.dataPrefix, key].join('-'), {}, callback);
};

DB.prototype.getAPIMethods = function() {
  return [
    ['get', this, this.get, 2],
    ['put', this, this.put, 1]
  ];
};

DB.prototype.getDiff = function(key, value, callback) {
  var self = this;

  self.get(key, function(err, oldValue) {
    if(err && !(err instanceof levelup.errors.NotFoundError)) {
      return callback(err);
    }

    var diff;
    try {
      var oldValueObject = JSON.parse(oldValue);
      var valueObject = JSON.parse(value);
      diff = jsondiffpatch.diff(oldValueObject, valueObject);
    } catch(e) {
      diff = jsondiffpatch.diff(oldValue, value);
    }

    callback(null, diff);
  });
};

/**
 * Saves a block to the database
 * @param {Block} block - The block to be saved
 * @param {Function} callback - A function that accepts: Error
 */
DB.prototype.putBlock = function(block, callback) {
  var self = this;

  var options = {
    valueEncoding: 'hex'
  };
  var key = [this.blockPrefix, block.hash].join('-');
  this.store.put(key, block.toBuffer(), options, function(err) {
    if(err) {
      return callback(err);
    }

    // Update prevHash index
    // We actually need to do this in putBlock rather than _onChainAddBlock
    // because we need this index to get this block's weight
    // before _onChainAddBlock is called
    self._updatePrevHashIndex(block, callback);
  });
};

/**
 * Retrieves a block from the database
 * @param {String} hash - The hash of the block to fetch
 * @param {Function} callback - A function that accepts: Error and Block
 */
DB.prototype.getBlock = function(hash, callback) {
  var self = this;
  var options = {
    valueEncoding: 'hex'
  };
  var key = [this.blockPrefix, hash].join('-');
  self.store.get(key, options, function(err, blockData) {
    if(err) {
      return callback(err);
    }

    var block = self.Block.fromBuffer(new Buffer(blockData, 'hex'));
    callback(null, block);
  });
};

DB.prototype.getTransaction = function(txid, queryMempool, callback) {
  if(queryMempool && this.mempool.hasTransaction(txid)) {
    return callback(null, this.mempool.getTransaction(txid));
  }

  this.getTransactionFromDB(txid, callback);
};

DB.prototype.getTransactionFromDB = function(txid, callback) {
  var self = this;

  $.checkArgument(utils.isHash(txid));

  self.store.get([self.txPrefix, txid].join('-'), function(err, txInfo) {
    if(err) {
      return callback(err);
    }

    var txInfoArray = txInfo.split(':');
    var blockHash = txInfoArray[0];
    var txCount = txInfoArray[1];

    self.getBlock(blockHash, function(err, block) {
      if (err) {
        return callback(err);
      }
      var txs = self.getTransactionsFromBlock(block);
      var tx = txs[txCount];

      if (txid !== tx.id) {
        return callback(new Error(
          'Transaction index is corrupted, txid: "' + txid + '" does not match "' + tx.id + '"'
        ));
      }

      callback(null, tx);

    });

  });
};

/**
 * Validates a Block's data
 * @param {Block} block - The block to validate
 * @param {Function} callback - A function that accepts: Error
 */
DB.prototype.validateBlockData = function(block, callback) {
  var self = this;
  var transactions = self.getTransactionsFromBlock(block);

  async.each(transactions, function(transaction, done) {
    transaction.validate(self, transactions, done);
  }, callback);
};

/**
 * Saves metadata to the database
 * @param {Object} metadata - The metadata
 * @param {Function} callback - A function that accepts: Error
 */
DB.prototype.putMetadata = function(metadata, callback) {
  this.store.put('metadata', JSON.stringify(metadata), {}, callback);
};

/**
 * Retrieves metadata from the database
 * @param {Function} callback - A function that accepts: Error and Object
 */
DB.prototype.getMetadata = function(callback) {
  var self = this;

  self.store.get('metadata', {}, function(err, data) {
    if(err instanceof levelup.errors.NotFoundError) {
      return callback(null, {});
    } else if(err) {
      return callback(err);
    }

    var metadata;
    try {
      metadata = JSON.parse(data);
    } catch(e) {
      return callback(new Error('Could not parse metadata'));
    }

    callback(null, metadata);
  });
};

/**
 * Closes the underlying store database
 * @param  {Function} callback - A function that accepts: Error
 */
DB.prototype.close = function(callback) {
  this.store.close(callback);
};

DB.prototype.sha256sha256 = function sha256sha256(buffer) {
  var sha256 = crypto.createHash('sha256');
  sha256.update(buffer);
  var sha256sha256 = crypto.createHash('sha256');
  sha256sha256.update(new Buffer(sha256.digest('hex'), 'hex'));
  return new Buffer(sha256sha256.digest('hex'), 'hex');
};

DB.prototype.getMerkleTree = function getMerkleTree(transactions) {
  // Bits need to be reversed first if we want to match bitcoin's algorithm
  var tree = transactions.map(function(tx) {
    return BufferReader(new Buffer(tx.hash, 'hex')).readReverse();
  });

  var j = 0;
  var size = transactions.length;
  for (; size > 1; size = Math.floor((size + 1) / 2)) {
    for (var i = 0; i < size; i += 2) {
      var i2 = Math.min(i + 1, size - 1);
      var buf = Buffer.concat([tree[j + i], tree[j + i2]]);
      tree.push(this.sha256sha256(buf));
    }
    j += size;
  }
  return tree;
};

DB.prototype.getMerkleRoot = function getMerkleRoot(transactions) {
  var tree = this.getMerkleTree(transactions);
  var merkleRoot = tree[tree.length - 1];
  if (!merkleRoot) {
    return null;
  } else {
    // We need to reverse the bits again when we are done
    return BufferReader(merkleRoot).readReverse().toString('hex');
  }
};

DB.prototype.addTransactionsToBlock = function addTransactionsToBlock(block, transactions) {
  var txs = this.getTransactionsFromBlock(block);
  txs = txs.concat(transactions);
  var txsBuffer = this.Transaction.manyToBuffer(txs);
  var bw = new BufferWriter();
  bw.writeVarintNum(txs.length);
  bw.write(txsBuffer);
  block.merkleRoot = this.getMerkleRoot(txs);
  block.data = bw.concat();
};

DB.prototype.getTransactionsFromBlock = function getTransactionsFromBlock(block) {
  var self = this;
  if (block.data.length === 0) {
    return [];
  }
  var br = new BufferReader(block.data);
  var count = br.readVarintNum();
  var transactions = [];
  for (var i = 0; i < count; i++) {
    var tx;
    if (self.Transaction.prototype.fromBufferReader) {
      tx = self.Transaction().fromBufferReader(br);
    } else {
      tx = self.Transaction.fromBufferReader(br);
    }
    transactions.push(tx);
  }
  return transactions;
};

DB.prototype.buildGenesisData = function() {
  return {
    merkleRoot: null,
    buffer: new Buffer(0)
  };
};

DB.prototype.getPrevHash = function(blockHash, callback) {
  var key = [this.prevHashPrefix, blockHash].join('-');
  this.store.get(key, callback);
};

/**
 * When a block is added to the best chain
 * @param  {Block} block
 */
DB.prototype._onChainAddBlock = function(block, callback) {
  var self = this;

  log.debug('DB handling new chain block');

  // Remove block from mempool
  self.mempool.removeBlock(block.hash);

  async.series([
    this._updateTransactions.bind(this, block, true), // add transactions
    this._updateValues.bind(this, block, true) // update values
  ], function(err, results) {
    if (err) {
      return callback(err);
    }

    var operations = [];
    for (var i = 0; i < results.length; i++) {
      operations = operations.concat(results[i]);
    }

    log.debug('Updating the database with operations', operations);

    self.store.batch(operations, callback);
  });
};

DB.prototype._patch = function(key, diff, callback) {
  var self = this;

  // load the original
  self.get(key, function(err, original) {
    if(err && !(err instanceof levelup.errors.NotFoundError)) {
      return callback(err);
    }

    var newValue;

    try {
      var originalObject = JSON.parse(original);
      newValue = jsondiffpatch.patch(originalObject, diff);
    } catch(e) {
      newValue = jsondiffpatch.patch(original, diff);
    }

    var operation = {
      type: 'put',
      key: [self.dataPrefix, key].join('-'),
      value: newValue
    };

    callback(null, operation);
  });
};

/**
 * A block is rolled back on a chain reorganization
 * @param  {Block} block
 */
DB.prototype._onChainRemoveBlock = function(block, callback) {
  var self = this;

  log.debug('DB removing chain block');

  async.series([
    this._updateTransactions.bind(this, block, false), // remove transactions
    this._updateValues.bind(this, block, false) // update values
  ], function(err, results) {
    if (err) {
      return callback(err);
    }

    var operations = [];
    for (var i = 0; i < results.length; i++) {
      operations = operations.concat(results[i]);
    }

    log.debug('Updating the database with operations', operations);

    self.store.batch(operations, callback);
  });
};

DB.prototype._unpatch = function(key, diff, callback) {
  var self = this;

  // load the original
  self.get(key, function(err, original) {
    if(err) {
      return callback(err);
    }

    var newValue;

    try {
      var originalObject = JSON.parse(original);
      newValue = jsondiffpatch.unpatch(originalObject, diff);
    } catch(e) {
      newValue = jsondiffpatch.unpatch(original, diff);
    }

    var action = 'put';
    if(!newValue) {
      action = 'del';
    }

    var operation = {
      type: action,
      key: [self.dataPrefix, key].join('-'),
      value: newValue
    };

    callback(null, operation);
  });
};

DB.prototype._updatePrevHashIndex = function(block, callback) {
  this.store.put([this.prevHashPrefix, block.hash].join('-'), block.prevHash, callback);
};

DB.prototype._updateTransactions = function(block, addTransaction, callback) {
  var txs = this.getTransactionsFromBlock(block);

  log.debug('Updating transactions');

  var action = 'put';
  if (!addTransaction) {
    action = 'del';
  }

  var operations = [];

  for (var txCount = 0; txCount < txs.length; txCount++) {
    var tx = txs[txCount];
    var txid = tx.id;
    var blockHash = block.hash;
    // we may want to store the block "transactions" seperate from blocks
    // to optimize transactions lookups and not storing transactions twice
    operations.push({
      type: action,
      key: [this.txPrefix, txid].join('-'),
      value: [blockHash, txCount].join(':')
    });

    if(addTransaction) {
      // Remove transaction from mempool
      this.mempool.removeTransaction(txid);
    } else {
      // Add transaction to mempool
      this.mempool.addTransaction(tx, function(err) {});
      // If there is an error adding it back, don't halt everything because
      // it is not serious enough to warrant a reorg failure
    }
  }

  callback(null, operations);

};

DB.prototype._updateValues = function(block, add, callback) {
  var self = this;

  var operations = [];

  var action = '_patch';
  if(!add) {
    action = '_unpatch';
  }

  var transactions = self.getTransactionsFromBlock(block);
  async.each(transactions, function(transaction, next) {
    async.each(transaction.diffs, function(data, next) {
      var key = data[0];
      var diff = data[1];

      self[action].call(self, key, diff, function(err, operation) {
        if(err) {
          return next(err);
        }

        operations.push(operation);
        next();
      });
    }, next);
  }, function(err) {
    callback(err, operations);
  });
};

module.exports = DB;
