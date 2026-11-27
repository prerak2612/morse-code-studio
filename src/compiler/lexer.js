/**
 * Pulsefield Morse lexer.
 *
 * Turns plain text into a position-aware token stream for the Morse compiler.
 * Every input character ends up in exactly one token: unsupported characters
 * become INVALID tokens instead of being skipped.
 *
 * Works as a CommonJS module (Node, tests) and as a classic browser script
 * (exposes `window.MorseLexer`). See docs/LEXICAL_ANALYSIS.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./symbol-table.js'));
  else root.MorseLexer = factory(root.MorseSymbolTable);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (symbolTable) {
  'use strict';

  const TokenType = Object.freeze({
    LETTER: 'LETTER',
    DIGIT: 'DIGIT',
    PUNCTUATION: 'PUNCTUATION',
    WORD_SEPARATOR: 'WORD_SEPARATOR',
    INVALID: 'INVALID',
    EOF: 'EOF',
  });

  /** International Morse table for every character the lexer accepts (see symbol-table.js). */
  const { MORSE } = symbolTable;

  const isAsciiLetter = (c) => (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
  const isDigit = (c) => c >= '0' && c <= '9';
  // Any Unicode whitespace (space, tab, NBSP, line breaks, ...) separates words.
  const isWhitespace = (c) => /^\s$/u.test(c);
  const isLoneSurrogate = (c) => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff;

  function codePointLabel(c) {
    return 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  }

  function invalidReason(c) {
    if (isLoneSurrogate(c)) return `Malformed Unicode: lone surrogate ${codePointLabel(c)}`;
    if (/^\p{Cc}$/u.test(c)) return `Unsupported control character ${codePointLabel(c)}`;
    return `Unsupported character "${c}" (${codePointLabel(c)}) has no International Morse code`;
  }

  /**
   * Tokenize `input`.
   *
   * @param {string} input
   * @returns {Array<{type:string, lexeme:string, value:string, offset:number,
   *   line:number, column:number, length:number, morse?:string, message?:string}>}
   *   Always ends with exactly one EOF token.
   *
   * Positions: `offset` is a 0-based UTF-16 index (so `input.slice(offset,
   * offset + length) === lexeme`); `line` and `column` are 1-based and count
   * Unicode code points, so an emoji advances the column by one.
   */
  function tokenize(input) {
    if (typeof input !== 'string') throw new TypeError('tokenize(input) expects a string');

    const tokens = [];
    let i = 0;
    let line = 1;
    let column = 1;

    const push = (type, lexeme, value, start, extra) => {
      tokens.push({ type, lexeme, value, offset: start.offset, line: start.line, column: start.column, length: lexeme.length, ...extra });
    };

    // Reads one code point at i; lone surrogates come back as a single unit.
    const peek = () => (i < input.length ? readCodePoint(input, i) : '');

    // Advance position bookkeeping over `ch`. Handles \n, \r and \r\n as one line break.
    const advance = (ch) => {
      i += ch.length;
      if (ch === '\n' || ch === ' ' || ch === ' ') { line++; column = 1; }
      else if (ch === '\r') {
        if (input[i] === '\n') i++; // CRLF counts once
        line++; column = 1;
      } else column++;
    };

    while (i < input.length) {
      const start = { offset: i, line, column };
      const ch = peek();

      if (isWhitespace(ch)) {
        while (i < input.length && isWhitespace(peek())) advance(peek());
        push(TokenType.WORD_SEPARATOR, input.slice(start.offset, i), ' ', start, { morse: '/' });
        continue;
      }

      advance(ch);

      if (isAsciiLetter(ch)) {
        const value = ch.toUpperCase();
        push(TokenType.LETTER, ch, value, start, { morse: MORSE[value] });
      } else if (isDigit(ch)) {
        push(TokenType.DIGIT, ch, ch, start, { morse: MORSE[ch] });
      } else if (Object.prototype.hasOwnProperty.call(MORSE, ch)) {
        push(TokenType.PUNCTUATION, ch, ch, start, { morse: MORSE[ch] });
      } else {
        push(TokenType.INVALID, ch, ch, start, { message: invalidReason(ch) });
      }
    }

    tokens.push({ type: TokenType.EOF, lexeme: '', value: '', offset: i, line, column, length: 0 });
    return tokens;
  }

  function readCodePoint(str, index) {
    const hi = str.charCodeAt(index);
    if (hi >= 0xd800 && hi <= 0xdbff && index + 1 < str.length) {
      const lo = str.charCodeAt(index + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) return str.slice(index, index + 2);
    }
    return str[index];
  }

  /** Compact one-line-per-token rendering, e.g. `LETTER "H" -> H @1:1 (0)`. */
  function formatToken(t) {
    return `${t.type} ${JSON.stringify(t.lexeme)} -> ${JSON.stringify(t.value)} @${t.line}:${t.column} (offset ${t.offset})`;
  }

  return { TokenType, MORSE, tokenize, formatToken };
});
