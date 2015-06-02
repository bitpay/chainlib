ChainLib
=======
[![Build Status](https://img.shields.io/travis/bitpay/chainlib.svg?branch=master&style=flat-square)](https://travis-ci.org/bitpay/chainlib)
[![Coverage Status](https://img.shields.io/coveralls/bitpay/chainlib.svg?style=flat-square)](https://coveralls.io/r/bitpay/chainlib)

A library for building chain based databases.

## Getting Started

### Install

```bash
git clone git@github.com:bitpay/chainlib.git
cd chainlib
npm install
```

### Tests and Coverage

To run all of the tests:

```bash
npm run test
npm run coverage
```

To run a single test file in watch mode (useful for developing):

```bash
mocha -w -R spec test/db.unit.js
```

