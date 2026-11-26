(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).ir = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  const gap = (kind, units) => Object.freeze({ op: Op.GAP, kind, units });

  function lower(ast) {
    if (!ast || ast.type !== 'Message') throw new TypeError('lower(ast) expects a Message node');

    const instructions = [];
    ast.words.forEach((word, wordIndex) => {
      if (wordIndex > 0) instructions.push(gap(GapKind.WORD, Units.WORD_GAP));
      word.characters.forEach((character, characterIndex) => {
        if (characterIndex > 0) instructions.push(gap(GapKind.LETTER, Units.LETTER_GAP));
        [...character.morse].forEach((symbol, elementIndex) => {
          if (elementIndex > 0) instructions.push(gap(GapKind.ELEMENT, Units.ELEMENT_GAP));
          const dah = symbol === '-';
          instructions.push(Object.freeze({
            op: Op.MARK,
            kind: dah ? 'dah' : 'dit',
            symbol,
            units: dah ? Units.DAH : Units.DIT,
            character: character.value,
            word: wordIndex,
            source: character.span,
          }));
        });
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
