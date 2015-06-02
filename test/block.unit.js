'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var Block = require('../lib/block');
var bitcore = require('bitcore');
var BufferWriter = bitcore.encoding.BufferWriter;
var BufferReader = bitcore.encoding.BufferReader;
var chainData = require('./data/chain.json');

var blockData = {
  prevHash: '401cf7b60a534a68c6d8d3e5cbf4a9100279d874a2db2658a3dcdddbc5c8b5c4',
  hash: 'a84ca63feb41491d6a2032820cd078efce6f6c0344fe285c7c8bf77ae647718e',
  timestamp: '2015-03-04T02:21:39.000Z'
};

describe('Block', function() {

  describe('@constructor', function() {
    it('set the timestamp as a date', function() {
      var block = new Block(blockData);
      block.timestamp.should.be.instanceof(Date);
    });

    it('not throw error if prevHash is set to null', function() {
      var block = new Block({prevHash: null, timestamp: blockData.timestamp});
      should.exist(block);
    });

    it('throw error if missing prevHash', function() {
      (function() {
        var block = new Block({timestamp: blockData.timestamp});
      }).should.throw('"prevHash" is expected');
    });

    it('throw error if missing timestamp', function() {
      (function() {
        var block = new Block({prevHash: null});
      }).should.throw('"timestamp" is expected');
    });

    it('throw error if data is not a buffer', function() {
      (function() {
        var block = new Block({prevHash: null, timestamp: blockData.timestamp, data: 'not a buffer'});
      }).should.throw('"data" is expected to be a buffer');
    });

  });

  describe('#fromBuffer', function() {
    it('deserialize', function() {
      var blockBuffer = new Buffer('01000000c4b5c8c5dbdddca35826dba274d8790210a9f4cbe5d3d8c6684a530ab6f71c400000000000000000000000000000000000000000000000000000000000000000336cf654abcdef', 'hex');
      var block = Block.fromBuffer(blockBuffer);
      block.version.should.equal(1);
      block.prevHash.should.equal(blockData.prevHash);
      should.equal(block.merkleRoot, null);
      block.timestamp.should.be.instanceof(Date);
      block.timestamp.toISOString().should.equal(blockData.timestamp);
      block.data.should.be.instanceof(Buffer);
      block.data.should.deep.equal(new Buffer('abcdef', 'hex'));
    });

    it('set null prevHash if null hash buffer', function() {
      var blockBuffer = new Buffer('010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010ab96e24b010000abcdef', 'hex');
      var block = Block.fromBuffer(blockBuffer);
      block.hasOwnProperty('prevHash').should.equal(true);
      should.equal(block.prevHash, null);
    });

  });

  describe('#validate', function() {
    it('should error if the db rejects the block data', function(done) {
      var block2 = new Block(blockData);
      var db = {};
      db.getBlock = sinon.stub().callsArgWith(1, null, block2);
      db.validateBlockData = sinon.stub().callsArgWith(1, new Error('invalid block data'));
      var chain = {db: db};

      block2.validate(chain, function(err) {
        should.exist(err);
        err.message.should.equal('invalid block data');
        done();
      });
    });
    it('should not error otherwise', function(done) {
      var block2 = new Block(blockData);
      var db = {};
      db.getBlock = sinon.stub().callsArgWith(1, null, block2);
      db.validateBlockData = sinon.stub().callsArgWith(1, null);
      var chain = {db: db};

      block2.validate(chain, function(err) {
        should.not.exist(err);
        done();
      });
    });
    it('give error for getBlock', function(done) {
      var block = new Block(blockData);
      var chain = {
        db: {
          getBlock: sinon.stub().callsArgWith(1, new Error('error'))
        }
      };
      block.validate(chain, function(err) {
        should.exist(err);
        err.message.should.equal('error');
        done();
      });
    });
    it('give error if missing timestamp getBlock', function(done) {
      var block = new Block(blockData);
      var chain = {
        db: {
          getBlock: sinon.stub().callsArgWith(1, null, {})
        }
      };
      block.validate(chain, function(err) {
        should.exist(err);
        err.message.should.match(/Block timestamp is required/);
        done();
      });
    });
  });

  describe('#headerToBuffer', function() {
    it('calls headerToBufferWriter and concats', function() {
      var block = new Block(blockData);
      block.headerToBufferWriter = function(bw) {
        bw.write(new Buffer('abcdef', 'hex'));
      };
      var buffer = block.headerToBuffer();
      buffer.should.be.instanceof(Buffer);
      buffer.should.deep.equal(new Buffer('abcdef', 'hex'));
    });
  });

  describe('#headerToBufferWriter', function() {
    it('write header information to a buffer', function() {
      var block = new Block(blockData);      
      var bw = new BufferWriter();
      block.headerToBufferWriter(bw);
      bw.bufs[0].toString('hex').should.equal('01000000'); // version
      BufferReader(bw.bufs[1]).readReverse().toString('hex').should.equal(blockData.prevHash); //prev hash
      Number(bw.bufs[2].toString('hex')).should.equal(0); //merkle root
      bw.bufs[3].toString('hex').should.equal('336cf654'); //time
    });

    it('throw error if prevhash is invalid length', function() {
      var block = new Block(blockData);
      block.prevHash = 'not a prevhash';
      (function() {
        var bw = new BufferWriter();
        block.headerToBufferWriter(bw);
      }).should.throw('"prevHash" is expected to be 32 bytes');
    });

    it('throw error if merkleroot is invalid length', function() {
      var block = new Block(blockData);
      block.merkleRoot = 'not a merkleroot';
      (function() {
        var bw = new BufferWriter();
        block.headerToBufferWriter(bw);
      }).should.throw('"merkleRoot" is expected to be 32 bytes');
    });

  });

  describe('#toBufferWriter', function() {
    it('call headerToBufferWriter and write block data', function() {
      var block = new Block(blockData);
      block.data = new Buffer('0123', 'hex');
      block.headerToBufferWriter = function(bw) {
        bw.write(new Buffer('abcdef', 'hex'));
      };
      var bw = new BufferWriter();
      block.toBufferWriter(bw);
      var buffer = bw.concat();
      buffer.should.deep.equal(new Buffer('abcdef0123', 'hex'));
    });
  });

  describe('#toBuffer', function() {
    it('call toBufferWriter and concat to a buffer', function() {
      var block = new Block(blockData);
      block.toBufferWriter = function(bw) {
        bw.write(new Buffer('abcdef', 'hex'));
      };
      var buffer = block.toBuffer();
      buffer.should.be.instanceof(Buffer);
      buffer.should.deep.equal(new Buffer('abcdef', 'hex'));
    });
  });
  
  describe('#toObject', function() {
    it('should produce an object with all expected properties', function() {
      var expectedProps = [
        'version',
        'prevHash',
        'merkleRoot',
        'timestamp',
        'data',
        'hash'
      ];
      var block = new Block(chainData[0]);
      var object = block.toObject();
      object.should.have.keys(expectedProps);
    });
  });

  describe('#hash', function() {
    [0, 1, 2].forEach(function(i) {
      it('should get hash for blockheight '+i+'', function() {
        var block = new Block(chainData[i]);
        block.hash.should.equal(chainData[i+1].prevHash);
      });
    });
    it('should be an enumerable property', function() {
      var block = new Block(chainData[1]);
      should.exist(~Object.keys(block).indexOf('hash'));
    });
  });

  describe('#getHash', function() {
    it('gets a hash string', function() {
      var block = new Block(blockData);
      block.headerToBuffer = sinon.stub().returns(new Buffer('abcdef', 'hex'));
      var hash = block.getHash();
      (typeof(hash)).should.equal('string');
      hash.length.should.equal(64);
    });
  });

});
