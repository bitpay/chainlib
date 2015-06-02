'use strict';

var bitcore = require('bitcore');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var Hash = bitcore.crypto.Hash;

function Block(obj) {
  /* jshint maxstatements: 18 */
  if (!(this instanceof Block)) {
    return new Block(obj);
  }

  this.version = obj.version || 1;
  this.prevHash = obj.prevHash;

  if (!obj.hasOwnProperty('prevHash')) {
    throw new TypeError('"prevHash" is expected');
  }
  if (!obj.timestamp) {
    throw new TypeError('"timestamp" is expected');
  }
  this.timestamp = obj.timestamp;
  if (typeof this.timestamp === 'string') {
    this.timestamp = new Date(obj.timestamp);
  }

  this.merkleRoot = obj.merkleRoot;

  if (obj.data) {
    if (!Buffer.isBuffer(obj.data)) {
      throw new TypeError('"data" is expected to be a buffer');
    }
    this.data = obj.data;
  } else {
    this.data = new Buffer(0);
  }
  
  var hashProperty = {
    configurable: false,
    enumerable: true,
    get: function() {
      return this.getHash();
    },
    set: function() {}
  };

  Object.defineProperty(this, 'hash', hashProperty);
  
  return this;
}

Block.fromBuffer = function(buffer) {
  var br = new BufferReader(buffer);
  var obj = {};
  obj.version = br.readUInt32LE();
  obj.prevHash = BufferReader(br.read(32)).readReverse().toString('hex');
  var nullHash = new Buffer(Array(32)).toString('hex');
  if (obj.prevHash === nullHash) {
    obj.prevHash = null;
  }
  obj.merkleRoot = BufferReader(br.read(32)).readReverse().toString('hex');
  if (obj.merkleRoot === nullHash) {
    obj.merkleRoot = null;
  }
  var timestamp = br.readUInt32LE();
  obj.timestamp = new Date(timestamp * 1000);
  obj.data = br.readAll();
  return new Block(obj);
};

Block.prototype.validate = function(chain, callback) {
  var self = this;

  // Make sure block is building off of another block we have seen
  chain.db.getBlock(self.prevHash, function(err, block) {
    if(err) {
      return callback(err);
    }

    // Validate timestamp
    if (!block.timestamp) {
      return callback(new Error('Block timestamp is required'));
    }
    // Validate block data
    chain.db.validateBlockData(self, callback);
  });
};

Block.prototype.headerToBuffer = function() {
  var bw = new BufferWriter();
  this.headerToBufferWriter(bw);
  return bw.concat();
};

Block.prototype.headerToBufferWriter = function(bw) {
  // version
  bw.writeUInt32LE(this.version);

  // prevhash
  if (!this.prevHash) {
    bw.write(new Buffer(Array(32)));
  } else {
    var prevHashBuffer = new Buffer(this.prevHash, 'hex');
    prevHashBuffer = BufferReader(prevHashBuffer).readReverse();
    if (prevHashBuffer.length !== 32) {
      throw new Error('"prevHash" is expected to be 32 bytes');
    }
    bw.write(prevHashBuffer);
  }

  // merkleroot
  if (!this.merkleRoot) {
    bw.write(new Buffer(Array(32)));
  } else {
    var merkleRoot = new Buffer(this.merkleRoot, 'hex');
    merkleRoot = BufferReader(merkleRoot).readReverse();
    if (merkleRoot.length !== 32) {
      throw new Error('"merkleRoot" is expected to be 32 bytes');
    }
    bw.write(merkleRoot);
  }

  // timestamp
  bw.writeUInt32LE(Math.floor(this.timestamp.getTime() / 1000));
  return bw;
};

Block.prototype.toObject = function() {
  return {
    version: this.version,
    prevHash: this.prevHash,
    merkleRoot: this.merkleRoot,
    timestamp: this.timestamp.toISOString(),
    data: this.data.toString('hex'),
    hash: this.hash
  };
};

Block.prototype.toBufferWriter = function(bw) {
  // header
  this.headerToBufferWriter(bw);

  // transaction data
  bw.write(this.data);
  return bw;
};

Block.prototype.toBuffer = function() {
  var bw = new BufferWriter();
  this.toBufferWriter(bw);
  return bw.concat();
};

Block.prototype.getHash = function() {
  var hashBuffer = BufferReader(Hash.sha256sha256(this.headerToBuffer())).readReverse();
  var hash = hashBuffer.toString('hex');
  return hash;
};

module.exports = Block;
