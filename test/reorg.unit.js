var sinon = require('sinon');
var should = require('chai').should();
var EventEmitter = require('events').EventEmitter;
var Reorg = require('../lib/reorg');

describe('Reorg', function() {

  var fork1 = [
    {hash: 'genesis',},
    {prevHash: 'genesis', hash: 'fork1a'},
    {prevHash: 'fork1a', hash: 'fork1b', __height: 2},
  ];
  var fork2 = [
    {hash: 'genesis',},
    {prevHash: 'genesis', hash: 'fork2a'},
    {prevHash: 'fork2a', hash: 'fork2b'},
    {prevHash: 'fork2b', hash: 'fork2c', __height: 3}
  ];

  var oldChain = [fork1[2], fork1[1], fork1[0]];
  var newChain = [fork2[3], fork2[2], fork2[1], fork2[0]];

  var db = {
    getBlock: function(hash, callback) {
      var i;
      for(i = 0; i < fork1.length; i++) {
        if(fork1[i].hash === hash) {
          return callback(null, fork1[i]);
        }
      }

      for(i = 0; i < fork2.length; i++) {
        if(fork2[i].hash === hash) {
          return callback(null, fork2[i]);
        }
      }

      return callback(new Error('block not found'));
    },
    _onChainAddBlock: sinon.stub().callsArg(1),
    _onChainRemoveBlock: sinon.stub().callsArg(1)
  };

  describe('end to end tests', function() {
    it('should process a reorg correctly', function(done) {
      var chain = new EventEmitter();
      chain._validateBlock = sinon.stub().callsArg(1);
      chain.saveMetadata = sinon.spy();
      chain.db = db;
      chain.tip = fork1[2];
      var removeBlockCount = 0;
      var addBlockCount = 0;

      chain.on('removeblock', function(block) {
        removeBlockCount++;
        switch(removeBlockCount) {
          case 1:
            block.hash.should.equal('fork1b');
            block.__height.should.equal(2);
            break;
          case 2:
            block.hash.should.equal('fork1a');
            block.__height.should.equal(1);
            break;
        }
      });

      chain.on('addblock', function(block) {
        addBlockCount++;
        switch(addBlockCount) {
          case 1:
            block.hash.should.equal('fork2a');
            block.__height.should.equal(1);
            break;
          case 2:
            block.hash.should.equal('fork2b');
            block.__height.should.equal(2);
            break;
          case 3:
            block.hash.should.equal('fork2c');
            block.__height.should.equal(3);
            break;
        }
      });

      var reorg = new Reorg(chain, fork2[3], fork1[2], 0);

      reorg.go(function(err) {
        should.not.exist(err);
        chain.tip.should.equal(fork2[3]);
        chain.tip.__height.should.equal(3);
        removeBlockCount.should.equal(2);
        addBlockCount.should.equal(3);
        done();
      });
    });

    it('should revert a reorg if validation fails', function(done) {
      var chain = new EventEmitter();
      chain._validateBlock = function(block, callback) {
        if(block.hash === 'fork2c') {
          return callback(new Error('validationError'));
        }

        callback();
      };

      chain.saveMetadata = sinon.spy();
      chain.db = db;
      chain.tip = fork1[2];
      var removeBlockCount = 0;
      var addBlockCount = 0;

      chain.on('removeblock', function(block) {
        removeBlockCount++;
        switch(removeBlockCount) {
          case 1:
            block.hash.should.equal('fork1b');
            block.__height.should.equal(2);
            break;
          case 2:
            block.hash.should.equal('fork1a');
            block.__height.should.equal(1);
            break;
          case 3:
            block.hash.should.equal('fork2c');
            block.__height.should.equal(3);
            break;
          case 4:
            block.hash.should.equal('fork2b');
            block.__height.should.equal(2);
            break;
          case 5:
            block.hash.should.equal('fork2a');
            block.__height.should.equal(1);
            break;
        }
      });

      chain.on('addblock', function(block) {
        addBlockCount++;
        switch(addBlockCount) {
          case 1:
            block.hash.should.equal('fork2a');
            block.__height.should.equal(1);
            break;
          case 2:
            block.hash.should.equal('fork2b');
            block.__height.should.equal(2);
            break;
          case 3:
            block.hash.should.equal('fork1a');
            block.__height.should.equal(1);
            break;
          case 4:
            block.hash.should.equal('fork1b');
            block.__height.should.equal(2);
            break;
        }
      });

      var reorg = new Reorg(chain, fork2[3], fork1[2], 0);

      reorg.go(function(err) {
        should.exist(err);
        err.message.should.equal('validationError');
        chain.tip.should.equal(fork1[2]);
        removeBlockCount.should.equal(5);
        addBlockCount.should.equal(4);
        done();
      });
    });
  });

  describe('#go', function() {
    var chain = new EventEmitter();
    chain.saveMetadata = sinon.spy();
    var reorg = new Reorg(chain, {}, {__height: 1}, 0);
    reorg.getBlocks = sinon.stub().callsArg(0);
    reorg.removeBlocks = sinon.stub().callsArg(0);
    reorg.addBlocks = sinon.stub().callsArg(0);

    it('should make the chain emit reorg if no errors occurred', function(done) {
      chain.once('reorg', function() {
        done();
      });
      reorg.go(function(err) {
        should.not.exist(err);
      });
    });

    it('should give an error if the series has an error', function(done) {
      reorg.addBlocks = sinon.stub().callsArgWith(0, new Error('addBlocksError'));
      reorg.go(function(err) {
        should.exist(err);
        err.message.should.equal('addBlocksError');
        done();
      });
    });

    it('should give an error if getBlocks has an error', function(done) {
      reorg.getBlocks = sinon.stub().callsArgWith(0, new Error('getBlocksError'));
      reorg.go(function(err) {
        should.exist(err);
        err.message.should.equal('getBlocksError');
        done();
      });
    });
  });

  describe('#findCommonAncestor', function() {
    it('should set commonAncestor to the common ancestor if it finds one', function() {
      var reorg = new Reorg({}, fork2[3], fork1[2], 0);
      reorg.newChain = newChain;
      reorg.oldChain = oldChain;
      reorg.findCommonAncestor();
      should.exist(reorg.commonAncestor);
      reorg.commonAncestor.hash.should.equal('genesis');
    });
  });

  describe('#getBlocks', function() {
    var chain = {
      db: db
    };

    it('should build out newChain and oldChain until a common ancestor is found', function(done) {
      var reorg = new Reorg(chain, fork2[3], fork1[2], 0);
      reorg.getBlocks(function(err) {
        should.not.exist(err);
        reorg.newChain.length.should.equal(4);
        reorg.oldChain.length.should.equal(3);
        done();
      });
    });

    it('should build out newChain and oldChain where newChain has fewer blocks', function(done) {
      // this is possible if the weight of the new chain is heavier even if it doesn't have as many blocks
      var reorg = new Reorg(chain, fork1[2], fork2[3], 0);
      reorg.getBlocks(function(err) {
        should.not.exist(err);
        reorg.newChain.length.should.equal(3);
        reorg.oldChain.length.should.equal(4);
        done();
      });
    });

    it('should give an error if first getBlock gives an error', function(done) {
      sinon.stub(db, 'getBlock').callsArgWith(1, new Error('getBlock1Error'));
      var reorg = new Reorg(chain, fork2[3], fork1[2], 0);
      reorg.getBlocks(function(err) {
        should.exist(err);
        err.message.should.equal('getBlock1Error');
        db.getBlock.restore();
        done();
      });
    });

    it('should give an error if second getBlock gives an error', function(done) {
      var stub = sinon.stub(db, 'getBlock');
      stub.onFirstCall().callsArg(1);
      stub.onSecondCall().callsArgWith(1, new Error('getBlock2Error'));
      var reorg = new Reorg(chain, fork2[3], fork1[2], 0);
      reorg.getBlocks(function(err) {
        should.exist(err);
        err.message.should.equal('getBlock2Error');
        db.getBlock.restore();
        done();
      });
    });
  });

  describe('#removeBlocks', function() {
    it('should keep calling removeBlock until commonAncestorOldChainPosition is reached', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.removeBlock = sinon.stub().callsArg(1);
      reorg.commonAncestorOldChainPosition = 2;
      reorg.removeBlocks(function(err) {
        should.not.exist(err);
        reorg.removeBlock.callCount.should.equal(2);
        done();
      });
    });

    it('should give an error if removeBlock gives an error', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.removeBlock = sinon.stub().callsArgWith(1, new Error('removeBlockError'));
      reorg.commonAncestorOldChainPosition = 2;
      reorg.removeBlocks(function(err) {
        should.exist(err);
        err.message.should.equal('removeBlockError');
        reorg.removeBlock.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#addBlocks', function() {
    it('should keep calling addBlock until condition is met', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.addBlock = sinon.stub().callsArg(1);
      reorg.commonAncestorNewChainPosition = 3;
      reorg.addBlocks(function(err) {
        should.not.exist(err);
        reorg.addBlock.callCount.should.equal(3);
        done();
      });
    });

    it('should revert if error occurs', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.addBlock = sinon.stub().callsArgWith(1, new Error('addBlockError'));
      reorg.revert = sinon.stub().callsArg(1);
      reorg.commonAncestorNewChainPosition = 3;
      reorg.addBlocks(function(err) {
        should.exist(err);
        err.message.should.equal('addBlockError');
        done();
      });
    });

    it('should throw an error if revert fails', function() {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.addBlock = sinon.stub().callsArgWith(1, new Error('addBlockError'));
      reorg.revert = sinon.stub().callsArgWith(1, new Error('revertError'));
      reorg.commonAncestorNewChainPosition = 3;
      (function() {
        reorg.addBlocks();
      }).should.throw('revertError');
    });
  });

  describe('#revert', function() {
    it('should call each function', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.rollBack = sinon.stub().callsArg(1);
      reorg.rollForward = sinon.stub().callsArg(0);
      reorg.revert(0, function(err) {
        should.not.exist(err);
        reorg.rollBack.called.should.equal(true);
        reorg.rollForward.called.should.equal(true);
        done();
      });
    });
  });

  describe('#rollBack', function() {
    it('should keep calling removeBlock until condition is met', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.removeBlock = sinon.stub().callsArg(1);
      reorg.commonAncestorNewChainPosition = 3;
      reorg.rollBack(1, function(err) {
        should.not.exist(err);
        reorg.removeBlock.callCount.should.equal(2);
        done();
      });
    });

    it('should give an error if removeBlock gives an error', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.removeBlock = sinon.stub().callsArgWith(1, new Error('removeBlockError'));
      reorg.commonAncestorNewChainPosition = 3;
      reorg.rollBack(1, function(err) {
        should.exist(err);
        err.message.should.equal('removeBlockError');
        reorg.removeBlock.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#rollForward', function() {
    it('should keep calling addBlock until condition is met', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.addBlock = sinon.stub().callsArg(1);
      reorg.commonAncestorOldChainPosition = 2;
      reorg.rollForward(function(err) {
        should.not.exist(err);
        reorg.addBlock.callCount.should.equal(2);
        done();
      });
    });

    it('should give an error if addBlock gives an error', function(done) {
      var reorg = new Reorg({}, {}, {__height: 1});
      reorg.addBlock = sinon.stub().callsArgWith(1, new Error('addBlockError'));
      reorg.commonAncestorOldChainPosition = 2;
      reorg.rollForward(function(err) {
        should.exist(err);
        err.message.should.equal('addBlockError');
        reorg.addBlock.callCount.should.equal(1);
        done();
      });
    });
  });

  describe('#removeBlock', function() {
    var chain = new EventEmitter();
    chain.db = db;
    var reorg = new Reorg(chain, null, {__height: 1});

    it('should make chain emit removeblock if no errors occur', function(done) {
      chain.once('removeblock', function() {
        done();
      });

      reorg.removeBlock({}, function(err) {
        should.not.exist(err);
      });
    });

    it('should give an error if _onChainRemoveBlock gives an error', function(done) {
      db._onChainRemoveBlock = sinon.stub().callsArgWith(1, new Error('error'));

      reorg.removeBlock({}, function(err) {
        should.exist(err);
        err.message.should.equal('error');
        db._onChainRemoveBlock = sinon.stub().callsArg(1);
        done();
      });
    });
  });

  describe('#addBlock', function() {
    var chain = new EventEmitter();
    chain.db = db;
    chain._validateBlock = sinon.stub().callsArg(1);
    chain.db._onChainAddBlock.reset();
    var reorg = new Reorg(chain, null, {__height: 1});

    it('should make chain emit addblock if no errors occur', function(done) {
      chain.once('addblock', function() {
        chain._validateBlock.called.should.equal(true);
        db._onChainAddBlock.called.should.equal(true);
        done();
      });

      reorg.addBlock({}, function(err) {
        should.not.exist(err);
      });
    });

    it('should give an error if the series gives an error', function(done) {
      chain._validateBlock = sinon.stub().callsArgWith(1, new Error('validateError'));

      reorg.addBlock({}, function(err) {
        should.exist(err);
        err.message.should.equal('validateError');
        done();
      });
    });
  });
});
