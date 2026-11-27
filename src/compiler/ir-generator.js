/**
 * Pulsefield Morse IR generator.
 *
 * Lowers a semantically valid AST (Message → Word → Character) into a flat
 * list of timing instructions: DIT, DAH, ELEMENT_GAP, LETTER_GAP and
 * WORD_GAP. Each instruction carries its length in Morse units.
 *
 * Works as a CommonJS module (Node, tests) and as a classic browser script
 * (exposes `window.MorseIR`). See docs/SEMANTIC_AND_IR.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./symbol-table.js'));
  else root.MorseIR = factory(root.MorseSymbolTable);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (symbolTable) {
  'use strict';

  const Op = Object.freeze({
    DIT: 'DIT',
    DAH: 'DAH',
    ELEMENT_GAP: 'ELEMENT_GAP',
    LETTER_GAP: 'LETTER_GAP',
    WORD_GAP: 'WORD_GAP',
  });

  /** Standard Morse timing, in units (1 unit = one dit). */
  const UNITS = Object.freeze({ DIT: 1, DAH: 3, ELEMENT_GAP: 1, LETTER_GAP: 3, WORD_GAP: 7 });

  const instruction = (op, symbol) => (symbol === undefined ? { op, units: UNITS[op] } : { op, units: UNITS[op], symbol });

  const isGap = (i) => i.op === Op.ELEMENT_GAP || i.op === Op.LETTER_GAP || i.op === Op.WORD_GAP;

  /**
   * Optimization pass for redundant gaps. Returns a new list:
   * - a run of adjacent gaps becomes the single widest gap in it
   *   (ELEMENT_GAP + LETTER_GAP → LETTER_GAP, LETTER_GAP + WORD_GAP → WORD_GAP);
   * - gaps at the start or end are dropped, since they separate nothing.
   */
  function optimize(ir) {
    const out = [];
    for (const current of ir) {
      const last = out[out.length - 1];
      if (isGap(current)) {
        if (!last) continue;
        if (isGap(last)) {
          if (current.units > last.units) out[out.length - 1] = current;
          continue;
        }
      }
      out.push(current);
    }
    if (out.length && isGap(out[out.length - 1])) out.pop();
    return out;
  }

  /**
   * Generate IR for `ast`. Run the semantic analyzer first: an unknown
   * symbol here is a programming error and throws.
   *
   * Lowering follows every element, letter and word with its gap, then the
   * optimization pass removes the redundant ones (pass `{ optimize: false }`
   * to see the raw lowering). The output is deterministic: the same AST
   * always gives the same IR.
   *
   * @returns {Array<{op:string, units:number, symbol?:string}>}
   */
  function generateIR(ast, { optimize: shouldOptimize = true } = {}) {
    if (!ast || ast.type !== 'Message' || !Array.isArray(ast.words)) {
      throw new TypeError('generateIR(ast) expects a Message node');
    }

    const ir = [];
    for (const word of ast.words) {
      for (const character of word.characters) {
        const code = symbolTable.lookup(character.value);
        if (code === null) throw new Error(`No Morse code for ${JSON.stringify(character.value)}; run semantic analysis first`);
        for (const element of code) {
          ir.push(instruction(element === '.' ? Op.DIT : Op.DAH, character.value));
          ir.push(instruction(Op.ELEMENT_GAP));
        }
        ir.push(instruction(Op.LETTER_GAP));
      }
      ir.push(instruction(Op.WORD_GAP));
    }
    return shouldOptimize ? optimize(ir) : ir;
  }

  return { Op, UNITS, generateIR, optimize };
});
