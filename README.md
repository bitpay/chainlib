ChainLib
=======
[![Build Status](https://magnum.travis-ci.org/bitpay/chainlib.svg?branch=master
[![Coverage Status](https://coveralls.io/repos/bitpay/chainlib/badge.svg?branch=master&t=mS2kWT)](https://coveralls.io/r/bitpay/chainlib?branch=master)

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

