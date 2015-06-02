'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var Builder = require('../lib/builder');
var Transaction = require('../lib/transaction');

describe('Builder', function() {
  describe('#start', function() {
    it('should call buildBlocks', function() {
      var builder = new Builder();
      builder.buildBlocks = sinon.spy();
      builder.start();
      builder.buildBlocks.calledOnce.should.equal(true);
    });
  });
  describe('#buildBlocks', function() {
    it('should stop after calling stop()', function(done) {
      var builder = new Builder();
      builder.buildBlock = sinon.stub().callsArg(0);
      builder.start();
      setTimeout(function() {
        builder.buildBlock.calledOnce.should.equal(true);
        builder.stop();
        done();
      }, 50);
    });
  });
  describe('#buildBlock', function() {
    it('should not create a block if there are no transactions in the mempool', function(done) {
      var builder = new Builder();
      builder.db = {
        mempool: {
          getTransactions: sinon.stub().returns([])
        }
      };
      builder.chain = {
        addBlock: sinon.stub().callsArg(1)
      };

      builder.buildBlock(function(err) {
        should.not.exist(err);
        builder.chain.addBlock.callCount.should.equal(0);
        done();
      });
    });
    it('should create a block with transactions from the mempool', function(done) {
      var builder = new Builder();
      var tx1 = new Transaction();
      tx1.addDiff('key1', '[null, "value1a"]');
      builder.db = {
        mempool: {
          getTransactions: sinon.stub().returns([tx1])
        },
        addTransactionsToBlock: sinon.stub()
      };
      builder.chain = {
        addBlock: sinon.stub().callsArg(1),
        tip: {
          hash: '00000000ae1480101e21f0beb21db140b8f15170c36bf8d341b81d3fc9eeebaf'
        }
      };

      builder.buildBlock(function(err) {
        should.not.exist(err);
        builder.chain.addBlock.callCount.should.equal(1);
        //todo: check that the tx is in the block
        done();
      });      
    });
  });
});
