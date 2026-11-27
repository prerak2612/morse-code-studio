'use strict';
const { tokenize } = require('../../src/compiler/lexer.js');

/**
 * Build a Message → Word → Character AST from text, the same shape the parser
 * produces. INVALID tokens are kept as Character nodes on purpose, so the
 * semantic analyzer has something to reject.
 */
function astFrom(text) {
  const words = [];
  let characters = [];
  for (const t of tokenize(text)) {
    if (t.type === 'WORD_SEPARATOR' || t.type === 'EOF') {
      if (characters.length) words.push({ type: 'Word', characters });
      characters = [];
      continue;
    }
    characters.push({
      type: 'Character',
      value: t.value,
      span: { offset: t.offset, length: t.length, line: t.line, column: t.column },
    });
  }
  return { type: 'Message', words };
}

module.exports = { astFrom };
