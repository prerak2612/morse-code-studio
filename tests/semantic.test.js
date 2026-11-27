'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyze, formatDiagnostic, DiagnosticCode } = require('../src/compiler/semantic-analyzer.js');
const { astFrom } = require('./helpers/ast.js');

test('a valid AST has no diagnostics', () => {
  assert.deepEqual(analyze(astFrom('SOS 73; ok?')), { ok: true, diagnostics: [] });
});

test('an empty message is valid', () => {
  assert.deepEqual(analyze(astFrom('')), { ok: true, diagnostics: [] });
});

test('acceptance: an invalid symbol produces a diagnostic with location and reason', () => {
  const { ok, diagnostics } = analyze(astFrom('Hi #2'));
  assert.equal(ok, false);
  assert.deepEqual(diagnostics, [{
    code: DiagnosticCode.UNKNOWN_SYMBOL,
    severity: 'error',
    symbol: '#',
    reason: 'Symbol "#" (U+0023) is not in the Morse symbol table',
    location: { line: 1, column: 4, offset: 3, length: 1 },
  }]);
});

test('every invalid symbol is reported in source order, across lines', () => {
  const { diagnostics } = analyze(astFrom('A#\nB é 😀'));
  assert.deepEqual(diagnostics.map((d) => [d.symbol, d.location.line, d.location.column]), [
    ['#', 1, 2],
    ['é', 2, 3],
    ['😀', 2, 5],
  ]);
  assert.match(diagnostics[2].reason, /U\+1F600/);
  assert.equal(diagnostics[2].location.length, 2);
});

test('a character node without a value is reported, not crashed on', () => {
  const ast = { type: 'Message', words: [{ type: 'Word', characters: [{ type: 'Character', span: { offset: 0, length: 1, line: 1, column: 1 } }] }] };
  const [d] = analyze(ast).diagnostics;
  assert.equal(d.reason, 'Character node has no symbol');
  assert.deepEqual(d.location, { line: 1, column: 1, offset: 0, length: 1 });
});

test('formatDiagnostic renders line:column, severity, code and reason', () => {
  const [d] = analyze(astFrom('Hi #2')).diagnostics;
  assert.equal(formatDiagnostic(d), '1:4 error SEM001 Symbol "#" (U+0023) is not in the Morse symbol table');
});

test('rejects input that is not a Message node', () => {
  assert.throws(() => analyze(null), TypeError);
  assert.throws(() => analyze({ type: 'Word', characters: [] }), TypeError);
});
