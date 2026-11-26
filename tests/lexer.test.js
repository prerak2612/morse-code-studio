'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, TokenType: T } = require('../src/compiler/lexer.js');

const types = (input) => tokenize(input).map((t) => t.type);
const pick = (t) => ({ type: t.type, lexeme: t.lexeme, value: t.value, offset: t.offset, line: t.line, column: t.column });

test('empty input yields only EOF at 1:1', () => {
  const tokens = tokenize('');
  assert.equal(tokens.length, 1);
  assert.deepEqual(pick(tokens[0]), { type: T.EOF, lexeme: '', value: '', offset: 0, line: 1, column: 1 });
});

test('rejects non-string input', () => {
  assert.throws(() => tokenize(null), TypeError);
});

test('acceptance: "Hi @ 2" produces a position-aware stream', () => {
  assert.deepEqual(tokenize('Hi @ 2').map(pick), [
    { type: T.LETTER, lexeme: 'H', value: 'H', offset: 0, line: 1, column: 1 },
    { type: T.LETTER, lexeme: 'i', value: 'I', offset: 1, line: 1, column: 2 },
    { type: T.WORD_SEPARATOR, lexeme: ' ', value: ' ', offset: 2, line: 1, column: 3 },
    { type: T.PUNCTUATION, lexeme: '@', value: '@', offset: 3, line: 1, column: 4 },
    { type: T.WORD_SEPARATOR, lexeme: ' ', value: ' ', offset: 4, line: 1, column: 5 },
    { type: T.DIGIT, lexeme: '2', value: '2', offset: 5, line: 1, column: 6 },
    { type: T.EOF, lexeme: '', value: '', offset: 6, line: 1, column: 7 },
  ]);
});

test('lowercase letters keep their lexeme and normalize the value to uppercase', () => {
  const [a, b, c] = tokenize('sos');
  assert.deepEqual([a.lexeme, b.lexeme, c.lexeme], ['s', 'o', 's']);
  assert.deepEqual([a.value, b.value, c.value], ['S', 'O', 'S']);
  assert.equal(a.morse, '...');
  assert.equal(b.morse, '---');
});

test('multiple spaces collapse into one WORD_SEPARATOR that keeps the raw lexeme', () => {
  const tokens = tokenize('A   B');
  assert.deepEqual(tokens.map((t) => t.type), [T.LETTER, T.WORD_SEPARATOR, T.LETTER, T.EOF]);
  assert.equal(tokens[1].lexeme, '   ');
  assert.equal(tokens[1].value, ' ');
  assert.equal(tokens[1].length, 3);
  assert.deepEqual(pick(tokens[2]), { type: T.LETTER, lexeme: 'B', value: 'B', offset: 4, line: 1, column: 5 });
});

test('leading/trailing whitespace and tabs are still reported as separators', () => {
  assert.deepEqual(types(' \tA '), [T.WORD_SEPARATOR, T.LETTER, T.WORD_SEPARATOR, T.EOF]);
});

test('newlines (LF and CRLF) advance line and reset column', () => {
  const tokens = tokenize('A\nB\r\nC');
  const c = tokens.find((t) => t.value === 'C');
  const b = tokens.find((t) => t.value === 'B');
  assert.deepEqual([b.line, b.column, b.offset], [2, 1, 2]);
  assert.deepEqual([c.line, c.column, c.offset], [3, 1, 5]);
  assert.equal(tokens.at(-1).line, 3);
  assert.equal(tokens.at(-1).column, 2);
});

test('every supported punctuation mark is a PUNCTUATION token with its Morse code', () => {
  const marks = `?!,.'/():;=+-_"$@`;
  const tokens = tokenize(marks);
  assert.equal(tokens.length, marks.length + 1);
  for (const t of tokens.slice(0, -1)) {
    assert.equal(t.type, T.PUNCTUATION, `expected PUNCTUATION for ${t.lexeme}`);
    assert.match(t.morse, /^[.-]+$/);
  }
});

test('unsupported ASCII characters are INVALID, never skipped', () => {
  const tokens = tokenize('A#B');
  assert.deepEqual(tokens.map((t) => t.type), [T.LETTER, T.INVALID, T.LETTER, T.EOF]);
  assert.equal(tokens[1].lexeme, '#');
  assert.equal(tokens[1].column, 2);
  assert.match(tokens[1].message, /U\+0023/);
});

test('non-ASCII letters are INVALID (no lossy folding of é or ß)', () => {
  const tokens = tokenize('é ß');
  assert.deepEqual(tokens.map((t) => t.type), [T.INVALID, T.WORD_SEPARATOR, T.INVALID, T.EOF]);
  assert.equal(tokens[0].value, 'é');
  assert.equal(tokens[2].value, 'ß');
});

test('astral characters (emoji) are one INVALID token spanning two UTF-16 units', () => {
  const tokens = tokenize('A😀B');
  assert.deepEqual(tokens.map((t) => t.type), [T.LETTER, T.INVALID, T.LETTER, T.EOF]);
  assert.equal(tokens[1].lexeme, '😀');
  assert.equal(tokens[1].length, 2);
  assert.match(tokens[1].message, /U\+1F600/);
  // offset is UTF-16, column is code points
  assert.deepEqual([tokens[2].offset, tokens[2].column], [3, 3]);
});

test('lone surrogates are reported as malformed Unicode', () => {
  const tokens = tokenize('A\uD800B\uDC00');
  assert.deepEqual(tokens.map((t) => t.type), [T.LETTER, T.INVALID, T.LETTER, T.INVALID, T.EOF]);
  assert.match(tokens[1].message, /lone surrogate U\+D800/);
  assert.match(tokens[3].message, /lone surrogate U\+DC00/);
});

test('control characters are INVALID; Unicode whitespace like NBSP separates words', () => {
  assert.deepEqual(types('A\u0007B'), [T.LETTER, T.INVALID, T.LETTER, T.EOF]);
  assert.deepEqual(types('A B'), [T.LETTER, T.WORD_SEPARATOR, T.LETTER, T.EOF]);
});

test('lexemes reassemble the exact input (lossless stream)', () => {
  const input = 'Meet  me\tat 5:30 — ok? 😀\r\nbye\uD800';
  const tokens = tokenize(input);
  assert.equal(tokens.map((t) => t.lexeme).join(''), input);
  for (const t of tokens) assert.equal(input.slice(t.offset, t.offset + t.length), t.lexeme);
});
