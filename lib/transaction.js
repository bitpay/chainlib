'use strict';

var crypto = require('crypto');
var bitcore = require('bitcore');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var BN = bitcore.crypto.BN;

function Transaction(obj) {
  if(!obj) {
    obj = {};
  }

  this.diffs = obj.diffs || [];
  return this;
}

Transaction.prototype.addDiff = function(key, diff) {
  this.diffs.push([key, diff]);
};

Transaction.prototype.validate = function(db, transactions, callback) {
  setImmediate(callback);
};

Transaction.fromBufferReader = function(br) {
  var size = Number(br.readUInt64LEBN().toString(10));
  var data = br.read(size);
  var object = JSON.parse(data.toString());
  return new Transaction(object);
};

Transaction.fromBuffer = function(buffer) {
 var br = new BufferReader(buffer);
 return Transaction.fromBufferReader(br);
};

Transaction.prototype.toBufferWriter = function(bw) {
  var data = new Buffer(JSON.stringify(this.toObject()));
  bw.writeUInt64LEBN(new BN(data.length, 10));
  bw.write(data);
  return bw;
};

Transaction.prototype.toBuffer = function() {
  var bw = new BufferWriter();
  this.toBufferWriter(bw);
  return bw.concat();
};

Transaction.prototype.toObject = function() {
  return {
    diffs: this.diffs
  };
};

Transaction.prototype.getHash = function getHash() {
  var sha256 = crypto.createHash('sha256');
  sha256.update(this.toBuffer());
  var hashBuffer = new Buffer(sha256.digest('hex'), 'hex');
  return hashBuffer;
};

Transaction.manyToBuffer = function(transactions) {
  var bw = new BufferWriter();
  var count = transactions.length;
  for(var i = 0; i < count; i++) {
    transactions[i].toBufferWriter(bw);
  }
  return bw.concat();
};

var hashProperty = {
  configurable: false,
  writeable: false,
  /**
   * @returns {string} - The big endian hash buffer of the header
   */
  get: function() {
    var hash = this.getHash();
    return hash.toString('hex');
  },
  set: function() {}
};

Object.defineProperty(Transaction.prototype, 'hash', hashProperty);
Object.defineProperty(Transaction.prototype, 'id', hashProperty);

module.exports = Transaction;
