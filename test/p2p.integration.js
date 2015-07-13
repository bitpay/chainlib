'use strict';

var should = require('chai').should();
var Node = require('../lib/node');
var chainData = require('./data/chain.json');
var Block = require('../lib/block');
var async = require('async');
var memdown = require('memdown');

describe('P2P Integration test', function() {
  var node1;
  var node2;
  var node1ErrorCount = 0;
  var node2ErrorCount = 0;

  var blocks = [];

  function createNode1(callback) {
    var configuration = {
      consensus: {
        type: 'simple',
        builder: true,
        genesisOptions: {
          timestamp: new Date('2015-03-16')
        }
      },
      db: {
        type: 'simple',
        store: memdown
      },
      network: {
        name: 'chainlib',
        pubkeyhash: 0x1c,
        privatekey: 0x1e,
        scripthash: 0x28,
        xpubkey: 0x02e8de8f,
        xprivkey: 0x02e8da54,
        networkMagic: 0x0c110907,
        port: 7333
      },
      p2p: {
        addrs: [
          {
            ip: {
              v4: '127.0.0.1'
            },
            port: 7334
          }
        ],
        dnsSeed: false
      }
    };

    return new Node(configuration);
  }

  function createNode2(callback) {
    var configuration = {
      consensus: {
        type: 'simple',
        builder: true,
        genesisOptions: {
          timestamp: new Date('2015-03-16')
        }
      },
      db: {
        type: 'simple',
        store: memdown
      },
      network: {
        name: 'chainlib',
        pubkeyhash: 0x1c,
        privatekey: 0x1e,
        scripthash: 0x28,
        xpubkey: 0x02e8de8f,
        xprivkey: 0x02e8da54,
        networkMagic: 0x0c110907,
        port: 7334
      },
      p2p: {
        addrs: [
          {
            ip: {
              v4: '127.0.0.1'
            },
            port: 7333
          }
        ],
        dnsSeed: false
      }
    };

    return new Node(configuration);
  }

  before(function(done) {
    var node1Ready = false;
    var node2Ready = false;

    node1 = createNode1();
    node1.on('ready', function() {
      node1.p2p.ignoreTransactions = false;
      node1Ready = true;
      if(node2Ready) {
        done();
      }
    });
    node1.on('error', function(err) {
      node1ErrorCount++;
      console.log('node1 error:', err);
    });

    node2 = createNode2();
    node2.on('ready', function() {
      node2.p2p.ignoreTransactions = false;
      node2Ready = true;
      if(node1Ready) {
        done();
      }
    });
    node2.on('error', function(err) {
      node2ErrorCount++;
      console.log('node2 error:', err);
    });
  });

  after(function(done) {
    node1.p2p.pool.disconnect();
    node1.p2p.pool.server.close(function() {
      node2.p2p.pool.disconnect();
      node2.p2p.pool.server.close(done);
    });
  });

  it('should not have any errors starting up', function() {
    node1ErrorCount.should.equal(0);
    node2ErrorCount.should.equal(0);
    blocks.push(node1.chain.tip);
  });

  it('node1 should create a transaction and node2 should receive it', function(done) {
    var txid;
    node1.put('key1', 'value1a', function(err, hash) {
      txid = hash;
      should.not.exist(err);
    });
    node2.p2p.pool.once('peertx', function(peer, message) {
      should.exist(message.transaction);
      message.transaction.hash.should.equal(txid);
      done();
    });
  });

  it('when the next block is built, then the key should be queryable by node2', function(done) {
    node2.chain.on('addblock', function(block) {
      blocks.push(block);
      setImmediate(function() {
        node2.get('key1', function(err, value) {
          should.not.exist(err);
          value.should.equal('value1a');
          done();
        });
      });
    });
  });
});

describe('P2P Syncing', function() {
  var node1;
  var node2;
  var node1ErrorCount = 0;
  var node2ErrorCount = 0;

  var genesis = new Block(chainData[0]);

  var blocks = [];

  function createNode1(callback) {
    var configuration = {
      genesis: genesis,
      consensus: {
        type: 'simple',
        builder: false
      },
      db: {
        type: 'simple',
        store: memdown
      },
      network: {
        name: 'chainlib',
        pubkeyhash: 0x1c,
        privatekey: 0x1e,
        scripthash: 0x28,
        xpubkey: 0x02e8de8f,
        xprivkey: 0x02e8da54,
        networkMagic: 0x0c110907,
        port: 7333
      },
      p2p: {
        addrs: [
          {
            ip: {
              v4: '127.0.0.1'
            },
            port: 7334
          }
        ],
        dnsSeed: false
      }
    };

    return new Node(configuration);
  }

  function createNode2(callback) {
    var configuration = {
      genesis: genesis,
      consensus: {
        type: 'simple',
        builder: false
      },
      db: {
        type: 'simple',
        store: memdown
      },
      network: {
        name: 'chainlib',
        pubkeyhash: 0x1c,
        privatekey: 0x1e,
        scripthash: 0x28,
        xpubkey: 0x02e8de8f,
        xprivkey: 0x02e8da54,
        networkMagic: 0x0c110907,
        port: 7334
      },
      p2p: {
        maxBlocks: 2,
        syncInterval: 500,
        addrs: [
          {
            ip: {
              v4: '127.0.0.1'
            },
            port: 7333
          }
        ],
        dnsSeed: false
      }
    };

    return new Node(configuration);
  }

  before(function(done) {
    node1 = createNode1();
    node1.chain.on('ready', function() {
      done();
    });
    node1.on('error', function(err) {
      node1ErrorCount++;
    });
  });

  after(function(done) {
    node1.p2p.pool.disconnect();
    node1.p2p.pool.server.close(function() {
      node2.p2p.pool.disconnect();
      node2.p2p.pool.server.close(done);
    });
  });

  it('should add blocks to node1', function(done) {
    async.eachSeries(chainData, function(data, next) {
      if(data.prevHash === null) {
        // Skip genesis block
        return next();
      }
      node1.chain.addBlock(new Block(data), function(err) {
        should.not.exist(err);
        next();
      });
    }, done);
  });

  it('should create node2', function(done) {
    node2 = createNode2();
    node2.on('ready', function() {
      done();
    });
    node2.on('error', function(err) {
      node2ErrorCount++;
      console.log('node2 error:', err);
    });
  });

  it('node2 should download all blocks', function(done) {
    var count = 0;

    node2.chain.on('addblock', function(block) {
      count++;
      console.log('added ' + block.hash);
      if(count === chainData.length - 1) {
        done();
      }
    });
  });
});
