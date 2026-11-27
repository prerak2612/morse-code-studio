'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateIR, optimize, Op, UNITS } = require('../src/compiler/ir-generator.js');
const { astFrom } = require('./helpers/ast.js');

const ops = (ir) => ir.map((i) => i.op);
const marks = (ir) => ir.filter((i) => i.op === Op.DIT || i.op === Op.DAH);
const totalUnits = (ir) => ir.reduce((sum, i) => sum + i.units, 0);

test('raw lowering follows every element, letter and word with its gap', () => {
  assert.deepEqual(generateIR(astFrom('ET'), { optimize: false }), [
    { op: Op.DIT, units: 1, symbol: 'E' },
    { op: Op.ELEMENT_GAP, units: 1 },
    { op: Op.LETTER_GAP, units: 3 },
    { op: Op.DAH, units: 3, symbol: 'T' },
    { op: Op.ELEMENT_GAP, units: 1 },
    { op: Op.LETTER_GAP, units: 3 },
    { op: Op.WORD_GAP, units: 7 },
  ]);
});

test('optimized IR keeps only the gaps between marks', () => {
  assert.deepEqual(generateIR(astFrom('ET')), [
    { op: Op.DIT, units: 1, symbol: 'E' },
    { op: Op.LETTER_GAP, units: 3 },
    { op: Op.DAH, units: 3, symbol: 'T' },
  ]);
  assert.deepEqual(ops(generateIR(astFrom('A E'))), [Op.DIT, Op.ELEMENT_GAP, Op.DAH, Op.WORD_GAP, Op.DIT]);
});

test('PARIS is 43 units, the standard 50 minus the trailing word gap', () => {
  assert.equal(totalUnits(generateIR(astFrom('PARIS'))), 43);
  // Raw lowering adds 5 element gaps before letter gaps (5), a trailing letter gap (3) and word gap (7).
  assert.equal(totalUnits(generateIR(astFrom('PARIS'), { optimize: false })), 43 + 5 + 3 + 7);
});

test('optimize collapses adjacent gaps to the widest one and trims the edges', () => {
  const dit = { op: Op.DIT, units: 1, symbol: 'E' };
  const gap = (op) => ({ op, units: UNITS[op] });
  const input = [gap(Op.WORD_GAP), dit, gap(Op.ELEMENT_GAP), gap(Op.WORD_GAP), gap(Op.LETTER_GAP), dit, gap(Op.LETTER_GAP)];
  const before = JSON.stringify(input);
  assert.deepEqual(optimize(input), [dit, gap(Op.WORD_GAP), dit]);
  assert.equal(JSON.stringify(input), before, 'input is not mutated');
});

test('optimize is idempotent and handles empty words in the AST', () => {
  const ast = { type: 'Message', words: [...astFrom('E').words, { type: 'Word', characters: [] }, ...astFrom('E').words] };
  const ir = generateIR(ast);
  assert.deepEqual(ops(ir), [Op.DIT, Op.WORD_GAP, Op.DIT]);
  assert.deepEqual(optimize(ir), ir);
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
