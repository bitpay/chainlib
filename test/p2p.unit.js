'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var Mempool = require('../lib/mempool');
var proxyquire = require('proxyquire');

var InventoryStub = {
  TYPE: {
    TX: 1,
    BLOCK: 2
  },
  forBlock: sinon.spy(),
  forTransaction: sinon.spy()
};

var P2POriginal = require('../lib/p2p');
var P2P = proxyquire(
  '../lib/p2p',
  {
    'bitcore-p2p': {
      Pool: sinon.spy(),
      Messages: sinon.spy(),
      Inventory: InventoryStub
    }
  }
);

describe('P2P', function() {
  describe('@constructor', function() {
    it('should create an instance of P2P', function() {
      var p2p = new P2P();
      should.exist(p2p.messages);
      should.exist(p2p.pool);
      p2p.ready.should.equal(false);
    });

    it('should save metadata when synced', function(done) {
      var p2p = new P2P();
      p2p.chain = {
        saveMetadata: function() {
          p2p.chain.lastSavedMetadataThreshold.should.equal(0);
          done();
        }
      };
      p2p.emit('synced');
    });
  });

  describe('#initialize', function() {
    it('should set up event handlers and call connect', function() {
      var p2p = new P2P();
      p2p.pool = {
        on: sinon.spy(),
        connect: sinon.spy(),
        listen: sinon.spy()
      };

      p2p.db = {
        mempool: {
          on: sinon.spy()
        }
      };

      p2p.chain = {
        on: sinon.spy()
      };

      p2p.initialize();
      p2p.mempool.on.callCount.should.equal(1);
      p2p.chain.on.callCount.should.equal(2);
      setImmediate(function() {
        p2p.pool.listen.callCount.should.equal(1);
      });
      p2p.pool.on.callCount.should.equal(6);
    });
    it('will not call listen for peers with "onListen" option', function() {
      var p2p = new P2P({noListen: true});
      p2p.pool = {
        on: sinon.spy(),
        connect: sinon.spy(),
        listen: sinon.spy()
      };

      p2p.db = {
        mempool: {
          on: sinon.spy()
        }
      };

      p2p.chain = {
        on: sinon.spy()
      };

      p2p.initialize();
      setImmediate(function() {
        p2p.pool.listen.callCount.should.equal(0);
      });
    });
    it('will not listen with false passed with true default', function() {
      P2P.NO_LISTEN = true;
      var p2p = new P2P({noListen: false});
      p2p.pool = {
        on: sinon.spy(),
        connect: sinon.spy(),
        listen: sinon.spy()
      };

      p2p.db = {
        mempool: {
          on: sinon.spy()
        }
      };

      p2p.chain = {
        on: sinon.spy()
      };

      p2p.initialize();
      setImmediate(function() {
        p2p.pool.listen.callCount.should.equal(0);
      });
    });
  });

  describe('#startSync', function() {
    it('will set disableSync to false and call _sync()', function() {
      var p2p = new P2P();
      p2p.disableSync = true;
      p2p._sync = sinon.stub();
      p2p.startSync();
      p2p._sync.callCount.should.equal(1);
      p2p.disableSync.should.equal(false);
    });
  });

  describe('#sendMessage', function() {
    it('should call pool.sendMessage', function() {
      var p2p = new P2P();
      p2p.pool = {
        sendMessage: sinon.spy()
      };
      p2p.sendMessage('message');
      p2p.pool.sendMessage.calledWith('message').should.equal(true);
    });
  });

  describe('#_onPeerReady', function() {
    var p2p = new P2P();
    p2p._sync = sinon.spy();
    var callCount = 0;
    var readyHandler = function(callback) {
      p2p.ready.should.equal(true);
      callCount++;
      callCount.should.equal(1);
      callback();
    };

    it('should emit ready when the first peer is ready', function(done) {
      p2p.on('ready', readyHandler.bind(this, done));
      p2p._onPeerReady({});
    });

    it('should not emit ready when other peers are ready', function() {
      p2p._onPeerReady({});
    });
  });

  describe('#_onPeerInv', function() {
    var p2p = new P2P();
    p2p.mempool = new Mempool();
    p2p.messages = {
      GetData: sinon.spy()
    };
    var peerStub = {
      sendMessage: sinon.spy()
    };
    p2p._bufferToHash = sinon.stub().returnsArg(0);

    it('should filter out transactions that we know about', function() {
      var ourTransactions = [
        {
          type: InventoryStub.TYPE.TX,
          hash: '0e43c26bbbbabd45133eec4e012c2ec2d8a2ad5e61f86c403f6df56e13f30ca1'
        },
        {
          type: InventoryStub.TYPE.TX,
          hash: 'bac22b776ca3bb5e8599ae6ac81a658ad5800e1810281e357147ce75844a3d77'
        }
      ];
      var newTransactions = [
        {
          type: InventoryStub.TYPE.TX,
          hash: '3b3cdece9090776aa53feecbae75035f72d37a12823f71b372d8d07c09fc5995'
        },
        {
          type: InventoryStub.TYPE.TX,
          hash: '3618a74daaeebee250a0ad6fac8d4a779a904bd30a009662943f2a9293427a51'
        }
      ];
      var inventory = ourTransactions.concat(newTransactions);
      p2p.mempool.transactions = ourTransactions;
      p2p._onPeerInv(peerStub, {inventory: inventory});
      p2p.messages.GetData.called.should.equal(true);
      var filtered = p2p.messages.GetData.args[0][0];
      filtered.length.should.equal(2);
      filtered[0].should.deep.equal(newTransactions[0]);
      filtered[1].should.deep.equal(newTransactions[1]);
    });

    it('should filter out blocks that we know about', function() {
      var ourBlocks = [
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: '0000000000000000105e50aa08c0b9159512034349f0fe5787d3d7ed721f4bfb'
        },
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: '0000000000000000084edf894c09df42f5da4e64abe7874af62178848e226a4d'
        }
      ];
      var newBlocks = [
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: '000000000000000008a9a121d6282a19615787b75bfc63c3f63bffce261e7067'
        },
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: '0000000000000000073711c30eb6555198462e65d0f86de23a38878501ec841f'
        }
      ];
      p2p.messages.GetData.reset();
      var inventory = ourBlocks.concat(newBlocks);
      p2p.mempool.addBlock(ourBlocks[0]);
      p2p.mempool.addBlock(ourBlocks[1]);
      p2p._onPeerInv(peerStub, {inventory: inventory});
      p2p.messages.GetData.called.should.equal(true);
      var filtered = p2p.messages.GetData.args[0][0];
      filtered.length.should.equal(2);
      filtered[0].should.deep.equal(newBlocks[0]);
      filtered[1].should.deep.equal(newBlocks[1]);
    });

    it('should not send a message if inventory contains no new transactions or blocks', function() {
      var ourTransactions = [
        {
          type: InventoryStub.TYPE.TX,
          hash: '0e43c26bbbbabd45133eec4e012c2ec2d8a2ad5e61f86c403f6df56e13f30ca1'
        },
        {
          type: InventoryStub.TYPE.TX,
          hash: 'bac22b776ca3bb5e8599ae6ac81a658ad5800e1810281e357147ce75844a3d77'
        }
      ];
      peerStub.sendMessage.reset();
      p2p.messages.GetData.reset();
      var inventory = ourTransactions;
      p2p.mempool.transactions = ourTransactions;
      p2p._onPeerInv(peerStub, {inventory: inventory});
      p2p.messages.GetData.called.should.equal(false);
      peerStub.sendMessage.called.should.equal(false);
    });

    it('should not getdata for other inventory types', function() {
      var inventory = [
        {
          type: 10,
          hash: '0e43c26bbbbabd45133eec4e012c2ec2d8a2ad5e61f86c403f6df56e13f30ca1'
        },
      ];
      peerStub.sendMessage.reset();
      p2p.messages.GetData.reset();
      p2p._onPeerInv(peerStub, {inventory: inventory});
      p2p.messages.GetData.called.should.equal(false);
      peerStub.sendMessage.called.should.equal(false);
    });

  });

  describe('#_onPeerBlock', function() {
    it('should add block to chain', function() {
      var p2p = new P2P();
      p2p.mempool = {
        addBlock: sinon.spy()
      };

      p2p._onPeerBlock('block', {message: {block: {hash: 'hash'}}});
      p2p.mempool.addBlock.calledWith('block');
    });
  });

  describe('#_onPeerTx', function() {
    it('should add tx to mempool', function() {
      var p2p = new P2P();
      p2p.mempool = {
        addTransaction: sinon.stub().callsArg(1)
      };

      p2p._onPeerTx('tx', {transaction: {hash: 'hash'}});
      p2p.mempool.addTransaction.calledWith('tx');
    });
    it('should not crash if it receives malformed transaction', function() {
      var p2p = new P2P();
      p2p.mempool = {
        addTransaction: sinon.stub().callsArg(1)
      };

      p2p._onPeerTx('tx', {});
      p2p.mempool.addTransaction.calledWith('tx');
    });
    it('should not crash if error condition is met', function() {
      var p2p = new P2P();
      p2p.mempool = {
        addTransaction: sinon.stub().callsArgWith(1, new Error('validation error'))
      };

      p2p._onPeerTx('tx', {transaction: {hash: 'hash'}});
      p2p.mempool.addTransaction.calledWith('tx');
    });
  });

  describe('#_onPeerGetData', function() {
    before(function() {
      sinon.stub(P2P.prototype, '_bufferToHash', function(hash) {
        return hash;
      });
    });
    after(function() {
      P2P.prototype._bufferToHash.restore();
    });
    it('should get data for a block', function(done) {
      var peerStub = {
        sendMessage: function(message) {
          done();
        }
      };

      var block = {
        toBuffer: sinon.spy()
      };

      var p2p = new P2P();
      p2p.db = {
        getBlock: sinon.stub().callsArgWith(1, null, block)
      };
      p2p.messages = {
        Block: sinon.spy(),
        Transaction: sinon.spy(),
        NotFound: {
          forTransaction: sinon.spy()
        }
      };
      var hash = '0000000000000000105e50aa08c0b9159512034349f0fe5787d3d7ed721f4bfb';
      var inventory = [
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: hash
        }
      ];
      p2p._onPeerGetData(peerStub, {inventory: inventory});
      p2p.db.getBlock.calledWith(hash);
    });

    it('should send a notfound message if the block is not found', function(done) {
      var peerStub = {
        sendMessage: function(message) {
          message.command.should.equal('notfound');
          done();
        }
      };

      var p2p = new P2P();
      p2p.db = {
        getBlock: sinon.stub().callsArgWith(1, null, null)
      };
      p2p.messages = {
        NotFound: {
          forBlock: sinon.stub().returns({command: 'notfound'})
        }
      };
      var hash = '0000000000000000105e50aa08c0b9159512034349f0fe5787d3d7ed721f4bfb';
      var inventory = [
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: hash
        }
      ];
      p2p._onPeerGetData(peerStub, {inventory: inventory});
      p2p.db.getBlock.calledWith(hash);
    });

    it('should get data for a transaction', function(done) {
      var peerStub = {
        sendMessage: function(message) {
          done();
        }
      };

      var transaction = {
        toBuffer: sinon.spy()
      };

      var p2p = new P2P();
      p2p.mempool = {
        getTransaction: sinon.spy()
      };
      p2p.db = {
        getTransaction: sinon.stub().callsArgWith(2, null, transaction)
      };
      p2p.messages = {
        Block: sinon.spy(),
        Transaction: sinon.spy(),
        NotFound: {
          forTransaction: sinon.spy()
        }
      };
      var hash = 'ccf46b74b51ee96217d184a6d991412bcb6585dff6c4512c7730b6dac130c61c';
      var inventory = [
        {
          type: InventoryStub.TYPE.TX,
          hash: hash
        }
      ];
      p2p._onPeerGetData(peerStub, {inventory: inventory});
      p2p.db.getTransaction.calledWith(hash, true);
    });

    it('should send a notfound message if the transaction is not found', function(done) {
      var peerStub = {
        sendMessage: function(message) {
          message.command.should.equal('notfound');
          done();
        }
      };

      var p2p = new P2P();
      p2p.db = {
        getTransaction: sinon.stub().callsArgWith(2, null, null)
      };
      p2p.mempool = {
        getTransaction: sinon.spy()
      };
      p2p.messages = {
        NotFound: {
          forTransaction: sinon.stub().returns({command: 'notfound'})
        }
      };
      var hash = 'ccf46b74b51ee96217d184a6d991412bcb6585dff6c4512c7730b6dac130c61c';
      var inventory = [
        {
          type: InventoryStub.TYPE.TX,
          hash: hash
        }
      ];
      p2p._onPeerGetData(peerStub, {inventory: inventory});
      p2p.db.getTransaction.calledWith(hash);
    });

    it('should emit an error if there is a database error getting block', function(done) {
      var p2p = new P2P();
      p2p.db = {
        getBlock: sinon.stub().callsArgWith(1, new Error('error'))
      };

      p2p.on('error', function(err) {
        should.exist(err);
        done();
      });

      var inventory = [
        {
          type: InventoryStub.TYPE.BLOCK,
          hash: '0000000000000000105e50aa08c0b9159512034349f0fe5787d3d7ed721f4bfb'
        }
      ];
      p2p._onPeerGetData({}, {inventory: inventory});
    });

    it('should emit an error if there is a database error getting transaction', function(done) {
      var p2p = new P2P();
      p2p.db = {
        getTransaction: sinon.stub().callsArgWith(2, new Error('error'))
      };
      p2p.mempool = {
        getTransaction: sinon.spy()
      };

      p2p.on('error', function(err) {
        should.exist(err);
        done();
      });

      var inventory = [
        {
          type: InventoryStub.TYPE.TX,
          hash: 'ccf46b74b51ee96217d184a6d991412bcb6585dff6c4512c7730b6dac130c61c'
        }
      ];
      p2p._onPeerGetData({}, {inventory: inventory});
    });
  });

  describe('#_onChainAddBlock', function() {
    it('should send inventory with block to peers if synced', function() {
      var p2p = new P2P();
      p2p.messages = {
        Inventory: {
          forBlock: sinon.spy()
        }
      };
      p2p.pool = {
        sendMessage: sinon.spy()
      };
      p2p.chain = {
        blockQueue: [],
        saveMetadata: sinon.spy()
      };
      p2p.synced = true;

      p2p._onChainAddBlock('block');
      p2p.pool.sendMessage.calledOnce.should.equal(true);
    });

    it('should not send message if not synced', function() {
      var p2p = new P2P();
      p2p.pool = {
        sendMessage: sinon.spy()
      };

      p2p._onChainAddBlock('block');
      p2p.pool.sendMessage.callCount.should.equal(0);
    });
  });

  describe('#_onChainQueueProcessed', function() {
    it('should call _sync if p2p is not synced', function() {
      var p2p = new P2P();
      p2p._sync = sinon.spy();

      p2p._onChainQueueProcessed();
      p2p._sync.callCount.should.equal(1);
    });

    it('should not call _sync if p2p is synced', function() {
      var p2p = new P2P();
      p2p._sync = sinon.spy();
      p2p.synced = true;

      p2p._onChainQueueProcessed();
      p2p._sync.callCount.should.equal(0);
    });
  });

  describe('#_onMempoolTransaction', function() {
    it('should send inventory with block to peers', function() {
      var p2p = new P2P();
      p2p.messages = {
        Inventory: {
          forTransaction: sinon.spy()
        }
      };
      p2p.pool = {
        sendMessage: sinon.spy()
      };

      p2p._onMempoolTransaction('transaction');
      p2p.pool.sendMessage.calledOnce.should.equal(true);
    });
  });

  describe('#_bufferToHash', function() {
    it('should get the string representation of a hash which is a buffer', function() {
      var p2p = new P2P();
      var buffer = new Buffer('debeb62783962578c8d307a55825853c091acafb76986c9ef0e28a3703eb3191', 'hex');
      var result = p2p._bufferToHash(buffer);
      result.should.equal('9131eb03378ae2f09e6c9876fbca1a093c852558a507d3c87825968327b6bede');
    });

    it('should be able to call _hashToBuffer and then _bufferToHash and get the same result', function() {
      var p2p = new P2P();
      var hash = '9131eb03378ae2f09e6c9876fbca1a093c852558a507d3c87825968327b6bede';
      var buffer = p2p._hashToBuffer(hash);
      var result = p2p._bufferToHash(buffer);
      result.should.equal(hash);
    });
  });

  describe('#_hashToBuffer', function() {
    it('should convert a string representation of a hash into a buffer', function() {
      var p2p = new P2P();
      var hash = '9131eb03378ae2f09e6c9876fbca1a093c852558a507d3c87825968327b6bede';
      var result = p2p._hashToBuffer(hash);
      result.toString('hex').should.equal('debeb62783962578c8d307a55825853c091acafb76986c9ef0e28a3703eb3191');
    });
  });

  describe('#_sync', function() {
    it('will immediatly return false if sync is disabled', function() {
      var p2p = new P2P();
      p2p.disableSync = true;
      p2p._sync().should.equal(false);
    });
    it('should create and send a getblocks message using the hashes from the chain', function(done) {
      var p2p = new P2P();
      p2p.chain = {
        tip: {
          timestamp: new Date('2015-04-07')
        },
        getHashes: sinon.stub().callsArgWith(1, null, ['hash1', 'hash2'])
      };
      p2p._buildGetBlocksMessage = sinon.spy();
      var peer = {
        sendMessage: function() {
          p2p.chain.getHashes.calledOnce.should.equal(true);
          p2p._buildGetBlocksMessage.calledOnce.should.equal(true);
          done();
        }
      };
      p2p._getRandomPeer = sinon.stub().returns(peer);

      p2p._sync();
    });

    it('should emit an error if getHashes gives an error', function(done) {
      var p2p = new P2P();
      p2p.chain = {
        tip: {
          timestamp: new Date('2015-04-07')
        },
        getHashes: sinon.stub().callsArgWith(1, new Error('error'))
      };
      p2p.on('error', function(err) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
      p2p._sync();
    });

    it('should not send message if no peers are connected', function() {
      var p2p = new P2P();
      p2p.chain = {
        tip: {
          timestamp: new Date('2015-04-07')
        },
        blockQueue: [],
        getHashes: sinon.stub().callsArgWith(1, null, ['hash1', 'hash2']),
        saveMetadata: sinon.spy()
      };
      p2p._buildGetBlocksMessage = sinon.spy();
      p2p._getRandomPeer = sinon.stub().returns(null);
      p2p._sync();
    });

    it('should emit synced if tip is recent and p2p is not already synced', function(done) {
      var p2p = new P2P();
      p2p.chain = {
        tip: {
          timestamp: new Date()
        },
        getHashes: sinon.stub().callsArgWith(1, null, ['hash1', 'hash2']),
        saveMetadata: sinon.spy()
      };
      p2p._buildGetBlocksMessage = sinon.spy();
      var peer = {
        sendMessage: sinon.spy()
      };
      p2p._getRandomPeer = sinon.stub().returns(peer);

      p2p.once('synced', function() {
        done();
      });

      p2p._sync();
      p2p.synced.should.equal(true);
    });

    it('should emit synced after syncTimeout if the tip has not changed by then', function(done) {
      var p2p = new P2P({
        syncTimeout: 10
      });
      p2p.chain = {
        tip: {
          timestamp: new Date('2015-07-01'),
          hash: 'hash'
        },
        getHashes: sinon.stub().callsArgWith(1, null, ['hash1', 'hash2']),
        saveMetadata: sinon.spy()
      };
      p2p._buildGetBlocksMessage = sinon.spy();
      var peer = {
        sendMessage: sinon.spy()
      };
      p2p._getRandomPeer = sinon.stub().returns(peer);

      p2p.once('synced', function() {
        done();
      });

      p2p._sync();
      p2p.synced.should.equal(false);
    });
  });

  describe('#_getRandomPeer', function() {
    it('should return one of the connected peers', function() {
      var p2p = new P2P();
      p2p.pool = {
        _connectedPeers: {
          1: 'one',
          2: 'two'
        }
      };
      var peer = p2p._getRandomPeer();
      var result = (peer === 'one' || peer === 'two');
      result.should.equal(true);
    });
    it('should return null if there are no connected peers', function() {
      var p2p = new P2P();
      p2p.pool = {
        _connectedPeers: {}
      };
      var peer = p2p._getRandomPeer();
      should.not.exist(peer);
    });
  });

  describe('#_buildGetBlocksMessage', function() {
    before(function() {
      sinon.stub(P2P.prototype, '_hashToBuffer').returnsArg(0);
    });
    after(function() {
      P2P.prototype._hashToBuffer.restore();
    });

    var p2p = new P2P();
    p2p.messages = {
      GetBlocks: sinon.spy()
    };

    it('should work with only a genesis hash', function() {
      var hashes = ['genesis'];
      p2p._buildGetBlocksMessage(hashes);
      var starts = p2p.messages.GetBlocks.args[0][0].starts;
      starts.should.deep.equal(hashes);
      p2p.messages.GetBlocks.reset();
    });

    it('should work with less than 10 hashes', function() {
      var hashes = ['genesis', 'hash1', 'hash2', 'hash3', 'hash4'];
      var expectedHashes = ['hash4', 'hash3', 'hash2', 'hash1', 'genesis'];
      p2p._buildGetBlocksMessage(hashes);
      var starts = p2p.messages.GetBlocks.args[0][0].starts;
      starts.should.deep.equal(expectedHashes);
      p2p.messages.GetBlocks.reset();
    });

    it('should work with 10 hashes', function() {
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var expectedHashes = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
      p2p._buildGetBlocksMessage(hashes);
      var starts = p2p.messages.GetBlocks.args[0][0].starts;
      starts.should.deep.equal(expectedHashes);
      p2p.messages.GetBlocks.reset();
    });

    it('should work with 30 hashes', function() {
      var hashes = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29
      ];
      var expectedHashes = [
        29, 28, 27, 26, 25, 24, 23, 22, 21, 20,
        19, 17, 13, 5, 0
      ];
      p2p._buildGetBlocksMessage(hashes);
      var starts = p2p.messages.GetBlocks.args[0][0].starts;
      starts.should.deep.equal(expectedHashes);
      p2p.messages.GetBlocks.reset();
    });

    it('should interface with bitcore-p2p correctly', function() {
      var p2p = new P2POriginal();
      var hashes = [
        '000000000000000002b8742a4c0cde93d5e3dfb067959726e773225c9f2a008e',
        '000000000000000007073fdf0808749a4c845189769a1cc7ec6db562944cdb0d'
      ];
      var message = p2p._buildGetBlocksMessage(hashes);
      message.starts.length.should.equal(2);
    });
  });

  describe('_onPeerGetBlocks', function() {
    var p2p = new P2P();
    p2p.chain = {
      genesis: {
        hash: '000000000000000002b8742a4c0cde93d5e3dfb067959726e773225c9f2a008e'
      },
      tip: {
        hash: '000000000000000007073fdf0808749a4c845189769a1cc7ec6db562944cdb0d'
      }
    };
    p2p.messages = {
      Inventory: sinon.spy()
    };
    var peer = {
      sendMessage: sinon.spy()
    };
    p2p._bufferToHash = function(buffer) {
      if(buffer instanceof Buffer) {
        return buffer.toString();
      } else {
        return buffer;
      }
    };
    before(function() {
      InventoryStub.forBlock = sinon.stub().returnsArg(0);
    });
    after(function() {
      InventoryStub.forBlock = sinon.spy();
    });
    it('should send the hashes the requester does not have', function(done) {
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var locatorHashes = [7, 5, 0];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);

      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          var inventory = p2p.messages.Inventory.args[0][0];
          inventory.should.deep.equal([8, 9]);
          p2p.messages.Inventory.reset();
          done();
        }
      );
    });
    it('should not send any hashes if they already have the latest block', function(done) {
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var locatorHashes = [9, 8, 7];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);

      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          p2p.messages.Inventory.called.should.equal(false);
          p2p.messages.Inventory.reset();
          done();
        }
      );
    });
    it('should ignore any fork the requester is on, and only return blocks from the main chain', function(done) {
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var locatorHashes = ['9a', '8a', '7a', 4];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);

      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          var inventory = p2p.messages.Inventory.args[0][0];
          inventory.should.deep.equal([5, 6, 7, 8, 9]);
          p2p.messages.Inventory.reset();
          done();
        }
      );
    });
    it('should start with the genesis block if we do not recognize any of the locator hashes', function(done) {
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var locatorHashes = ['9a', '8a', '7a'];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);

      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          var inventory = p2p.messages.Inventory.args[0][0];
          inventory.should.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
          p2p.messages.Inventory.reset();
          done();
        }
      );
    });
    it('should only include up to MAX_BLOCKS hashes', function(done) {
      p2p.maxBlocks = 2;
      var hashes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      var locatorHashes = [2, 1, 0];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);

      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          var inventory = p2p.messages.Inventory.args[0][0];
          inventory.should.deep.equal([3, 4]);
          p2p.messages.Inventory.reset();
          P2P.MAX_BLOCKS = 500;
          done();
        }
      );
    });
    it('should emit an error if getHashes has an error', function(done) {
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, new Error('error'));
      p2p.on('error', function(err) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
      p2p._onPeerGetBlocks(
        peer,
        {
          starts: [],
          stop: new Buffer(Array(32))
        }
      );
    });
    it('should interface with bitcore-p2p correctly', function(done) {
      var p2p = new P2POriginal();
      p2p.chain = {
        tip: {
          hash: '000000000000000002b8742a4c0cde93d5e3dfb067959726e773225c9f2a008e'
        }
      };
      var hashes = [
        '00000000000000000efff7c3401fe793449dadc21d4883812b5d21bc14bb21b5',
        '000000000000000007073fdf0808749a4c845189769a1cc7ec6db562944cdb0d',
        '000000000000000002b8742a4c0cde93d5e3dfb067959726e773225c9f2a008e'
      ];
      var locatorHashes = [p2p._hashToBuffer('00000000000000000efff7c3401fe793449dadc21d4883812b5d21bc14bb21b5')];
      p2p.chain.getHashes = sinon.stub().callsArgWith(1, null, hashes);
      peer.sendMessage.reset();
      p2p._onPeerGetBlocks(
        peer,
        {
          starts: locatorHashes,
          stop: new Buffer(Array(32))
        },
        function() {
          var inventory = peer.sendMessage.args[0][0].inventory;
          p2p._bufferToHash(inventory[0].hash).should.equal(hashes[1]);
          p2p._bufferToHash(inventory[1].hash).should.equal(hashes[2]);
          done();
        }
      );
    });
  });
});
