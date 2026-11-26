(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./lexer.js'),
      require('./parser.js'),
      require('./ir.js'),
      require('../codegen/text.js'),
    );
  } else {
    const ns = (root.Pulsefield = root.Pulsefield || {});
    ns.compiler = factory(root.MorseLexer, ns.parser, ns.ir, ns.text);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lexer, parser, ir, text) {
  'use strict';

  function compile(source) {
    const tokens = lexer.tokenize(source);
    const { ast, diagnostics } = parser.parse(tokens);
    const program = ir.lower(ast);
    const output = text.emit(program);
    return { source, tokens, ast, ir: program, diagnostics, output };
  }

  return { compile };
});
