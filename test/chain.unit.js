'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var Chain = require('../lib/chain');
var Block = require('../lib/block');
var DB = require('../lib/db');
var async = require('async');
var bitcore = require('bitcore');
var BN = bitcore.crypto.BN;
var Reorg = require('../lib/reorg');
var memdown = require('memdown');

var chainData = require('./data/chain.json');

describe('Chain', function() {

  describe('#initialize', function() {

    it('should initialize the chain with the genesis block if no metadata is found in the db', function(done) {
      var db = {};
      db.getMetadata = sinon.stub().callsArgWith(0, null, {});
      db.putBlock = sinon.stub().callsArg(1);
      db.putMetadata = sinon.stub().callsArg(1);
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db._onChainAddBlock = sinon.stub().callsArg(1);
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db, genesis: {hash: 'genesis'}});

      chain.on('ready', function() {
        should.exist(chain.tip);
        db.putBlock.callCount.should.equal(1);
        chain.tip.hash.should.equal('genesis');
        Number(chain.tip.__weight.toString(10)).should.equal(0);
        done();
      });
      chain.on('error', function(err) {
        should.not.exist(err);
        done();
      });

      chain.initialize();
    });

    it('should initialize the chain with the metadata from the database if it exists', function(done) {
      var db = {};
      db.getMetadata = sinon.stub().callsArgWith(0, null, {tip: 'block2', tipWeight: 2});
      db.putBlock = sinon.stub().callsArg(1);
      db.putMetadata = sinon.stub().callsArg(1);
      db.getBlock = sinon.stub().callsArgWith(1, null, {hash: 'block2', prevHash: 'block1'});
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db, genesis: {hash: 'genesis'}});
      chain.getHeightForBlock = sinon.stub().callsArgWith(1, null, 10);
      chain.getWeight = sinon.stub().callsArgWith(1, null, new BN(50));
      chain.on('ready', function() {
        should.exist(chain.tip);
        db.putBlock.callCount.should.equal(0);
        chain.tip.hash.should.equal('block2');
        done();
      });
      chain.on('error', function(err) {
        should.not.exist(err);
        done();
      });
      chain.initialize();
    });

    it('should call buildGenesisBlock if genesis not set', function() {
      var db = {
        getMetadata: sinon.stub()
      };
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db});
      chain.getHeightForBlock = sinon.stub().callsArgWith(1, null, 10);
      chain.getWeight = sinon.stub().callsArgWith(1, null, new BN(50));
      chain.buildGenesisBlock = sinon.stub();
      chain.initialize();
      chain.buildGenesisBlock.calledOnce.should.equal(true);
      db.getMetadata.calledOnce.should.equal(true);
    });

    it('emit error from getMetadata', function(done) {
      var db = {
        getMetadata: function(cb) {
          cb(new Error('getMetadataError'));
        }
      };
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db, genesis: {hash: 'genesis'}});
      chain.on('error', function(error) {
        should.exist(error);
        error.message.should.equal('getMetadataError');
        done();
      });
      chain.initialize();
    });

    it('emit error from putBlock', function(done) {
      var db = {
        getMetadata: function(cb) {
          cb(null, null);
        },
        putBlock: function(block, cb) {
          cb(new Error('putBlockError'));
        }
      };
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db, genesis: {hash: 'genesis'}});
      chain.on('error', function(error) {
        should.exist(error);
        error.message.should.equal('putBlockError');
        done();
      });
      chain.initialize();
    });

    it('emit error from getBlock', function(done) {
      var db = {
        getMetadata: function(cb) {
          cb(null, {tip: 'tip'});
        },
        getBlock: function(tip, cb) {
          cb(new Error('getBlockError'));
        }
      };
      db.getTransactionsFromBlock = sinon.stub();
      db.getMerkleRoot = sinon.stub();
      db.mempool = {
        on: sinon.spy()
      };
      var chain = new Chain({db: db, genesis: {hash: 'genesis'}});
      chain.on('error', function(error) {
        should.exist(error);
        error.message.should.equal('getBlockError');
        done();
      });
      chain.initialize();
    });
  });

  describe('#addBlock', function() {
    it('should add the block to the queue and process the queue', function(done) {
      var chain = new Chain();
      chain._processBlockQueue = function() {
        chain.blockQueue.length.should.equal(1);
        done();
      };
      chain.addBlock('block', function() {});
    });
  });

  describe('#_processBlockQueue', function() {
    it('should call _processBlock for all blocks in the queue', function(done) {
      var count = 0;

      var blocks = [
        ['block1', sinon.spy()],
        ['block2', sinon.spy()],
        ['block3', function(err) {
          should.not.exist(err);
          blocks[0][1].calledOnce.should.equal(true);
          blocks[1][1].calledOnce.should.equal(true);
          done();
        }]
      ];
      var chain = new Chain();
      chain._processBlock = sinon.stub().callsArg(1);
      chain.addBlock(blocks[0][0], blocks[0][1]);
      chain.addBlock(blocks[1][0], blocks[1][1]);
      chain.addBlock(blocks[2][0], blocks[2][1]);
    });
    it('should not process any blocks if processingBlockQueue flag is set', function(done) {
      var chain = new Chain();
      chain.processingBlockQueue = true;
      chain._processBlock = sinon.stub().callsArg(1);
      var blocks = [['block1', sinon.spy()]];
      chain.addBlock(blocks[0][0], blocks[0][1]);
      chain._processBlock.called.should.equal(false);
      blocks[0][1].called.should.equal(false);
      done();
    });
  });

  describe('#_processBlock', function() {
    it('give error for invalid merkleRoot', function(done) {
      var transactions = [];
      var db = {
        getTransactionsFromBlock: sinon.stub().returns(transactions),
        getMerkleRoot: sinon.stub().returns('hash1'),
      };
      var chain = new Chain({db: db});
      var block = {
        merkleRoot: 'hash2'
      };
      chain._processBlock(block, function(err) {
        should.exist(err);
        err.message.should.match(/^Invalid merkleRoot for block/);
        done();
      });
    });

    it('give error if checking to see if the block exists errors', function(done) {
      var db = {
        getBlock: sinon.stub().callsArgWith(1, new Error('error'))
      };
      var chain = new Chain({db: db});
      chain._validateMerkleRoot = sinon.stub();
      chain._processBlock({}, function(err) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });

    it('give error on disk writing failure', function(done) {
      var block = {};
      block.validate = sinon.stub().callsArg(1);
      var db = new DB({store: memdown});
      db.getBlock = sinon.stub().callsArg(1);
      db.getBlock.onCall(1).callsArgWith(1, null, {height: 1});
      db.putBlock = sinon.stub().callsArgWith(1, new Error('disk failure'));

      var chain = new Chain({db: db});
      chain._checkExisting = sinon.stub().callsArg(1);
      chain._validateMerkleRoot = sinon.stub();
      chain._processBlock(block, function(err) {
        should.exist(err);
        err.message.should.equal('disk failure');
        done();
      });
    });

    it('should update the tip if this block makes the longest chain', function(done) {
      var prevBlock = {
        hash: 'oldtiphash',
        height: 0
      };
      var block = {};
      block.hash = 'a84ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae647718e';
      block.prevHash = 'oldtiphash';
      block.data = 'block2';
      block.validate = sinon.stub().callsArg(1);
      var db = {};
      db.getBlock = sinon.stub().callsArg(1);
      db.getBlock.onCall(1).callsArgWith(1, null, prevBlock);
      db.putBlock = sinon.stub().callsArg(1);
      db._onChainAddBlock = sinon.stub().callsArg(1);

      var chain = new Chain({db: db});
      chain._checkExisting = sinon.stub().callsArg(1);
      chain._validateMerkleRoot = sinon.stub();
      chain.tip = prevBlock;
      chain.tip.__weight = new BN(1, 10);
      chain._updateWeight = function(block, callback) {
        block.__weight = new BN(2, 10);
        callback();
      };
      chain.saveMetadata = sinon.spy();

      chain._processBlock(block, function(err) {
        should.not.exist(err);
        should.exist(chain.tip);
        chain.tip.data.should.equal('block2');
        done();
      });
    });

    it('should not update the tip if the block does not make the longest chain', function(done) {
      var prevBlock = {data: 'block2', height: 0};
      var block = {};
      block.hash = 'a84ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae647718e';
      block.data = 'block1';
      block.validate = sinon.stub().callsArg(1);
      var db = {};
      db.getBlock = sinon.stub().callsArg(1);
      db.getBlock.onCall(1).callsArgWith(1, null, prevBlock);
      db.putBlock = sinon.stub().callsArg(1);

      var chain = new Chain({db: db});
      chain._checkExisting = sinon.stub().callsArg(1);
      chain._validateMerkleRoot = sinon.stub();
      chain.tip = prevBlock;
      chain.tip.__weight = new BN(2, 10);
      chain._updateWeight = function(block, callback) {
        block.__weight = new BN(1, 10);
        callback();
      };
      chain.saveMetadata = sinon.spy();

      chain._processBlock(block, function(err) {
        should.not.exist(err);
        should.exist(chain.tip);
        chain.tip.data.should.equal('block2');
        done();
      });
    });

    it('should do a reorg when another fork becomes heaviest', function(done) {
      var prevBlock = {
        hash: 'b73ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae6476219', // old tip
        height: 0
      };
      var block = {};
      block.prevHash = 'fork';
      block.hash = 'a84ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae647718e'; // new tip
      block.data = 'block2';
      block.validate = sinon.stub().callsArg(1);
      var db = {};
      db.getBlock = sinon.stub().callsArg(1);
      db.getBlock.onCall(1).callsArgWith(1, null, prevBlock);
      db.putBlock = sinon.stub().callsArg(1);

      var chain = new Chain({db: db});
      chain._checkExisting = sinon.stub().callsArg(1);
      chain._validateMerkleRoot = sinon.stub();
      chain.tip = prevBlock;
      chain.tip.__weight = new BN(1, 10);
      chain._updateWeight = function(block, callback) {
        block.__weight = new BN(2, 10);
        callback();
      };
      chain.saveMetadata = sinon.spy();
      var reorgStub = sinon.stub(Reorg.prototype, 'go').callsArg(0);

      chain._processBlock(block, function(err) {
        should.not.exist(err);
        should.exist(chain.tip);
        reorgStub.called.should.equal(true);
        reorgStub.thisValues[0].newTip.hash.should.equal(block.hash);
        reorgStub.thisValues[0].oldTip.hash.should.equal(prevBlock.hash);
        reorgStub.restore();
        done();
      });
    });
  });

  describe('#_updateTip', function() {

    var chain = new Chain();
    var tip = chain.tip = {
      hash: 'tiphash',
      __weight: new BN(50),
      __height: 10
    };
    chain._validateBlock = sinon.stub().callsArg(1);
    chain.saveMetadata = sinon.spy();
    chain.db = {
      _onChainAddBlock: sinon.stub().callsArg(1)
    };

    before(function() {
      sinon.stub(Reorg.prototype, 'go').callsArg(0)
    });

    after(function() {
      Reorg.prototype.go.restore();
    });

    it('should add block to main chain if prevhash is tip hash', function(done) {
      var block = {
        prevHash: 'tiphash',
        __weight: new BN(60),
        hash: 'hash'
      };
      chain._updateTip(block, function(err) {
        should.not.exist(err);
        chain.tip.hash.should.equal('hash');
        chain.tip.__height.should.equal(11);
        chain.tip = tip;
        done();
      });
    });

    it('should do a reorg if weight is greater than tip and prevhash is not tip hash', function(done) {
      var block = {
        prevHash: 'otherhash',
        __weight: new BN(60),
        hash: 'hash'
      };
      chain._updateTip(block, function(err) {
        should.not.exist(err);
        Reorg.prototype.go.calledOnce.should.equal(true);
        done();
      });
    });

    it('should add block to forked chain if weight is not greater than tip weight', function(done) {
      var block = {
        prevHash: 'otherhash',
        __weight: new BN(40),
        hash: 'forkhash'
      };

      chain.on('forkblock', function(block) {
        block.hash.should.equal('forkhash');
        done();
      });

      chain._updateTip(block, function(err) {
        should.not.exist(err);
      });
    });

  });

  describe('#_updateWeight', function() {
    var chain = new Chain();
    chain.getWeight = sinon.stub().callsArgWith(1, null, new BN('1a', 'hex'));
    chain.db = {
      _updateWeight: sinon.stub().callsArg(2)
    };

    it('should add the weight to the block and update the db', function(done) {
      var block = {};
      chain._updateWeight(block, function(err) {
        should.not.exist(err);
        block.__weight.toString(16).should.equal('1a');
        done();
      });
    });

    it('should give an error if getWeight gives an error', function(done) {
      chain.getWeight = sinon.stub().callsArgWith(1, new Error('error'));
      chain._updateWeight({}, function(err) {
        should.exist(err);
        done();
      });
    });
  });

  describe('#startBuilder', function() {
    var BuilderStub = function() {};
    BuilderStub.prototype.start = sinon.spy();
    var ChainCustomBuilder = proxyquire('../lib/chain', {'./builder': BuilderStub});

    it('should start the builder if builder is set to true', function() {
      var chain = new ChainCustomBuilder({
        builder: true
      });

      chain.startBuilder();
      chain.builder.start.calledOnce.should.equal(true);
    });
    it('should not start the builder if builder is set to false', function() {
      var chain = new ChainCustomBuilder({
        builder: false
      });

      chain.startBuilder();
      chain.builder.should.equal(false);
    });
  });

  describe('#buildGenesisBlock', function() {
    it('can handle no options', function() {
      var db = {
        buildGenesisData: sinon.stub().returns({})
      };
      var chain = new Chain({db: db});
      var block = chain.buildGenesisBlock();
      should.exist(block);
      block.should.be.instanceof(Block);
      db.buildGenesisData.calledOnce.should.equal(true);
    });

    it('set timestamp, merkleRoot and data of the genesis', function() {
      var db = {
        buildGenesisData: sinon.stub().returns({
          merkleRoot: 'merkleRoot',
          buffer: new Buffer('abcdef', 'hex')
        })
      };
      var chain = new Chain({db: db});
      var timestamp = '2015-03-20T14:46:01.118Z';
      var block = chain.buildGenesisBlock({timestamp: timestamp});
      should.exist(block);
      block.should.be.instanceof(Block);
      block.timestamp.toISOString().should.equal(timestamp);
      block.merkleRoot.should.equal('merkleRoot');
      block.data.should.deep.equal(new Buffer('abcdef', 'hex'));
      db.buildGenesisData.calledOnce.should.equal(true);
    });

  });

  describe('#getHashes', function() {

    it('should get an array of chain hashes', function(done) {

      var db = new DB({store: memdown});
      var genesisBlock = new Block(chainData[0]);

      var chain = new Chain({
        db: db,
        genesis: genesisBlock
      });

      var block1 = new Block(chainData[1]);
      var block2 = new Block(chainData[2]);
      chain._validateMerkleRoot = sinon.stub();

      chain.on('ready', function() {
        async.series([
          function(next) {
            chain._processBlock(block1, next);
          },
          function(next) {
            chain._processBlock(block2, next);
          }
        ], function(err) {

          should.not.exist(err);

          // remove one of the cached hashes to force db call
          delete chain.cache.hashes[block1.hash];

          // the test
          chain.getHashes(block2.hash, function(err, hashes) {
            should.not.exist(err);
            should.exist(hashes);
            hashes.length.should.equal(3);
            done();
          });
        });
      });

      chain.on('error', function(err) {
        should.not.exist(err);
        done();
      });

      chain.initialize();
    });
  });

  describe('#getWeight', function() {
    var chain = new Chain();
    chain.db = {
      getPrevHash: sinon.stub().callsArgWith(1, null, 'prevhash'),
      getWeight: sinon.stub().callsArgWith(1, null, new BN(50))
    };
    chain.getBlockWeight = sinon.stub().callsArgWith(1, null, new BN(5));
    chain.tip = {
      hash: 'tiphash',
      __weight: new BN(70)
    };
    chain.genesis = {
      hash: 'genesishash'
    };
    chain.genesisWeight = new BN(0);

    it('should return the genesis weight if the block hash is the genesis hash', function(done) {
      chain.getWeight('genesishash', function(err, weight) {
        should.not.exist(err);
        weight.toString(10).should.equal('0');
        done();
      });
    });

    it('should add the base weight to the individual block weight', function(done) {
      chain.getWeight('block', function(err, weight) {
        should.not.exist(err);
        weight.toString(10).should.equal('55');
        done();
      });
    });

    it('it should use the chain tip __weight if it is the prevhash', function(done) {
      chain.db.getPrevHash = sinon.stub().callsArgWith(1, null, 'tiphash');

      chain.getWeight('block', function(err, weight) {
        should.not.exist(err);
        weight.toString(10).should.equal('75');
        done();
      });
    });

    it('it should use the genesis __weight if prevhash is genesis hash', function(done) {
      chain.db.getPrevHash = sinon.stub().callsArgWith(1, null, 'genesishash');

      chain.getWeight('block', function(err, weight) {
        should.not.exist(err);
        weight.toString(10).should.equal('5');
        done();
      });
    });

    it('should give an error if one of the waterfall functions gives an error', function(done) {
      chain.getBlockWeight = sinon.stub().callsArgWith(1, new Error('error'));

      chain.getWeight('block', function(err, weight) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
  });

  describe('#getHeightForBlock', function() {
    it('should return a correct height for a known block', function(done) {
      var db = new DB({store: memdown});
      var genesisBlock = new Block(chainData[0]);

      var chain = new Chain({
        db: db,
        genesis: genesisBlock
      });

      var block1 = new Block(chainData[1]);
      var block2 = new Block(chainData[2]);

      chain.on('ready', function() {
        async.series([
          function(next) {
            chain._processBlock(block1, next);
          },
          function(next) {
            chain._processBlock(block2, next);
          }
        ], function(err) {

          should.not.exist(err);

          chain.getHeightForBlock(block1.hash, function(err, height) {
            height.should.equal(1);
            done();
          });
        });

      });

      chain.on('error', function(err) {
        should.not.exist(err);
        done();
      });

      chain.initialize();
    });
    it('should give an error for a block not in the chain', function(done) {
      var db = new DB({store: memdown});
      var genesisBlock = new Block(chainData[0]);

      var chain = new Chain({
        db: db,
        genesis: genesisBlock
      });

      var block1 = new Block(chainData[1]);
      var block2 = new Block(chainData[2]);
      var block3 = new Block({
        "prevHash": null,
        "data": null,
        "timestamp": "2015-02-09T20:54:34.330Z"
      });

      chain.on('ready', function() {
        async.series([
          function(next) {
            chain._processBlock(block1, next);
          }
        ], function(err) {

          should.not.exist(err);

          chain.getHeightForBlock(block3.hash, function(err, height) {
            should.exist(err);
            done();
          });
        });

      });

      chain.on('error', function(err) {
        should.not.exist(err);
        done();
      });

      chain.initialize();
    });
  });

  describe('#saveMetadata', function() {

    it('should error on disk failure', function(done) {
      var db = {};
      db.putMetadata = sinon.stub().callsArgWith(1, new Error('disk failure'));

      var chain = new Chain({db: db});
      chain.saveMetadata(function(err) {
        should.exist(err);
        err.message.should.equal('disk failure');
        done();
      });
    });

    it('should write tip and tipWeight', function(done) {
      var db = {};
      db.putMetadata = sinon.stub().callsArg(1);

      var chain = new Chain({db: db});
      chain.tip = {hash: '12345'};
      chain.tipWeight = 1;

      chain.saveMetadata(function(err) {
        should.not.exist(err);
        db.putMetadata.calledWith({tip: '12345', tipWeight: 1});
        done();
      });

    });
  });

  describe('#_onMempoolBlock', function() {
    it('should add the block to the chain', function(done) {
      var chain = new Chain();
      chain.on('error', function(err) {
        should.exist(err);
        done();
      });
      chain.addBlock = sinon.stub().callsArgWith(1, new Error('more test coverage'));
      chain._onMempoolBlock('block');
      chain.addBlock.calledOnce.should.equal(true);
    });
  });
});
