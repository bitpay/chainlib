'use strict';

var chai = require('chai');
var should = chai.should();
var sinon = require('sinon');
var chainlib = require('../');
var Wallet = chainlib.Wallet;
var fakeData = require('./data/wallet.json');
var bitcore = require('bitcore');
var errors = chainlib.errors;

describe('Base Wallet', function() {

  var utxos;
  var xprivkey = fakeData.xprivkey;

  function mockedUnspent(address, callback) {
    var unspents = utxos[address];
    if (!unspents) {
      var error = new errors.NoOutputs('No transactions for this address');
      return callback(error);
      }
    callback(null, unspents);
  }

  before(function() {
    utxos = {};
    sinon.stub(Wallet.prototype, 'getUnspentOutputsForAddress', mockedUnspent);
  });

  after(function() {
    Wallet.prototype.getUnspentOutputsForAddress.restore();
  });

  describe('#getNextPrivateKey', function() {
    it('should increment to the next private key', function() {

      utxos = {
        mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2101410a38d46ae0874f74846f2e1',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 800000
          },
          {
            txid : 'a0a08e397203df68392ee95b3f08b0b3b3e2301410a38d46ae0874f74846f2e2',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10000
          }
        ],
        mgnJEhwm2LwxaUUSBEvxqzzwwx6T4RRZMp: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2001410a38d46ae0874f74846f2e1',
            outputIndex : 0,
            address : 'mgnJEhwm2LwxaUUSBEvxqzzwwx6T4RRZMp',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10000
          }
        ]
      };

      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      var privateKey = wallet.getNextPrivateKey();
      privateKey.should.be.an.instanceof(bitcore.PrivateKey);
    });

  });

  describe('#getUnspentOutputsForAddress', function() {
    before(function() {
      Wallet.prototype.getUnspentOutputsForAddress.restore();
    });
    after(function() {
      sinon.stub(Wallet.prototype, 'getUnspentOutputsForAddress', mockedUnspent);
    });
    it('should throw error', function() {
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      (function() {
        wallet.getUnspentOutputsForAddress();
      }).should.throw('Not implemented');
    });
  });

  describe('#updateUnspentOutputs', function() {

    it('will update unspent outputs', function(done) {
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      wallet.updateUnspentOutputs(function(err) {
        should.not.exist(err);
        wallet.utxos.length.should.equal(2);
        var address = Object.keys(wallet.addresses)[0];
        wallet.utxos[0].address.should.equal(address);
        done();
      });
    });

  });

  describe('#selectUnspentOutputs', function() {

    it('should get the unspent outputs and the keys for them', function(done) {
      var wallet = new Wallet({
        xprivkey: xprivkey
      });

      wallet.updateUnspentOutputs(function(err) {
        should.not.exist(err);
        var utxos = wallet.selectUnspentOutputs(80000);
        utxos.length.should.equal(2);
        done();
      });

    });

    it('should throw an error when there are insufficient funds', function() {
      utxos = {
        mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10,
            hdCount: 0
          }
        ]
      };
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      (function(){
        wallet.selectUnspentOutputs(110000);
      }).should.throw('Insufficient funds');
    });

    it('should throw an error when unspent value is not-a-number', function() {
      var wallet = new Wallet({
        xprivkey: xprivkey,
        utxos: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 'not an number',
            hdCount: 0
          }
        ]
      });
      (function(){
        wallet.selectUnspentOutputs(110000);
      }).should.throw('Unspent output amount is undefined or NaN');
    });

    it('should throw an error when unspent value is empty', function() {
      var wallet = new Wallet({
        xprivkey: xprivkey,
        utxos: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            hdCount: 0
          }
        ] // missing amount and satoshis
      });
      (function(){
        wallet.selectUnspentOutputs(110000);
      }).should.throw('Unspent output amount is undefined or NaN');
    });

    it('should error with utxos and addresses mismatch', function() {
      var wallet = new Wallet({xprivkey: xprivkey});
      wallet.utxos = [
        {
          txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
          outputIndex : 0,
          address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
          script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
          satoshis : 1200000
        }
      ];
      wallet.addresses = {
        mgnJEhwm2LwxaUUSBEvxqzzwwx6T4RRZMp: ''
      };
      (function(){
        wallet.selectUnspentOutputs(110000);
      }).should.throw('Unexpected unspent output with address');
    });

    it('should error with insufficient value', function() {
      utxos = {
        'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha': [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10000,
            hdCount: 0
          }
        ]
      };
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      (function(){
        wallet.selectUnspentOutputs(10001);
      }).should.throw('Insufficient funds');
    });

    it('should handle lowercase txid and duplicate inputs', function() {
      utxos = {
        'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha': [
          {
            txid : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10000,
            hdCount: 0
          },
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9', // duplicate tx
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            satoshis : 10000,
            hdCount: 1
          }
        ]
      };
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      (function(){
        wallet.selectUnspentOutputs(10001);
      }).should.throw('Insufficient funds');
    });

    it('should corrently caluculate satoshis from amount for rating', function(done) {
      utxos = {
        mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha: [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            amount : 1
          }
        ]
      };
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      wallet.updateUnspentOutputs(function(err) {
        var unspents = wallet.selectUnspentOutputs(110000);
        unspents[0].rating.should.equal(99890000);
        done();
      });
    });

    it('should select the best utxo', function(done) {
      utxos = {
        mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha : [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2e9',
            outputIndex : 0,
            address : 'mv7aNQh6soUFysgh1Ax82BKBTyf1V4qWha',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            amount : 1
          }
        ],
        mzso6uXxfDCq4L6xAffUD9BPWo6bdFBZ2L : [
          {
            txId : 'a0a08e397203df68392ee95b3f08b0b3b3e2401410a38d46ae0874f74846f2ef',
            outputIndex : 0,
            address : 'mzso6uXxfDCq4L6xAffUD9BPWo6bdFBZ2L',
            script : '76a914089acaba6af8b2b4fb4bed3b747ab1e4e60b496588ac',
            amount : 1.1
          }
        ]
      };
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      wallet.updateUnspentOutputs(function(err) {
        var unspents = wallet.selectUnspentOutputs(100000000);
        unspents[0].amount.should.equal(1);
        done();
      });
    });
  });

  describe('#sortUnspentOutputs', function() {
    it('sort the outputs by difference to amount - take 1', function(done) {
      utxos = fakeData.utxos;
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      wallet.updateUnspentOutputs(function(err) {
        should.not.exist(err);
        var utxos = wallet.sortUnspentOutputs(40000);
        utxos[0].satoshis.should.equal(30000);
        done();
      });
    });
    it('sort the outputs by difference to amount - take 2', function(done) {
      var utxos = fakeData.utxos;
      var wallet = new Wallet({
        xprivkey: xprivkey
      });
      wallet.updateUnspentOutputs(function(err) {
        should.not.exist(err);
        var utxos = wallet.sortUnspentOutputs(80000);
        utxos[0].satoshis.should.equal(70000);
        done();
      });
    });

  });

});
