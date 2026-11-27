'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateIR, Op, UNITS } = require('../src/compiler/ir-generator.js');
const { astFrom } = require('./helpers/ast.js');

const ops = (ir) => ir.map((i) => i.op);
const marks = (ir) => ir.filter((i) => i.op === Op.DIT || i.op === Op.DAH);

test('lowering follows every element, letter and word with its gap', () => {
  assert.deepEqual(generateIR(astFrom('ET')), [
    { op: Op.DIT, units: 1, symbol: 'E' },
    { op: Op.ELEMENT_GAP, units: 1 },
    { op: Op.LETTER_GAP, units: 3 },
    { op: Op.DAH, units: 3, symbol: 'T' },
    { op: Op.ELEMENT_GAP, units: 1 },
    { op: Op.LETTER_GAP, units: 3 },
    { op: Op.WORD_GAP, units: 7 },
  ]);
});

test('marks follow the symbol table codes in order', () => {
  const ir = generateIR(astFrom('SOS 73;'));
  assert.equal(marks(ir).map((i) => (i.op === Op.DIT ? '.' : '-')).join(''), '...---...' + '--...' + '...--' + '-.-.-.');
});

test('units follow standard Morse timing', () => {
  assert.deepEqual(UNITS, { DIT: 1, DAH: 3, ELEMENT_GAP: 1, LETTER_GAP: 3, WORD_GAP: 7 });
  for (const i of generateIR(astFrom('PARIS'))) assert.equal(i.units, UNITS[i.op]);
});

test('acceptance: the same AST always produces the same IR', () => {
  const ast = astFrom('Meet me at 5:30');
  const first = generateIR(ast);
  assert.deepEqual(generateIR(ast), first);
  assert.deepEqual(generateIR(astFrom('Meet me at 5:30')), first);
  assert.deepEqual(generateIR(astFrom('MEET ME AT 5:30')), first);
});

test('an empty message produces empty IR', () => {
  assert.deepEqual(generateIR(astFrom('')), []);
});

test('throws on an unknown symbol, which semantic analysis should have caught', () => {
  assert.throws(() => generateIR(astFrom('A#')), /run semantic analysis first/);
  assert.throws(() => generateIR({ type: 'Word' }), TypeError);
});

test('only the five IR ops are emitted', () => {
  const allowed = new Set(Object.values(Op));
  assert.ok(ops(generateIR(astFrom('Hi @ 2!'))).every((op) => allowed.has(op)));
});
