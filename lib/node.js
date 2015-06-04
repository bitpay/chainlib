'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var bitcore = require('bitcore');
var Networks = bitcore.Networks;
var _ = bitcore.deps._;

function Node(config) {
  if(!(this instanceof Node)) {
    return new Node(config);
  }

  this.db = null;
  this.chain = null;
  this.p2p = null;
  this.network = null;

  this._loadConfiguration(config);
  this._initialize();
}

util.inherits(Node, EventEmitter);

Node.prototype._loadConfiguration = function(config) {
  this._loadNetwork(config);
  this._loadDB(config);
  this._loadAPI();
  this._loadConsensus(config);
  this._loadP2P(config);
};

Node.prototype._loadNetwork = function(config) {
  if(config.network) {
    Networks.add(config.network);
    this.network = Networks.get(config.network.name);
  }
};

Node.prototype._loadDB = function(config) {
  var Database = require('./db');
  config.db.network = this.network;
  this.db = new Database(config.db);
};

Node.prototype._loadP2P = function(config) {
  var P2P = require('./p2p');

  if (!config.p2p) {
    config.p2p = {};
  }

  config.p2p.network = this.network;
  config.p2p.Transaction = this.db.Transaction;
  config.p2p.Block = this.Block;
  this.p2p = new P2P(config.p2p);
};

Node.prototype._loadConsensus = function(config) {

  var Chain = require('./chain');
  this.Block = require('./block');

  var genesisBlock = config.genesis;
  if (_.isString(genesisBlock)) {
    genesisBlock = this.Block.fromBuffer(new Buffer(genesisBlock, 'hex'));
  }

  // pass genesis to chain
  config.consensus.genesis = genesisBlock;
  this.chain = new Chain(config.consensus);
};

Node.prototype._loadAPI = function() {
  var self = this;

  var methodData = self.db.getAPIMethods();
  methodData.forEach(function(data) {
    var name = data[0];
    var instance = data[1];
    var method = data[2];

    self[name] = function() {
      return method.apply(instance, arguments);
    };
  });
};

Node.prototype._initialize = function() {
  var self = this;

  // Add references
  // DB
  this.db.chain = this.chain;
  this.db.Block = this.Block;

  // Chain
  this.chain.db = this.db;
  this.chain.p2p = this.p2p;

  // P2P
  this.p2p.db = this.db;
  this.p2p.chain = this.chain;

  setImmediate(function() {
    self.db.initialize();
  });

  this.db.on('ready', function() {
    self.chain.initialize();
  });

  this.db.on('error', function(err) {
    self.emit('error', err);
  });

  this.chain.on('ready', function() {
    self.p2p.initialize();
  });

  this.chain.on('error', function(err) {
    self.emit('error', err);
  });

  this.p2p.on('ready', function() {
    self.emit('ready');
  });

  this.p2p.on('error', function(err) {
    self.emit('error', err);
  });
};

module.exports = Node;
