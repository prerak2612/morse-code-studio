/**
 * Pulsefield Morse semantic analyzer.
 *
 * Checks an AST (Message → Word → Character) against the symbol table and
 * reports every symbol that has no Morse code as a structured diagnostic.
 * It never throws for bad user input; it only throws for an AST that is not
 * a Message node, which is a programming error.
 *
 * Works as a CommonJS module (Node, tests) and as a classic browser script
 * (exposes `window.MorseSemantic`). See docs/SEMANTIC_AND_IR.md.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./symbol-table.js'));
  else root.MorseSemantic = factory(root.MorseSymbolTable);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (symbolTable) {
  'use strict';

  const Severity = Object.freeze({ ERROR: 'error' });

  const DiagnosticCode = Object.freeze({ UNKNOWN_SYMBOL: 'SEM001' });

  function describe(symbol) {
    if (typeof symbol !== 'string' || symbol === '') return 'Character node has no symbol';
    const codePoint = 'U+' + symbol.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `Symbol ${JSON.stringify(symbol)} (${codePoint}) is not in the Morse symbol table`;
  }

  function locationOf(node) {
    const span = node.span || {};
    return { line: span.line, column: span.column, offset: span.offset, length: span.length };
  }

  /**
   * Analyze `ast`.
   *
   * @param {{type:'Message', words:Array<{characters:Array<{value:string, span:object}>}>}} ast
   * @returns {{ok:boolean, diagnostics:Array<{code:string, severity:string, symbol:string,
   *   reason:string, location:{line:number, column:number, offset:number, length:number}}>}}
   *   Diagnostics are in source order.
   */
  function analyze(ast) {
    if (!ast || ast.type !== 'Message' || !Array.isArray(ast.words)) {
      throw new TypeError('analyze(ast) expects a Message node');
    }

    const diagnostics = [];
    for (const word of ast.words) {
      for (const character of word.characters) {
        if (symbolTable.lookup(character.value) !== null) continue;
        diagnostics.push({
          code: DiagnosticCode.UNKNOWN_SYMBOL,
          severity: Severity.ERROR,
          symbol: character.value,
          reason: describe(character.value),
          location: locationOf(character),
        });
      }
    }

    return { ok: diagnostics.length === 0, diagnostics };
  }

  /** One-line rendering, e.g. `1:3 error SEM001 Symbol "#" (U+0023) is not in the Morse symbol table`. */
  function formatDiagnostic(d) {
    return `${d.location.line}:${d.location.column} ${d.severity} ${d.code} ${d.reason}`;
  }

  return { Severity, DiagnosticCode, analyze, formatDiagnostic };
});
