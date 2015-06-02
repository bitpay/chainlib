'use strict';

var Block = require('./block');
var chainlib = require('../');
var log = chainlib.log;
var async = require('async');

function Builder(options) {
  if(!options) {
    options = {};
  }

  this.chain = options.chain;
  this.db = options.db;
  this.started = false;
}

Builder.prototype.start = function() {
  log.debug('Started builder');
  this.started = true;
  this.buildBlocks();
};

Builder.prototype.buildBlocks = function() {
  var self = this;

  async.whilst(
    function() {
      return self.started;
    },
    function(callback) {
      self.buildBlock(function() {
        setTimeout(callback, 500);
      });
    }, function(err) {
      if(err) {
        log.error(err);
      }
    }
  );
};

Builder.prototype.buildBlock = function(callback) {
  var self = this;

  // Get transactions from mempool
  var mempoolTransactions = self.db.mempool.getTransactions();

  if(mempoolTransactions.length) {
    // Add coinbase transaction
    var transactions = [];
    if (this.db.buildCoinbaseTransaction) {
      var coinbase = this.db.buildCoinbaseTransaction(mempoolTransactions);
      transactions.push(coinbase);
    }

    transactions = transactions.concat(mempoolTransactions);
    var block = new Block({
      prevHash: self.chain.tip.hash,
      timestamp: new Date()
    });

    self.db.addTransactionsToBlock(block, transactions);

    // Add block to chain
    log.debug('Builder built block ' + block.hash);
    self.chain.addBlock(block, function(err) {
      if (err) {
        self.chain.emit('error', err);
      } else {
        log.debug('Builder successfully added block ' + block.hash + ' to chain');
      }
      callback();
    });
  } else {
    callback();
  }
};

Builder.prototype.stop = function() {
  this.started = false;
};

module.exports = Builder;
