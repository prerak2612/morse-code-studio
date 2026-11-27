(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).text = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GAP_TEXT = Object.freeze({ element: '', letter: ' ', word: ' / ' });

  function emit(program) {
    const segments = [];
    program.instructions.forEach((instruction, index) => {
      if (instruction.op === 'MARK') {
        segments.push({ text: instruction.symbol, index, kind: instruction.kind });
      } else if (GAP_TEXT[instruction.kind]) {
        segments.push({ text: GAP_TEXT[instruction.kind], index, kind: instruction.kind });
      }
    });
    return { text: segments.map((s) => s.text).join(''), segments };
  }

  return { emit };
});
