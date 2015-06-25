'use strict';

var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var _ = bitcore.deps._;
var $ = bitcore.util.preconditions;
var async = require('async');

function MemPool(options) {
  if(!options) {
    options = {};
  }

  this.p2p = options.p2p;
  this.db = options.db;
  this.transactions = [];
  this.blocks = {};
}

inherits(MemPool, EventEmitter);

/**
 * adds a transactions to the memory pool
 * @param {Array} transactions
 * @param {Function} callback
 */
MemPool.prototype.addTransactions = function(transactions, callback) {

  $.checkArgument(
    _.isArray(transactions),
    'First argument is expected to be an array of transactions'
  );
  $.checkArgument(
    _.isFunction(callback),
    'Second argument is expected to be a callback function'
  );

  async.eachSeries(transactions, this.addTransaction.bind(this), callback);

};

/**
 * adds a transaction to the memory pool
 * @param {Transaction} transaction
 * @param {Function} callback
 */
MemPool.prototype.addTransaction = function(transaction, callback) {
  var self = this;

  $.checkArgument(
    _.isFunction(callback),
    'Second argument is expected to be a callback function'
  );

  transaction.validate(self.db, self.transactions, function(err) {
    if (err) {
      return callback(err);
    }
    if (!self.hasTransaction(transaction.hash)) {
      self.transactions.push(transaction);
      self.emit('transaction', transaction);
      callback();
      // Validate transaction
    } else {
      callback();
    }
  });

};

MemPool.prototype.hasTransaction = function(hash) {
  for (var i = 0; i < this.transactions.length; i++) {
    if (this.transactions[i].hash === hash) {
      return true;
    }
  }
  return false;
};

MemPool.prototype.purgeOldTransactions = function() {
  throw new Error('Not implemented');
};

MemPool.prototype.getTransactions = function() {
  return this.transactions;
};

MemPool.prototype.getTransaction = function(hash) {
  for (var i = 0; i < this.transactions.length; i++) {
    if (this.transactions[i].hash === hash) {
      return this.transactions[i];
    }
  }
  return null;
};

MemPool.prototype.removeTransaction = function(txid) {
  var newTransactions = [];
  this.transactions.forEach(function(tx) {
    if(tx.hash !== txid) {
      newTransactions.push(tx);
    }
  });
  this.transactions = newTransactions;
};

MemPool.prototype.addBlock = function(block) {
  if(!this.blocks[block.hash]) {
    this.blocks[block.hash] = block;
    this.emit('block', block);
  }
};

MemPool.prototype.hasBlock = function(hash) {
  return this.blocks[hash] ? true : false;
};

MemPool.prototype.getBlock = function(hash) {
  return this.blocks[hash];
};

MemPool.prototype.removeBlock = function(hash) {
  delete this.blocks[hash];
};

MemPool.prototype.getBlocks = function() {
  return this.blocks;
};

module.exports = MemPool;
