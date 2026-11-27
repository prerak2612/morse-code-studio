'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MORSE, lookup } = require('../src/compiler/symbol-table.js');
const lexer = require('../src/compiler/lexer.js');

test('semicolon maps to the ITU code -.-.-. and not to the full stop', () => {
  assert.equal(lookup(';'), '-.-.-.');
  assert.equal(lookup('.'), '.-.-.-');
  assert.equal(lexer.tokenize(';')[0].morse, '-.-.-.');
});

test('every code is unique, so decoding is unambiguous', () => {
  const codes = Object.values(MORSE);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) assert.match(code, /^[.-]+$/);
});

test('lookup is exact and returns null for unknown symbols', () => {
  assert.equal(lookup('S'), '...');
  assert.equal(lookup('s'), null);
  assert.equal(lookup('#'), null);
  assert.equal(lookup('toString'), null);
  assert.equal(lookup(undefined), null);
});

test('the lexer reads its table from the symbol table', () => {
  assert.equal(lexer.MORSE, MORSE);
});
