'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { compile, encodeSignal, decodeSignal } = require('../compiler.js');

test('compiles text and Morse to the same program output', () => {
  const source = 'let x = 2 + 3 * 4\nSET X = (X - 2) / -2; PRINT X\nPRINT +1.25\n';
  const { signal, unsupported } = encodeSignal(source, true);
  assert.deepEqual(unsupported, []);
  assert.equal(decodeSignal(signal, true), source.toUpperCase());
  const text = compile(source);
  const morse = compile(signal, { format: 'morse' });
  assert.deepEqual(text.output, [-6, 1.25]);
  assert.deepEqual(morse.output, text.output);
  assert.deepEqual(text.stages.semantic, [{ name: 'X', slot: 0, line: 1 }]);
});

test('generates a token stream and AST with left-associative arithmetic', () => {
  const { stages, output } = compile('PRINT 12 / 3 / 2');
  assert.deepEqual(stages.lexer.map(({ type }) => type), ['PRINT', 'NUMBER', '/', 'NUMBER', '/', 'NUMBER', 'EOF']);
  assert.equal(stages.lexer[1].column, 7);
  assert.equal(stages.parser.statements[0].value.left.operator, '/');
  assert.deepEqual(output, [2]);
});

test('folds constant expressions while preserving stack behavior', () => {
  const source = 'LET A = 2 * (3 + 4)\nPRINT A + -5';
  const optimized = compile(source);
  const original = compile(source, { fold: false });
  assert.deepEqual(optimized.output, [9]);
  assert.deepEqual(original.output, optimized.output);
  assert.ok(optimized.stages.bytecode.code.length < original.stages.bytecode.code.length);
  assert.deepEqual(original.stages.bytecode.code, optimized.stages.bytecode.original);
});

test('keeps prior stage artifacts and source locations on compilation errors', () => {
  const cases = [
    ['.... / / ...', 'signal', 1, 8, { format: 'morse' }],
    ['PRINT %', 'lexer', 1, 7],
    ['PRINT (2', 'parser', 1, 9],
    ['LET A = 1\nPRINT B', 'semantic', 2, 7],
    ['LET A = 1; LET A = 2', 'semantic', 1, 16],
    ['SET A = 1', 'semantic', 1, 5],
    ['LET A = A', 'semantic', 1, 9],
  ];
  const stages = ['signal', 'lexer', 'parser', 'semantic', 'bytecode'];
  for (const [source, stage, line, column, options] of cases) {
    const result = compile(source, options);
    assert.equal(result.error.stage, stage, source);
    assert.equal(result.error.line, line, source);
    assert.equal(result.error.column, column, source);
    assert.deepEqual(Object.keys(result.stages), stages.slice(0, stages.indexOf(stage)));
    assert.deepEqual(result.output, []);
  }
});

test('preserves partial output and the fault location with folding enabled', () => {
  for (const fold of [false, true]) {
    const { output, error } = compile('PRINT 42\nPRINT 1 / (2 - 2)\nPRINT 99', { fold });
    assert.deepEqual(output, [42]);
    assert.equal(error.stage, 'runtime');
    assert.equal(error.line, 2);
    assert.equal(error.column, 9);
    assert.match(error.message, /Division by zero/);
  }
});

test('reports deep nesting and handles long left-associative expressions', () => {
  const deep = compile('PRINT ' + '('.repeat(70) + '1' + ')'.repeat(70));
  assert.equal(deep.error.stage, 'parser');
  assert.match(deep.error.message, /nesting/);
  assert.deepEqual(compile('PRINT ' + '1+'.repeat(5000) + '1').output, [5001]);
});

test('round-trips standard Morse and accepts typographic dots and dashes', () => {
  assert.deepEqual(encodeSignal('SOS\nGO ☀'), { signal: '... --- ... / --. ---', unsupported: ['☀'] });
  assert.equal(decodeSignal('··· ——— ··· / --. ---'), 'SOS GO');
  assert.equal(decodeSignal('...-.-', true), '*');
  assert.throws(() => decodeSignal('...-.-'), /Unknown Morse group/);
});
