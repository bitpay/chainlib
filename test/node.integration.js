'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var bitcore = require('bitcore');
var BufferWriter = bitcore.encoding.BufferWriter;
var Node = require('../lib/node');
var DB = require('../lib/db');
var Block = require('../lib/block');
var Transaction = require('../lib/transaction');

var chainData = require('./data/chain.json');
var p2p = require('bitcore-p2p');
var Pool = p2p.Pool;
var memdown = require('memdown');
var levelup = require('levelup');

describe('Node Integration test', function() {

  var node;
  var genesis = new Block(chainData[0]);

  var configuration = {
    genesis: genesis,
    consensus: {
      builder: true
    },
    db: {
      store: memdown
    }
  };

  var forkBlocks = [];

  function blockData(transactions) {
    var bw = new BufferWriter();
    bw.writeVarintNum(transactions.length);
    bw.write(Transaction.manyToBuffer(transactions));
    return bw.concat();
  }

  function merkleRoot(transactions) {
    var db = new DB({store: memdown});
    var root = db.getMerkleRoot(transactions);
    return root;
  }

  function createForkBlocks(commonAncestor) {
    var transactions1 = [
      new Transaction({
        diffs: [
          ['key3', [null, 'value3a']]
        ]
      })
    ];
    forkBlocks.push(new Block({
      prevHash: commonAncestor,
      timestamp: new Date('2015-2-21'), // needed to create a different hash than block on other fork
      merkleRoot: merkleRoot(transactions1),
      height: commonAncestor.height + 1,
      data: blockData(transactions1)
    }));

    var transactions2 = [
      new Transaction({
        diffs: [
          ['key4', [null, 'value4a']]
        ]
      })
    ];
    forkBlocks.push(new Block({
      prevHash: forkBlocks[0].hash,
      timestamp: new Date('2015-2-21'),
      merkleRoot: merkleRoot(transactions2),
      height: commonAncestor.height + 2,
      data: blockData(transactions2)
    }));

    var transactions3 = [
      new Transaction({
        diffs: [
          ['key5', [null, 'value5a']]
        ]
      })
    ];
    forkBlocks.push(new Block({
      prevHash: forkBlocks[1].hash,
      timestamp: new Date('2015-2-21'),
      merkleRoot: merkleRoot(transactions3),
      height: commonAncestor.height + 3,
      data: blockData(transactions3)
    }));
  }

  before(function(done) {
    sinon.stub(Pool.prototype, 'connect', function() {
      this.emit('peerready', {host: 'fake', port: 12345, sendMessage: sinon.spy()});
    });
    sinon.stub(Pool.prototype, 'listen');
    node = new Node(configuration);
    node.on('ready', function() {
      done();
    });
    node.on('error', function(err) {
      should.not.exist(err);
    });
  });

  after(function() {
    Pool.prototype.connect.restore();
    Pool.prototype.listen.restore();
  });

  it('should have the genesis block', function(done) {
    node.chain.tip.hash.should.equal(genesis.hash);
    done();
  });

  it('should add key value data', function(done) {
    node.put('key1', 'value1a', function(err, hash) {
      should.not.exist(err);
      should.exist(hash);
      setTimeout(function() {
        createForkBlocks(node.chain.tip.hash);
        done();
      }, 1000);
    });
  });

  it('should add more key value data', function(done) {
    node.put('key2', 'value2a', function(err, hash) {
      should.not.exist(err);
      should.exist(hash);
      done();
    });
  });

  it('should query key value data', function(done) {
    setTimeout(function() {
      node.get('key1', function(err, value) {
        should.not.exist(err);
        should.exist(value);
        value.should.equal('value1a');
        done();
      });
    }, 1000);
  });

  it('should replace old key value data', function(done) {
    node.put('key1', 'value1b', function(err) {
      should.not.exist(err);

      setTimeout(function() {
        node.db.get('key1', function(err, value) {
          should.not.exist(err);
          value.should.equal('value1b');
          done();
        });
      }, 1000);
    });
  });

  it('should add more key value data on a fork', function(done) {
    node.chain.addBlock(forkBlocks[0], function(err) {
      should.not.exist(err);
      done();
    });
  });

  it('the smaller fork\'s data should not be queryable', function(done) {
    node.get('key3', function(err, value) {
      should.exist(err);
      err.should.be.instanceof(levelup.errors.NotFoundError);
      done();
    });
  });

  it('should handle a reorg', function(done) {
    node.chain.addBlock(forkBlocks[1], function(err) {
      should.not.exist(err);
      node.chain.addBlock(forkBlocks[2], function(err) {
        should.not.exist(err);

        node.chain.tip.hash.should.equal(forkBlocks[2].hash);
        done();
      });
    });
  });

  it('should get the right value for key1 after reorg', function(done) {
    node.get('key1', function(err, value) {
      should.not.exist(err);
      value.should.equal('value1a');
      done();
    });
  });

  it('key2 should not exist after reorg', function(done) {
    node.get('key2', function(err, value) {
      should.exist(err);
      err.should.be.instanceof(levelup.errors.NotFoundError);
      done();
    });
  });

  it('key3 should exist after reorg', function(done) {
    node.get('key3', function(err, value) {
      should.not.exist(err);
      value.should.equal('value3a');
      done();
    });
  });

  it('key4 should exist after reorg', function(done) {
    node.get('key4', function(err, value) {
      should.not.exist(err);
      value.should.equal('value4a');
      done();
    });
  });

  it('key5 should exist after reorg', function(done) {
    node.get('key5', function(err, value) {
      should.not.exist(err);
      value.should.equal('value5a');
      done();
    });
  });

});
