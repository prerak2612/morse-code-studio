(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./lexer.js'), require('./diagnostics.js'));
  } else {
    const ns = (root.Pulsefield = root.Pulsefield || {});
    ns.parser = factory(root.MorseLexer, ns.diagnostics);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lexer, diagnostics) {
  'use strict';

  const { TokenType } = lexer;
  const { Code, Severity, createDiagnostic, fromInvalidToken, spanOf } = diagnostics;

  const NodeType = Object.freeze({
    MESSAGE: 'Message',
    WORD: 'Word',
    CHARACTER: 'Character',
  });

  const CHARACTER_KIND = Object.freeze({
    [TokenType.LETTER]: 'letter',
    [TokenType.DIGIT]: 'digit',
    [TokenType.PUNCTUATION]: 'punctuation',
  });

  function spanBetween(first, last) {
    return {
      offset: first.offset,
      length: last.offset + last.length - first.offset,
      line: first.line,
      column: first.column,
    };
  }

  function parse(tokens) {
    if (!Array.isArray(tokens) || tokens.at(-1)?.type !== TokenType.EOF) {
      throw new TypeError('parse(tokens) expects a token stream terminated by EOF');
    }

    const words = [];
    const problems = [];
    let characters = [];
    let first = null;
    let last = null;

    const closeWord = () => {
      if (characters.length) {
        words.push(Object.freeze({
          type: NodeType.WORD,
          text: characters.map((c) => c.value).join(''),
          characters: Object.freeze(characters),
          span: Object.freeze(spanBetween(first, last)),
        }));
      }
      characters = [];
      first = null;
      last = null;
    };

    for (const token of tokens) {
      if (token.type === TokenType.EOF) break;
      if (token.type === TokenType.WORD_SEPARATOR) {
        closeWord();
        continue;
      }

      first ??= token;
      last = token;

      if (token.type === TokenType.INVALID) {
        problems.push(fromInvalidToken(token));
        continue;
      }

      characters.push(Object.freeze({
        type: NodeType.CHARACTER,
        kind: CHARACTER_KIND[token.type],
        value: token.value,
        lexeme: token.lexeme,
        morse: token.morse,
        span: Object.freeze(spanOf(token)),
      }));
    }
    closeWord();

    const eof = tokens.at(-1);
    if (!words.length) {
      problems.push(createDiagnostic(
        Code.EMPTY_MESSAGE,
        Severity.INFO,
        'Nothing to transmit: the message has no encodable characters',
        { offset: eof.offset, length: 0, line: eof.line, column: eof.column },
      ));
    }

    const ast = Object.freeze({
      type: NodeType.MESSAGE,
      words: Object.freeze(words),
      span: Object.freeze({ offset: 0, length: eof.offset, line: 1, column: 1 }),
    });

    return { ast, diagnostics: problems };
  }

  return { NodeType, parse };
});
