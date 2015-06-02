'use strict';

var async = require('async');
var chainlib = require('./');
var log = chainlib.log;

var Reorg = function(chain, newTip, oldTip, newTipWeight) {
  this.chain = chain;
  this.db = chain.db;
  this.newTip = newTip;
  this.oldTip = oldTip;
  this.newTipWeight = newTipWeight;

  this.oldChain = [oldTip];
  this.newChain = [newTip];
  this.commonAncestor = null;
  this.commonAncestorOldChainPosition = null;
  this.commonAncestorNewChainPosition = null;
  this.height = oldTip.__height;
};

Reorg.prototype.go = function(callback) {
  var self = this;

  self.getBlocks(function(err) {
    if(err) {
      return callback(err);
    }

    async.series(
      [
        self.removeBlocks.bind(self),
        self.addBlocks.bind(self)
      ],
      function(err) {
        if(err) {
          return callback(err);
        }

        self.chain.tip = self.newTip;
        self.chain.tipWeight = self.newTipWeight;
        self.chain.saveMetadata();

        self.chain.emit('reorg');
        callback();
    });
  });
};

Reorg.prototype.findCommonAncestor = function() {
  for(var i = 0; i < this.oldChain.length; i++) {
    for(var j = 0; j < this.newChain.length; j++) {
      if(this.oldChain[i].hash === this.newChain[j].hash) {
        this.commonAncestorOldChainPosition = i;
        this.commonAncestorNewChainPosition = j;
        this.commonAncestor = this.oldChain[i];
        break;
      }
    }

    if(this.commonAncestor) {
      break;
    }
  }
};

Reorg.prototype.getBlocks = function(callback) {
  var self = this;

  var newBlock = self.newTip;
  var oldBlock = self.oldTip;

  async.whilst(
    function() {
      return !self.commonAncestor;
    },
    function(next) {
      async.series(
        [
          function getNextNewBlock(next) {
            if(newBlock.prevHash) {
              self.db.getBlock(newBlock.prevHash, function(err, block) {
                if(err) {
                  return next(err);
                }
                self.newChain.push(block);
                newBlock = block;
                next();
              });
            } else {
              return next();
            }
          },
          function getNextOldBlock(next) {
            if(oldBlock.prevHash) {
              self.db.getBlock(oldBlock.prevHash, function(err, block) {
                if(err) {
                  return next(err);
                }
                self.oldChain.push(block);
                oldBlock = block;
                next();
              });
            } else {
              return next();
            }
          }
        ], function(err) {
          if(err) {
            return next(err);
          }

          self.findCommonAncestor();
          next();
        }
      );
    },
    callback
  );
};

Reorg.prototype.removeBlocks = function(callback) {
  var self = this;

  var i = 0;
  async.whilst(
    function() {
      return i < self.commonAncestorOldChainPosition;
    },
    function(next) {
      self.removeBlock(self.oldChain[i], function(err) {
        if(err) {
          return next(err);
        }
        i++;
        next();
      });
    },
    callback
  );
};

Reorg.prototype.addBlocks = function(callback) {
  var self = this;

  var i = self.commonAncestorNewChainPosition - 1;
  async.whilst(
    function() {
      return i >= 0;
    },
    function(next) {
      self.addBlock(self.newChain[i], function(err) {
        if(err) {
          log.error('Reorg failed. Rolling back blocks.');
          self.revert(i, function(err2) {
            if(err2) {
              // This should never happen
              log.error('Rolling back blocks failed!', err2);
              throw err2;
            }
            next(err);
          });
        } else {
          i--;
          next();
        }
      });
    },
    callback
  );
};


Reorg.prototype.revert = function(i, callback) {
  async.series(
    [
      this.rollBack.bind(this, i),
      this.rollForward.bind(this)
    ],
    callback
  );
};

Reorg.prototype.rollBack = function(i, callback) {
  var self = this;

  async.whilst(
    function() {
      return i < self.commonAncestorNewChainPosition;
    },
    function(next) {
      self.removeBlock(self.newChain[i], function(err) {
        if(err) {
          return next(err);
        }
        i++;
        next();
      });
    },
    callback
  );
};

Reorg.prototype.rollForward = function(callback) {
  var self = this;

  var i = self.commonAncestorOldChainPosition - 1;
  async.whilst(
    function() {
      return i >= 0;
    },
    function(next) {
      self.addBlock(self.oldChain[i], function(err) {
        if(err) {
          return next(err);
        }
        i--;
        next();
      });
    },
    callback
  );
};

Reorg.prototype.removeBlock = function(block, callback) {
  var self = this;

  block.__height = self.height;

  self.db._onChainRemoveBlock(block, function(err) {
    if(err) {
      return callback(err);
    }
    self.chain.emit('removeblock', block);
    self.height--;
    callback();
  });
};

Reorg.prototype.addBlock = function(block, callback) {
  var self = this;

  self.height++;
  block.__height = self.height;

  async.series(
    [
      self.chain._validateBlock.bind(self.chain, block),
      self.db._onChainAddBlock.bind(self.db, block),
    ],
    function(err) {
      if(err) {
        return callback(err);
      }

      self.chain.emit('addblock', block);
      callback();
    }
  );
};

module.exports = Reorg;
