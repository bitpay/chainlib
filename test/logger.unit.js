'use strict';

var should = require('chai').should();
var sinon = require('sinon');

var chaindb = require('../');
var log = chaindb.log;

describe('Logger', function() {

  it('should have info, error, debug, warn', function() {
    var types = ['info', 'error', 'debug', 'warn'];
    types.forEach(function(type) {
      should.exist(log[type]);
    });
  });

  it('should output for each type', function() {
    var oldEnv = process.env.NODE_ENV;
    var cl = sinon.stub(console, 'log');
    process.env.NODE_ENV = 'nontest';

    var types = ['info', 'error', 'debug', 'warn'];
    types.forEach(function(type) {
      log[type]('hello, world');
    });

    cl.callCount.should.equal(4);
    cl.restore();
    process.env.NODE_ENV = oldEnv;
  });

  it('should be silent for non-test env', function() {
    var oldEnv = process.env.NODE_ENV;
    var cl = sinon.stub(console, 'log');
    process.env.NODE_ENV = 'nontest';

    log.debug('this is a test');

    cl.callCount.should.equal(1);
    cl.restore();
    process.env.NODE_ENV = oldEnv;
  });

  it('should be silent for test env', function() {
    var oldEnv = process.env.NODE_ENV;
    var cl = sinon.stub(console, 'log');
    process.env.NODE_ENV = 'test';

    log.debug('this is a test');

    cl.callCount.should.equal(0);
    cl.restore();
    process.env.NODE_ENV = oldEnv;
  });

});
