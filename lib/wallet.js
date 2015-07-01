'use strict';

var bitcore = require('bitcore');
var async = require('async');
var chainlib = require('./');
var log = chainlib.log;
var errors = chainlib.errors;

function Wallet(options) {
  this.utxos = options.utxos || [];
  this.hdPrivateKey = bitcore.HDPrivateKey.fromString(options.xprivkey);
  this.network = options.network;
  this.addresses = {};
}

Wallet.prototype.getNextPrivateKey = function() {
  var hdCounter = Object.keys(this.addresses).length;
  var derived = this.hdPrivateKey.derive(hdCounter);
  return derived.privateKey;
};

Wallet.prototype.getAddress = function() {
  return this.hdPrivateKey.derive(0).privateKey.toAddress(this.network);
};

Wallet.prototype.getUnspentOutputsForAddress = function(address, callback) {
  throw new Error('Not implemented');
};

Wallet.prototype.updateUnspentOutputs = function(callback) {

  var self = this;
  var lastAddressFound = false;

  self.utxos = [];
  self.addresses = {};

  async.doWhilst(function loop(next) {
    var privateKey = self.getNextPrivateKey();
    var address = privateKey.toAddress(self.network);

    self.getUnspentOutputsForAddress(address, function(err, utxos) {
      if (err instanceof errors.NoOutputs) {
        lastAddressFound = true;
        return next();
      } else if (err) {
        return next(err);
      }

      // add to available addresses
      self.addresses[address] = privateKey;

      // add utxos to our total
      self.utxos = self.utxos.concat(utxos);

      next();

    });
  }, function test() {
    return !lastAddressFound;
  }, callback);

};

Wallet.prototype.selectUnspentOutputs = function(amount) {
  var srcUtxos = this.utxos;

  var utxos = [];
  var totalInputs = 0;
  var usedPrevTxIds = [];

  for(var i = 0; i < this.utxos.length; i++) {
    srcUtxos = this.sortUnspentOutputs(amount - totalInputs, usedPrevTxIds);
    if (!srcUtxos.length) {
      break;
    }
    var utxo = srcUtxos[0];

    if (!this.addresses.hasOwnProperty(utxo.address)) {
      throw new Error(
        'Unexpected unspent output with address "' + utxo.address + '", unknown private key.'
      );
    }

    var privateKey = this.addresses[utxo.address];
    utxo.privateKey = privateKey;
    utxos.push(utxo);

    var txId = utxo.txId || utxo.txid;
    usedPrevTxIds.push(txId);

    var utxoSatoshis = Number(utxo.satoshis);

    if (!utxo.satoshis && utxo.amount) {
      utxoSatoshis = Number(utxo.amount) * 100000000;
    }

    totalInputs += utxoSatoshis;

    if(totalInputs >= amount) {
      break;
    }
  }

  if (totalInputs < amount) {
    var addresses = Object.keys(this.addresses);
    throw new errors.Wallet.InsufficientFunds(
      'Insufficient funds, please send funds to: ' + addresses[0]
    );
  }

  return utxos;
};

Wallet.prototype.sortUnspentOutputs = function(amount, usedPrevTxIds) {
  var utxos = this.utxos.slice(0);
  if (!usedPrevTxIds) {
    usedPrevTxIds = [];
  }

  function removeUsed(a) {
    var txId = a.txid || a.txId;
    if (~usedPrevTxIds.indexOf(txId)) {
      return false;
    }
    return true;
  }

  utxos = utxos.filter(removeUsed);

  // Rate outputs based on how close they are to amount
  utxos.forEach(function(utxo) {
    var satoshis;
    if (utxo.satoshis) {
      satoshis = Number(utxo.satoshis);
    } else if (utxo.amount) {
      satoshis = Number(utxo.amount) * 100000000;
    }
    if (!satoshis || Number.isNaN(satoshis)) {
      throw new TypeError('Unspent output amount is undefined or NaN');
    }
    utxo.rating = Math.abs(amount - satoshis);
  });

  // Sort based on rating
  utxos.sort(function(a, b) {
    return a.rating > b.rating;
  });

  return utxos;
};

module.exports = Wallet;
