(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./lexer.js'),
      require('./parser.js'),
      require('./ir.js'),
      require('../codegen/text.js'),
      require('./semantic-analyzer.js'),
    );
  } else {
    const ns = (root.Pulsefield = root.Pulsefield || {});
    ns.compiler = factory(root.MorseLexer, ns.parser, ns.ir, ns.text, root.MorseSemantic);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lexer, parser, ir, text, semantic) {
  'use strict';

  function compile(source) {
    const tokens = lexer.tokenize(source);
    const { ast, diagnostics: parseDiagnostics } = parser.parse(tokens);
    const analysis = semantic.analyze(ast);
    const program = analysis.ok ? ir.lower(ast) : { instructions: [], units: 0 };
    const diagnostics = [
      ...parseDiagnostics,
      ...analysis.diagnostics.map(({ code, severity, reason, location }) =>
        ({ code, severity, message: reason, span: location })),
    ];
    const output = text.emit(program);
    return { source, tokens, ast, analysis, ir: program, diagnostics, output };
  }

  return { compile };
});
