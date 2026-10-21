# TODO

## Upgrade Python scope resolution

- [ ] Recognize `type X = ...` as a binding so a local type alias shadows an
  annotated outer variable.
- [ ] Model type-parameter and annotation scopes, including generic functions
  and classes. For example, `def f[T](): return T` must resolve `T` to the type
  parameter rather than an annotated outer variable.
- [ ] Account for execution order in class bodies and Python's fallback lookup
  rules. A reference before a class assignment can read a module variable;
  currently it resolves to the class binding instead of falling back to the
  module binding.
- [ ] Handle runtime-dependent bindings conservatively: apply a style only
  when all possible bindings agree; otherwise leave the reference unstyled.
- [ ] Add regression coverage for shadowing, class reads before and after
  assignments, conditional assignments, and interactions with existing scopes.
- [ ] Compare static binding decisions against CPython's `symtable` for the
  supported Python versions. Check class lookup behavior against execution
  results as well, since symbol tables alone do not capture runtime fallback.

The goal is more complete static scope analysis without executing Python in
the editor. This does not promise to predict arbitrary runtime effects from
`exec`, wildcard imports, namespace mutation, or attribute lookup.
