'use strict';

var createError = require('errno').create;

var ChainLibError = createError('ChainLibError');
var NoOutputs = createError('NoOutputs', ChainLibError);

var Wallet = createError('WalletError', ChainLibError);
Wallet.InsufficientFunds = createError('InsufficientFunds', Wallet);

var Consensus = createError('Consensus', ChainLibError);
Consensus.BlockExists = createError('BlockExists', Consensus);

module.exports = {
  Error: ChainLibError,
  NoOutputs: NoOutputs,
  Wallet: Wallet,
  Consensus: Consensus
};
