(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.Pulsefield = root.Pulsefield || {}).diagnostics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const Severity = Object.freeze({
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
  });

  const Code = Object.freeze({
    UNSUPPORTED_CHARACTER: 'PF1001',
    CONTROL_CHARACTER: 'PF1002',
    MALFORMED_UNICODE: 'PF1003',
    EMPTY_MESSAGE: 'PF2001',
  });

  const spanOf = (node) => ({
    offset: node.offset,
    length: node.length,
    line: node.line,
    column: node.column,
  });

  function createDiagnostic(code, severity, message, span) {
    return Object.freeze({ code, severity, message, span: Object.freeze(spanOf(span)) });
  }

  function isLoneSurrogate(value) {
    if (value.length !== 1) return false;
    const unit = value.charCodeAt(0);
    return unit >= 0xd800 && unit <= 0xdfff;
  }

  function fromInvalidToken(token) {
    if (isLoneSurrogate(token.value)) {
      return createDiagnostic(Code.MALFORMED_UNICODE, Severity.ERROR, token.message, token);
    }
    if (/^\p{Cc}$/u.test(token.value)) {
      return createDiagnostic(Code.CONTROL_CHARACTER, Severity.WARNING, `${token.message}; it will be skipped`, token);
    }
    return createDiagnostic(Code.UNSUPPORTED_CHARACTER, Severity.WARNING, `${token.message}; it will be skipped`, token);
  }

  function summarize(diagnostics) {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const d of diagnostics) counts[d.severity]++;
    return counts;
  }

  const hasErrors = (diagnostics) => diagnostics.some((d) => d.severity === Severity.ERROR);

  function formatDiagnostic(d) {
    return `${d.span.line}:${d.span.column} ${d.severity} ${d.code} ${d.message}`;
  }

  return { Severity, Code, createDiagnostic, fromInvalidToken, summarize, hasErrors, formatDiagnostic, spanOf };
});
