'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var bitcore = require('bitcore');
var BN = bitcore.crypto.BN;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var DB = require('../lib/db');
var Block = require('../lib/block');

var Transaction = require('../lib/transaction');
var chainData = require('./data/chain.json');
var memdown = require('memdown');
var levelup = require('levelup');

var blockData = {
  prevHash: '401cf7b60a534a68c6d8d3e5cbf4a9100279d874a2db2658a3dcdddbc5c8b5c4',
  hash: 'a84ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae647718e',
  timestamp: '2015-03-04T02:21:39.984Z'
};

describe('DB', function() {
  describe('@constructor', function() {
    it('should throw an error if database path is not specified', function() {
      (function() {
        var db = new DB();
      }).should.throw('Please include database path');
    });
  });
  describe('#put', function() {
    it('should return a transaction hash', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, null);
      db.put('key', 'value', function(err, txid) {
        should.not.exist(err);
        txid.should.equal('c38552cfa7b5871748bacfc5be4c02f5c718f3af8ceca3add106b29c0714f2ef');
        done();
      });
    });
    it('should give an error if addTransaction gives an error', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, null);
      db.mempool = {
        addTransaction: sinon.stub().callsArgWith(1, new Error('validation error'))
      };
      db.put('key', 'value', function(err, txid) {
        should.exist(err);
        err.message.should.equal('validation error');
        done();
      });
    });
    it('should return the error if getDiff returns an error', function(done) {
      var db = new DB({store: memdown});
      var stub = sinon.stub(db, 'getDiff').callsArgWith(2, 'err', null);
      db.put('key', 'value', function(err) {
        should.exist(err);
        err.should.equal('err');
        done();
      });
    });
  });
  describe('#get', function() {
    it('should call store.get with the right key', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, null, 'value')
      };
      db.get('key', function(err, value) {
        should.not.exist(err);
        value.should.equal('value');
        db.store.get.calledWith('data-key');
        done();
      });
    });
    it('should give error on error', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, new Error('error'))
      };
      db.get('key', function(err, value) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
  });
  describe('#getAPIMethods', function() {
    it('should return get and put methods', function(){
      var db = new DB({store: memdown});
      var methods = db.getAPIMethods();
      methods[0][0].should.equal('get');
      methods[1][0].should.equal('put');
    });
  });
  describe('#getDiff', function() {
    it('should return the jsondiff between the old key and the new if the value is json', function(done) {
      var oldValue = '{"hello": "world"}';
      var newValue = '{"hello": "world2"}';

      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, oldValue);
      db.getDiff('key', newValue, function(err, diff) {
        should.not.exist(err);
        JSON.stringify(diff).should.equal('{"hello":["world","world2"]}');
        done();
      });
    });
    it('should return the jsondiff between the old key and the new if the value is not json', function(done) {
      var oldValue = 'val1';
      var newValue = 'val2';

      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, oldValue);
      db.getDiff('key', newValue, function(err, diff) {
        should.not.exist(err);
        JSON.stringify(diff).should.equal('["val1","val2"]');
        done();
      });
    });
    it('should return the correct diff if there was no old value', function(done) {
      var oldValue = null;
      var newValue = 'val1';

      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, oldValue);
      db.getDiff('key', newValue, function(err, diff) {
        should.not.exist(err);
        JSON.stringify(diff).should.equal('[null,"val1"]');
        done();
      });
    });
    it('should return an error if the call to get returns an error', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, {'notFound': false, 'message': 'err'}, '');
      db.getDiff('key', '', function(err) {
        should.exist(err);
        err.message.should.equal('err');
        done();
      });
    });
  });
  describe('#putBlock', function() {
    it('should call put on the store and _updatePrevHashIndex', function(done) {
      var block = new Block(chainData[1]);
      var db = new DB({store: memdown});
      db.store = {
        put: sinon.stub().callsArg(3)
      };
      db._updatePrevHashIndex = sinon.stub().callsArg(1);

      db.putBlock(block, function(err) {
        should.not.exist(err);
        db.store.put.calledOnce.should.equal(true);
        db._updatePrevHashIndex.calledOnce.should.equal(true);
        done();
      });
    });
    it('should give an error if put gives an error', function(done) {
      var block = new Block(chainData[1]);
      var db = new DB({store: memdown});
      db.store = {
        put: sinon.stub().callsArgWith(3, new Error('putError'))
      };

      db.putBlock(block, function(err) {
        should.exist(err);
        err.message.should.equal('putError');
        done();
      });
    });
  });
  describe('#getBlock', function() {
    it('should return an error if the store has an error', function(done) {
      var block = new Block(chainData[1]);
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, new Error('error'))
      };

      db.getBlock(block.hash, function(err, blockDb) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
    it('should return the block from the store', function(done) {
      var block = new Block(chainData[1]);
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, null, block.toBuffer())
      };

      db.getBlock(block.hash, function(err, blockDb) {
        should.not.exist(err);
        blockDb.hash.should.equal(block.hash);
        done();
      });
    });
  });
  describe('#validateBlockData', function() {
    it('should not error if the block contains no transactions', function(done) {
      var db = new DB({store: memdown});
      var block1 = {hash: 'block1'};
      db.getTransactionsFromBlock = sinon.stub().returns([]);
      db.validateBlockData(block1, function(err) {
        should.not.exist(err);
        done();
      });
    });
    it('should not error if validation was successful', function(done) {
      var db = new DB({store: memdown});
      var block1 = {hash: 'block1'};
      var tx1 = {
        validate: sinon.stub().callsArg(2)
      };
      var tx2 = {
        validate: sinon.stub().callsArg(2)
      };
      db.getTransactionsFromBlock = function() {
        return [tx1, tx2];
      };
      db.validateBlockData(block1, function(err) {
        should.not.exist(err);
        done();
      });
    });
    it('should error if one of the transactions fails to validate', function(done) {
      var db = new DB({store: memdown});
      var block1 = {hash: 'block1'};
      var tx1 = {
        validate: sinon.stub().callsArgWith(2, new Error('invalid tx'))
      };
      var tx2 = {
        validate: sinon.stub().callsArg(2)
      };
      db.getTransactionsFromBlock = function() {
        return [tx1, tx2];
      };
      db.validateBlockData(block1, function(err) {
        should.exist(err);
        err.message.should.equal('invalid tx');
        done();
      });
    });
  });
  describe('#putMetadata', function() {
    it('should save the metadata in memory', function(done) {
      var db = new DB({store: memdown});
      db.putMetadata({key: 'value'}, function(err) {
        should.not.exist(err);
        done();
      });
    });
  });
  describe('#getMetadata', function() {
    it('should retrieve the metadata from memory', function(done) {
      var db = new DB({store: memdown});
      var metadataJSON = JSON.stringify({key: 'value'});
      db.store = {
        get: sinon.stub().callsArgWith(2, null, metadataJSON)
      };
      db.getMetadata(function(err, metadata) {
        should.not.exist(err);
        metadata.key.should.equal('value');
        done();
      });
    });
    it('should return the error to the callback', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, {'notFound': false}, null)
      };
      db.getMetadata(function(err) {
        should.exist(err);
        done();
      });
    });
    it('should return a new error should the json not parse.', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(2, null, 'string')
      };
      db.getMetadata(function(err) {
        should.exist(err);
        done();
      });
    });
  });
  describe('#getMerkleTree', function() {
    it('the tree should contain 6 hashes', function() {
      var db = new DB({store: memdown});
      var txs = [
        {
          hash: '24f7922acf1467770ba46f96a284a5f8f689edfd4c7179ed62c536271ba7dca3',
        },
        {
          hash: 'e849e32557c637d6cce2cd2c269b7a6929fd0dba3dbcb47d2bbed91f9a0d253b'
        },
        {
          hash: 'f3ba4d7490c7afc9a234ba078dab1b031e7bf0533caacc646d0d23357e31ac91'
        }
      ];
      var tree = db.getMerkleTree(txs);
      tree.length.should.equal(6);
    });
  });
  describe('#getMerkleRoot', function() {
    it('return the last hash in the tree, read reverse', function() {
      var db = new DB({store: memdown});
      var tree = [
        new Buffer('24f7922acf1467770ba46f96a284a5f8f689edfd4c7179ed62c536271ba7dca3', 'hex'),
        new Buffer('e849e32557c637d6cce2cd2c269b7a6929fd0dba3dbcb47d2bbed91f9a0d253b', 'hex'),
        new Buffer('f3ba4d7490c7afc9a234ba078dab1b031e7bf0533caacc646d0d23357e31ac91', 'hex')
      ];
      db.getMerkleTree = sinon.stub().returns(tree);
      var root = db.getMerkleRoot();
      root.should.equal(BufferReader(tree[2]).readReverse().toString('hex'));
    });
    it('return null for an empty tree', function() {
      var db = new DB({store: memdown});
      var tree = [];
      db.getMerkleTree = sinon.stub().returns(tree);
      var root = db.getMerkleRoot();
      should.equal(root, null);
    });
    it('should get the correct merkle root for testnet block 460', function() {
      var db = new DB({store: memdown});
      var txs = [
        {
          hash: 'de5c972f83685c0fdf2163a3f39fad9a6235d4c5c3ef34c665dfa0e4c6c86480'
        },
        {
          hash: '310036df82e0731273f6a194cd1044ef3290945ef5f6fe2fd6c32aa3ff9149e6'
        },
        {
          hash: '66f09d50681f4b41d7b627c5517e49dfa0d373a87af28c87b39134105854b18c'
        }
      ];
      txs[0].hash.should.equal('de5c972f83685c0fdf2163a3f39fad9a6235d4c5c3ef34c665dfa0e4c6c86480');
      txs[1].hash.should.equal('310036df82e0731273f6a194cd1044ef3290945ef5f6fe2fd6c32aa3ff9149e6');
      txs[2].hash.should.equal('66f09d50681f4b41d7b627c5517e49dfa0d373a87af28c87b39134105854b18c');
      var root = db.getMerkleRoot(txs);
      root.should.equal('117503366e6618de4670f8dc6f8edb6acd3f4e12b21cb5092425ea076e28a7ec');
    });
  });
  describe('#addTransactionsToBlock', function() {
    it('adds transaction to block data', function() {
      // setup
      var db = new DB({store: memdown});
      db.getTransactionsFromBlock = sinon.stub().returns(['faketx']);
      var original = db.Transaction;
      var stub = sinon.stub(db.Transaction, 'manyToBuffer').returns(new Buffer('abcdef', 'hex'));
      db.getMerkleRoot = sinon.stub().returns(new Buffer(Array(32)));
      var block = {};
      var transactions = ['faketx2'];

      // test
      db.addTransactionsToBlock(block, transactions);

      // check
      block.merkleRoot.should.deep.equal(new Buffer(Array(32)));
      block.__transactions.should.deep.equal(['faketx', 'faketx2']);
      var br = new BufferReader(block.data);
      var count = br.readVarintNum();
      count.should.equal(2);
      var data = br.readAll();
      data.should.deep.equal(new Buffer('abcdef', 'hex'));
      db.Transaction = original;
      stub.restore();
    });
  });
  describe('#getTransactionsFromBlock', function() {
    it('should return [] if no transactions', function() {
      var db = new DB({store: memdown});
      var block = new Block(blockData);
      block.data = new Buffer(Array(0));
      var txs = db.getTransactionsFromBlock(block);
      txs.should.deep.equal([]);
    });
    it('get transactions from block data', function() {
      var db = new DB({store: memdown});
      var stub = sinon.stub(db.Transaction, 'fromBufferReader').returns({});
      var block = new Block(blockData);
      var bw = new BufferWriter();
      bw.writeVarintNum(2);
      block.data = bw.concat();
      var txs = db.getTransactionsFromBlock(block);
      txs.length.should.equal(2);
      stub.restore();
    });
    it('should return the cached __transactions if it exists', function() {
      var db = new DB({store: memdown});
      var block = {
        __transactions: ['tx1', 'tx2'],
        data: 'data'
      };

      var txs = db.getTransactionsFromBlock(block);
      txs.should.deep.equal(['tx1', 'tx2']);
    });
  });
  describe('#getTransaction', function() {
    it('should give the transaction if contained in the mempool and queryMempool flag is set', function(done) {
      var db = new DB({path: 'path', store: memdown});
      db.mempool = {
        hasTransaction: sinon.stub().returns(true),
        getTransaction: sinon.stub().returns('tx')
      };
      db.getTransactionFromDB = sinon.spy();
      db.getTransaction('txid', true, function(err, tx) {
        should.not.exist(err);
        db.getTransactionFromDB.called.should.equal(false);
        tx.should.equal('tx');
        done();
      });
    });
    it('should give the transaction in the db if queryMempool flag is not set', function(done) {
      var db = new DB({path: 'path', store: memdown});
      db.getTransactionFromDB = sinon.stub().callsArgWith(1, null, 'tx');
      db.getTransaction('txid', false, function(err, tx) {
        should.not.exist(err);
        tx.should.equal('tx');
        done();
      });
    });
  });

  describe('#getTransactionFromDB', function() {
    var blockHash = '000000000000000013a017714203a4f191eac8e04bfc6e742ababa3334b242e8';
    var txid = '509b1a599eae7af59f858b1137ba3a73c6a33f354df86698cd6eb5c4ab2ce1bb';
    var db = new DB({path: 'path', store: memdown});
    db.store = {
      get: sinon.stub().callsArgWith(1, null, blockHash + ':1')
    };
    db.getBlock = sinon.stub().callsArgWith(1, null, {});
    db.getTransactionsFromBlock = function() {
      return [
        { id: '9446826ea2463d9c83b0a1dfca04b08644e1b9803f12152ca582ac72db7f85ac' },
        { id: txid },
        { id: 'b56d1a8415ee50ef6e5d8291d45730fa710d727d290d6db2e6acb6229ebdf1ca' }
      ];
    };

    it('should give error if transaction is not found', function(done) {
      var notFoundDB = new DB({path: 'path', store: memdown});
      var notFoundError = new levelup.errors.NotFoundError();
      notFoundDB.store = {
        get: sinon.stub().callsArgWith(1, notFoundError)
      };
      notFoundDB.getTransactionFromDB('b56d1a8415ee50ef6e5d8291d45730fa710d727d290d6db2e6acb6229ebdf1ca', function(err, tx){
        should.exist(err);
        err.should.be.instanceof(levelup.errors.NotFoundError);
        should.not.exist(tx);
        done();
      });
    });

    it('should give error if getBlock fails', function(done) {
      var blockErrorDB = new DB({path: 'path', store: memdown});
      var blockError = new Error('error');
      blockErrorDB.store = {
        get: sinon.stub().callsArgWith(1, null, blockHash + ':1')
      };
      blockErrorDB.getBlock = sinon.stub().callsArgWith(1, blockError);
      blockErrorDB.getTransactionFromDB('b56d1a8415ee50ef6e5d8291d45730fa710d727d290d6db2e6acb6229ebdf1ca', function(err){
        should.exist(err);
        err.message.should.match(/error/);
        done();
      });
    });

    it('should get a transaction', function(done) {
      db.getTransactionFromDB(txid, function(err, tx) {
        should.not.exist(err);
        db.store.get.calledWith('tx-' + txid).should.equal(true);
        db.getBlock.calledWith(blockHash);
        tx.id.should.equal(txid);
        done();
      });
    });

    it('should give an error if index is corrupt', function(done) {
      db.store.get = sinon.stub().callsArgWith(1, null, blockHash + ':2');
      db.getBlock.reset();
      db.getTransactionFromDB(txid, function(err, tx) {
        should.exist(err);
        err.message.should.match(/^Transaction index is corrupted/);
        done();
      });
    });
  });
  describe('#buildGenesisData', function() {
    it('should build genesis data', function() {
      var db = new DB({store: memdown});
      var data = db.buildGenesisData();
      data.buffer.should.deep.equal(new Buffer(0));
      should.equal(data.merkleRoot, null);
    });
  });

  describe('#getPrevHash', function() {
    it('should call get with the right key', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(1, null, 'one')
      };
      db.getPrevHash('two', function(err, prevHash) {
        should.not.exist(err);
        db.store.get.args[0][0].should.equal('ph-two');
        prevHash.should.equal('one');
        done();
      });
    });
  });

  describe('#getWeight', function() {
    it('should call get with the right key and return a BN', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(1, null, '1c')
      };
      db.getWeight('block', function(err, weight) {
        should.not.exist(err);
        db.store.get.args[0][0].should.equal('wt-block');
        weight.toString(16).should.equal('1c');
        done();
      });
    });

    it('should give an error if the store gives an error', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        get: sinon.stub().callsArgWith(1, new Error('storeError'))
      };
      db.getWeight('block', function(err, weight) {
        should.exist(err);
        err.message.should.equal('storeError');
        done();
      });
    });
  });

  describe('#_onChainAddBlock', function() {
    var db = new DB({store: memdown});
    db._updateTransactions = sinon.stub().callsArgWith(2, null, ['1a', '1b']);
    db._updateValues = sinon.stub().callsArgWith(2, null, ['2a', '2b']);
    db.store = {
      batch: sinon.stub().callsArg(1)
    };

    it('should give error when there is a failure to write', function() {
      var errordb = new DB({path: 'path', store: memdown});
      errordb._updateTransactions = sinon.stub().callsArgWith(2, null, ['1a', '1b']);
      errordb._updateValues = sinon.stub().callsArgWith(2, null, ['2a', '2b']);
      errordb.store = {
        batch: sinon.stub().callsArgWith(1, new Error('error'))
      };
      errordb._onChainAddBlock('block', function(err) {
        should.exist(err);
      });
    });

    it('should call block processing functions and write to database', function(done) {
      db._onChainAddBlock('block', function(err) {
        should.not.exist(err);
        db._updateValues.calledOnce.should.equal(true);
        db._updateValues.calledWith('block', true).should.equal(true);
        db._updateTransactions.calledOnce.should.equal(true);
        db._updateTransactions.calledWith('block', true).should.equal(true);
        db.store.batch.args[0][0].should.deep.equal(['1a', '1b', '2a', '2b']);
        done();
      });
    });
    it('should halt on an error and not write to database', function(done) {
      db._updateTransactions.reset();
      db.store.batch.reset();
      db._updateValues = sinon.stub().callsArgWith(2, new Error('error'));
      db._onChainAddBlock('block', function(err) {
        should.exist(err);
        err.message.should.equal('error');
        db._updateTransactions.calledOnce.should.equal(true);
        db._updateTransactions.calledWith('block', true).should.equal(true);
        db._updateValues.calledOnce.should.equal(true);
        db._updateValues.calledWith('block', true).should.equal(true);
        db.store.batch.called.should.equal(false);
        done();
      });
    });
  });
  describe('#_patch', function() {
    it('should patch json data', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, JSON.stringify({hello: 'world1'}));

      db._patch('key', {hello: ['world1', 'world2']}, function(err, operation) {
        should.not.exist(err); 
        operation.key.should.equal('data-key');
        JSON.stringify(operation.value).should.equal(JSON.stringify({hello: 'world2'}));
        done();
      });
    });
    it('should patch non-json data', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, 'value1');

      db._patch('key', ['value1', 'value2'], function(err, operation) {
        should.not.exist(err);
        operation.key.should.equal('data-key');
        operation.value.should.equal('value2');
        done();
      });
    });
    it('should give an error if there is an error getting the original', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, new Error('getError'));
      db._patch('key', ['value1', 'value2'], function(err, operation) {
        should.exist(err);
        err.message.should.equal('getError');
        done();
      });
    });
  });
  describe('#_onChainRemoveBlock', function() {
    var db = new DB({store: memdown});
    db._updateTransactions = sinon.stub().callsArgWith(2, null, ['1a', '1b']);
    db._updateValues = sinon.stub().callsArgWith(2, null, ['2a', '2b']);
    db.store = {
      batch: sinon.stub().callsArg(1)
    };

    it('should give error when there is a failure to write', function() {
      var errordb = new DB({path: 'path', store: memdown});
      errordb._updateTransactions = sinon.stub().callsArgWith(2, null, ['1a', '1b']);
      errordb._updateValues = sinon.stub().callsArgWith(2, null, ['2a', '2b']);
      errordb.store = {
        batch: sinon.stub().callsArgWith(1, new Error('error'))
      };
      errordb._onChainRemoveBlock('block', function(err) {
        should.exist(err);
      });
    });

    it('should call block processing functions and write to database', function(done) {
      db._onChainRemoveBlock('block', function(err) {
        should.not.exist(err);
        db._updateValues.calledOnce.should.equal(true);
        db._updateValues.calledWith('block', false).should.equal(true);
        db._updateTransactions.calledOnce.should.equal(true);
        db._updateTransactions.calledWith('block', false).should.equal(true);
        db.store.batch.args[0][0].should.deep.equal(['1a', '1b', '2a', '2b']);
        done();
      });
    });
    it('should halt on an error and not write to database', function(done) {
      db._updateTransactions.reset();
      db.store.batch.reset();
      db._updateValues = sinon.stub().callsArgWith(2, new Error('error'));
      db._onChainRemoveBlock('block', function(err) {
        should.exist(err);
        err.message.should.equal('error');
        db._updateTransactions.calledOnce.should.equal(true);
        db._updateTransactions.calledWith('block', false).should.equal(true);
        db._updateValues.calledOnce.should.equal(true);
        db._updateValues.calledWith('block', false).should.equal(true);
        db.store.batch.called.should.equal(false);
        done();
      });
    });
  });

  describe('#_unpatch', function() {
    it('should unpatch json data', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, JSON.stringify({hello: 'world2'}));

      db._unpatch('key', {hello: ['world1', 'world2']}, function(err, operation) {
        should.not.exist(err);
        operation.type.should.equal('put');
        operation.key.should.equal('data-key');
        JSON.stringify(operation.value).should.equal(JSON.stringify({hello: 'world1'}));
        done();
      });
    });
    it('should unpatch non-json data', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, 'value2');

      db._unpatch('key', ['value1', 'value2'], function(err, operation) {
        should.not.exist(err);
        operation.type.should.equal('put');
        operation.key.should.equal('data-key');
        operation.value.should.equal('value1');
        done();
      });
    });
    it('should delete the key if we are going to a null/undefined value', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, null, 'value1');
      db._unpatch('key', [null, 'value1'], function(err, operation) {
        should.not.exist(err);
        operation.type.should.equal('del');
        operation.key.should.equal('data-key');
        done();
      });
    });
    it('should short-circuit in the event that we cannot load the original', function(done) {
      var db = new DB({store: memdown});
      db.get = sinon.stub().callsArgWith(1, new Error('getError'));

      db._unpatch('key', ['value1', 'value2'], function(err, operation) {
        should.exist(err);
        err.message.should.equal('getError');
        done();
      });
    });
  });

  describe('#_updatePrevHashIndex', function() {
    it('should call put with the correct key and value', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        put: sinon.stub().callsArg(2)
      };
      var block = {
        hash: 'two',
        prevHash: 'one'
      };
      db._updatePrevHashIndex(block, function(err) {
        should.not.exist(err);
        db.store.put.args[0][0].should.equal('ph-two');
        db.store.put.args[0][1].should.equal('one');
        done();
      });
    });
  });

  describe('#_updateWeight', function() {
    it('should call put with the correct key and value', function(done) {
      var db = new DB({store: memdown});
      db.store = {
        put: sinon.stub().callsArg(2)
      };
      var block = {
        hash: 'two',
        prevHash: 'one'
      };
      db._updateWeight('hash', new BN('1c', 'hex'), function(err) {
        should.not.exist(err);
        db.store.put.args[0][0].should.equal('wt-hash');
        db.store.put.args[0][1].should.equal('1c');
        done();
      });
    });
  });

  describe('#_updateTransactions', function() {
    var db = new DB({store: memdown});
    db.getTransactionsFromBlock = function() {
      return [
        {id: 'f7b6d184a53e6c9cd267f24245063f70718b9918952e107c68aa574fd1f490d5'},
        {id: '894c0d433e0ab8231871f6a2f6d80d518269448c89a6d8d156ef4aeb7fffcf3d'}
      ];
    };
    db.mempool = {
      addTransaction: sinon.stub().callsArg(1),
      removeTransaction: sinon.spy()
    };
    var blockHash = '000000000000000007cd1534826699ada701338a2fa8f8bd27638ef33d80ed22';

    it('should create the correct operations when adding transactions', function(done) {
      db._updateTransactions({hash: blockHash}, true, function(err, operations) {
        should.not.exist(err);
        operations.length.should.equal(2);
        operations[0].type.should.equal('put');
        operations[0].key.should.equal('tx-f7b6d184a53e6c9cd267f24245063f70718b9918952e107c68aa574fd1f490d5');
        operations[0].value.should.equal(blockHash + ':0');
        operations[1].type.should.equal('put');
        operations[1].key.should.equal('tx-894c0d433e0ab8231871f6a2f6d80d518269448c89a6d8d156ef4aeb7fffcf3d');
        operations[1].value.should.equal(blockHash + ':1');
        done();
      });
    });
    it('should create the correct operations when removing transactions', function(done) {
      db._updateTransactions({hash: blockHash}, false, function(err, operations) {
        should.not.exist(err);
        operations.length.should.equal(2);
        operations[0].type.should.equal('del');
        operations[0].key.should.equal('tx-f7b6d184a53e6c9cd267f24245063f70718b9918952e107c68aa574fd1f490d5');
        operations[0].value.should.equal(blockHash + ':0');
        operations[1].type.should.equal('del');
        operations[1].key.should.equal('tx-894c0d433e0ab8231871f6a2f6d80d518269448c89a6d8d156ef4aeb7fffcf3d');
        operations[1].value.should.equal(blockHash + ':1');
        done();
      });
    });
  });

  describe('#_updateValues', function() {
    var db = new DB({store: memdown});
    db._patch = sinon.stub().callsArgWith(2, null, 'operation');
    db._unpatch = sinon.stub().callsArgWith(2, null, 'operation');
    var transactions = [
      {
        diffs: ['1a', '1b', '1c']
      },
      {
        diffs: ['2a', '2b']
      }
    ];
    db.getTransactionsFromBlock = sinon.stub().returns(transactions);

    it('should call _patch when add is true', function(done) {
      db._updateValues('block', true, function(err, operations) {
        should.not.exist(err);
        db._patch.callCount.should.equal(5);
        operations.length.should.equal(5);
        done();
      });
    });

    it('should call _unpatch when add is true', function(done) {
      db._updateValues('block', false, function(err, operations) {
        should.not.exist(err);
        db._unpatch.callCount.should.equal(5);
        operations.length.should.equal(5);
        done();
      });
    });

    it('should give an error if action gives error', function(done) {
      db._patch = sinon.stub().callsArgWith(2, new Error('patchError'));
      db._updateValues('block', true, function(err, operations) {
        should.exist(err);
        err.message.should.equal('patchError');
        done();
      });
    });
  });
});
