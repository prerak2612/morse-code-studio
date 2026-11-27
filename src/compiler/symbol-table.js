/**
 * Pulsefield Morse symbol table.
 *
 * The single source of truth for which symbols the compiler understands and
 * the International Morse code (ITU-R M.1677-1) bound to each one. The lexer,
 * the semantic analyzer, the IR generator and the UI all read from here.
 *
 * Works as a CommonJS module (Node, tests) and as a classic browser script
 * (exposes `window.MorseSymbolTable`). See docs/SEMANTIC_AND_IR.md.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MorseSymbolTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Symbol → Morse code. `.` is a dit, `-` is a dah. Letters are uppercase. */
  const MORSE = Object.freeze({
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..',
    J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
    S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '?': '..--..', '!': '-.-.--', ',': '--..--', '.': '.-.-.-', "'": '.----.', '/': '-..-.',
    '(': '-.--.', ')': '-.--.-', ':': '---...',
    ';': '-.-.-.', // semicolon: dah-di-dah-di-dah-dit
    '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
  });

  /**
   * Look up the Morse code bound to `symbol`.
   * Lookup is exact: pass the normalized (uppercase) value the lexer produces.
   *
   * @param {string} symbol
   * @returns {string|null} the code, or null when the symbol is not in the table
   */
  function lookup(symbol) {
    if (typeof symbol !== 'string' || !Object.prototype.hasOwnProperty.call(MORSE, symbol)) return null;
    return MORSE[symbol];
  }

  return { MORSE, lookup };
});
