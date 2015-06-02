'use strict';

var should = require('chai').should();
var sinon = require('sinon');
var bitcore = require('bitcore');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var BN = bitcore.crypto.BN;
var Transaction = require('../lib/transaction');

describe('Transaction', function() {

  describe('#addDiff', function() {
    it('should add a diff to the transaction diffs', function() {
      var tx = new Transaction();
      tx.addDiff('key1', ['value1a','value1b']);
      tx.diffs.length.should.equal(1);
      tx.diffs[0][0].should.equal('key1');
      tx.diffs[0][1][0].should.equal('value1a');
      tx.diffs[0][1][1].should.equal('value1b');
    });
  });

  describe('#validate', function() {
    it('should not have an error', function(done) {
      var tx = new Transaction();
      tx.validate({}, [], function(err) {
        should.not.exist(err);
        done();
      });
    });
  });

  describe('@static #fromBufferReader', function() {
    it('deserialize a buffer', function() {
      var bw = new BufferWriter();
      var data = new Buffer(JSON.stringify({diffs: 'diffs'}));
      bw.writeUInt64LEBN(new BN(data.length, 10));
      bw.write(data);
      var buffer = bw.concat();
      var br = new BufferReader(buffer);
      var tx = Transaction.fromBufferReader(br);
      tx.should.be.instanceof(Transaction);
      tx.diffs.should.equal('diffs');
    });

    it('roundtrip serialization', function() {
      var expected = new Buffer('11000000000000007b226469666673223a226469666673227d', 'hex');
      var actual = Transaction.fromBuffer(expected).toBuffer();
      actual.should.deep.equal(expected);
    });

  });

  describe('@static #fromBuffer', function() {
    it('pass instance of BufferReader and return result from fromBufferReader', function() {
      var stub = sinon.stub(Transaction, 'fromBufferReader', function(br) {
        br.should.be.instanceof(BufferReader);
        return 'success';
      });
      var result = Transaction.fromBuffer(new Buffer(Array(0)));
      result.should.equal('success');
      stub.calledOnce.should.equal(true);
      stub.restore();
    });    
  });

  describe('#toBuffer', function() {
    it('should return the right data', function() {
      var data = {
        diffs: [
          ['key1', ['value1a', 'value1b']]
        ]
      };
      var tx = new Transaction(data);
      var txBuffer = tx.toBuffer();
      var br = new BufferReader(txBuffer);
      var count = br.readUInt64LEBN();
      var d = txBuffer.slice(8);
      Number(count.toString(10)).should.equal(d.length);
      d.toString().should.equal(JSON.stringify(data));
    });
  });

  describe('#toObject', function() {
    it('should return the right data', function() {
      var data = {
        diffs: [
          ['key1', ['value1a', 'value1b']]
        ]
      };

      var tx = new Transaction(data);
      tx.toObject().diffs[0][0].should.equal('key1');
    });
  });
  describe('#getHash', function() {
    it('calculate hash from buffer', function() {
      var tx = new Transaction();
      tx.toBuffer = sinon.stub().returns(new Buffer('abcdef', 'hex'));
      var hash = tx.getHash();
      hash.should.be.instanceof(Buffer);
      hash.length.should.equal(32);
    });
  });
  describe('@static #toBuffer', function() {
    it('should combine transactions together and encode into a buffer', function() {
      var tx1 = {};
      tx1.toBufferWriter = function(bw) {
        bw.write(new Buffer('ab', 'hex'));
      };
      var tx2 = {};
      tx2.toBufferWriter = function(bw) {
        bw.write(new Buffer('cd', 'hex'));
      };
      var buffer = Transaction.manyToBuffer([tx1, tx2]);
      buffer.should.deep.equal(new Buffer('abcd', 'hex'));
    });
  });


});
