// utilities
module.exports.errors = require('./errors');
module.exports.utils = require('./utils');

var Logger = require('./logger');
module.exports.log = new Logger('chainlib');