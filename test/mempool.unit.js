'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var MemPool = require('../lib/mempool');
var Transaction = require('../lib/transaction');

describe('MemPool', function() {
  describe('#addTransaction', function() {
    it('should add a transaction to the mempool', function(done) {
      var mempool = new MemPool();
      var tx = new Transaction();
      mempool.addTransaction(tx, function(err) {
        should.not.exist(err);
        mempool.transactions.length.should.equal(1);
        mempool.transactions[0].should.equal(tx);
        done();
      });
    });
    it('should give an error if transaction does not validate', function(done) {
      var mempool = new MemPool();
      var tx = new Transaction();
      tx.validate = sinon.stub().callsArgWith(2, new Error('validation error'));
      mempool.addTransaction(tx, function(err) {
        should.exist(err);
        done();
      });
    });
    it('should call the callback if transaction exists', function(done) {
      var mempool = new MemPool();
      var transaction = new Transaction();
      mempool.hasTransaction = sinon.stub().returns(true);
      mempool.addTransaction(transaction, function(err) {
        should.not.exist(err);
        done();
      });
    });
  });
  describe('#hasTransaction', function() {
    var mempool = new MemPool();
    mempool.transactions = [
      {
        hash: 'tx1'
      },
      {
        hash: 'tx2'
      }
    ];

    it('should return true if the transaction exists', function() {
      var result = mempool.hasTransaction('tx2');
      result.should.equal(true);
    });
    it('should return false if the transaction does not exist', function() {
      var result = mempool.hasTransaction('tx3');
      result.should.equal(false);
    });
  });
  describe('#purgeOldTransactions', function() {
    it('should throw a not implemented error', function() {
      var mempool = new MemPool();
      (function() {
        mempool.purgeOldTransactions();
      }).should.throw('Not implemented');
    });
  });
  describe('#getTransactions', function() {
    it('should return all the transactions in the mempool', function(done) {
      var mempool = new MemPool();
      var tx = new Transaction();
      mempool.addTransaction(tx, function(err) {
        should.not.exist(err);
        var transactions = mempool.getTransactions();
        transactions.length.should.equal(1);
        mempool.transactions[0].should.equal(tx);
        done();
      });
    });
  });
  describe('#getTransaction', function() {
    var mempool = new MemPool();
    mempool.transactions = [
      {
        hash: 'tx1'
      },
      {
        hash: 'tx2'
      }
    ];
    it('should return the transaction if it exists', function() {
      var tx = mempool.getTransaction('tx1');
      tx.hash.should.equal('tx1');
    });
    it('should return null if the transaction does not exist', function() {
      var tx = mempool.getTransaction('tx3');
      should.not.exist(tx);
    });
  });
  describe('#removeTransaction', function() {
    it('should remove a transaction from the mempool', function(done) {
      var mempool = new MemPool();
      var tx1 = new Transaction();
      tx1.addDiff(['key1', ['value1a', 'value1b']]);
      var tx2 = new Transaction();
      tx1.addDiff(['key2', ['value2a', 'value2b']]);

      mempool.addTransaction(tx1, function(err) {
        should.not.exist(err);
        mempool.addTransaction(tx2, function(err) {
          should.not.exist(err);
          mempool.removeTransaction(tx1.hash);
          mempool.transactions.length.should.equal(1);
          mempool.transactions[0].should.equal(tx2);
          done();
        });
      });
    });
  });
  describe('#addBlock', function() {
    it('should add a block', function() {
      var mempool = new MemPool();
      mempool.addBlock({hash: 'block'});
      mempool.blocks.length.should.equal(1);
      mempool.blocks[0].hash.should.equal('block');
    });
  });
  describe('#hasBlock', function() {
    var mempool = new MemPool();
    mempool.blocks = [
      {
        hash: 'block1'
      },
      {
        hash: 'block2'
      }
    ];

    it('should return true if the block exists', function() {
      var result = mempool.hasBlock('block1');
      result.should.equal(true);
    });
    it('should return false if the block does not exist', function() {
      var result = mempool.hasBlock('block3');
      result.should.equal(false);
    });
  });
  describe('#getBlock', function() {
    var mempool = new MemPool();
    mempool.blocks = [
      {
        hash: 'block1'
      },
      {
        hash: 'block2'
      }
    ];
    it('should return the block if it exists', function() {
      var block = mempool.getBlock('block2');
      block.hash.should.equal('block2');
    });
    it('should return null if the block does not exist', function() {
      var block = mempool.getBlock('block3');
      should.not.exist(block);
    });
  });

  describe('#removeBlock', function() {
    it('should remove a block from the mempool', function() {
      var mempool = new MemPool();
      var block1 = {hash: 'block1'};
      var block2 = {hash: 'block2'};
      mempool.addBlock(block1);
      mempool.addBlock(block2);
      mempool.removeBlock(block1.hash);
      mempool.blocks.length.should.equal(1);
      mempool.blocks[0].should.equal(block2);
    });
  });

  describe('#getBlocks', function() {
    it('should return all the blocks in the mempool', function() {
      var mempool = new MemPool();
      var block = {hash: 'block'}
      mempool.addBlock(block);
      var blocks = mempool.getBlocks();
      blocks.length.should.equal(1);
      mempool.blocks[0].should.equal(block);
    });
  });
});
