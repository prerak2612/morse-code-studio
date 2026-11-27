(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./ir-generator.js') : root.MorseIR,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).ir = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (generator) {
  'use strict';

  const Op = Object.freeze({ MARK: 'MARK', GAP: 'GAP' });

  const Units = Object.freeze({
    DIT: 1,
    DAH: 3,
    ELEMENT_GAP: 1,
    LETTER_GAP: 3,
    WORD_GAP: 7,
  });

  const GapKind = Object.freeze({ ELEMENT: 'element', LETTER: 'letter', WORD: 'word' });

  const GAP_KINDS = {
    [generator.Op.ELEMENT_GAP]: GapKind.ELEMENT,
    [generator.Op.LETTER_GAP]: GapKind.LETTER,
    [generator.Op.WORD_GAP]: GapKind.WORD,
  };

  function lower(ast) {
    if (!ast || ast.type !== 'Message') throw new TypeError('lower(ast) expects a Message node');

    const instructions = generator.generateIR(ast, { includeSource: true }).map((i) => {
      const gapKind = GAP_KINDS[i.op];
      if (gapKind) return Object.freeze({ op: Op.GAP, kind: gapKind, units: i.units });
      const dah = i.op === generator.Op.DAH;
      return Object.freeze({
        op: Op.MARK,
        kind: dah ? 'dah' : 'dit',
        symbol: dah ? '-' : '.',
        units: i.units,
        character: i.symbol,
        source: i.source,
        word: i.word,
      });
    });

    return Object.freeze({
      instructions: Object.freeze(instructions),
      units: instructions.reduce((sum, i) => sum + i.units, 0),
    });
  }

  function formatInstruction(instruction) {
    return instruction.op === Op.MARK
      ? `MARK ${instruction.kind} ${instruction.units}u ${instruction.character}`
      : `GAP  ${instruction.kind} ${instruction.units}u`;
  }

  return { Op, Units, GapKind, lower, formatInstruction };
});
