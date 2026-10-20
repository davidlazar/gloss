<!-- NOTE: README.md is generated from src/README.md -->

# @codemirror/lang-python [![NPM version](https://img.shields.io/npm/v/@codemirror/lang-python.svg)](https://www.npmjs.org/package/@codemirror/lang-python)

[ [**WEBSITE**](https://codemirror.net/) | [**ISSUES**](https://code.haverbeke.berlin/codemirror/dev/issues) | [**FORUM**](https://discuss.codemirror.net/) | [**CHANGELOG**](https://code.haverbeke.berlin/codemirror/lang-python/src/branch/main/CHANGELOG.md) ]

This package implements Python language support for the
[CodeMirror](https://codemirror.net/) code editor.

The [project page](https://codemirror.net/) has more information, a
number of [examples](https://codemirror.net/examples/) and the
[documentation](https://codemirror.net/docs/).

This code is released under an
[MIT license](https://code.haverbeke.berlin/codemirror/lang-python/tree/main/LICENSE).

We aim to be an inclusive, welcoming community. To make that explicit,
we have a [code of
conduct](http://contributor-covenant.org/version/1/1/0/) that applies
to communication around the project.

## Usage

```javascript
import {EditorView, basicSetup} from "codemirror"
import {python} from "@codemirror/lang-python"

const view = new EditorView({
  parent: document.body,
  doc: `print("Hello world")`,
  extensions: [basicSetup, python()]
})
```

## Tailwind variable annotations

Opt in with `python({tailwind: true})`:

```javascript
const view = new EditorView({
  parent: document.body,
  doc: `def foo(x: 'text-blue-500'):
    result: 'text-emerald-600 font-bold' = x * x
    return result`,
  extensions: [basicSetup, python({tailwind: true})]
})
```

String annotations on parameters and simple variable names supply the CSS
classes for both their declarations and references. Annotations can contain
multiple whitespace-separated classes, variants, arbitrary values, and v4
important modifiers. Plain, raw, Unicode, triple-quoted, and concatenated
string literals are supported. F-strings and computed annotations are ignored.

Styles follow static Python lexical bindings, including closures, shadowing,
comprehensions, and `global`/`nonlocal` declarations. An ordinary reassignment
keeps the binding's style; an unannotated binding in an inner function masks
an outer style. The last explicit annotation for a name in a scope determines
its style throughout that scope. Analysis updates as the document and its
incremental parse tree change.

### Return annotations

A direct function call can supply a fallback style for the variable assigned
its result:

```python
def foo() -> 'bg-red-300':
    return 42

x = foo()
print(x)  # Both occurrences of x have a red background.

y: 'bg-blue-300' = foo()
print(y)  # An explicit annotation overrides the inferred style.
```

Inference resolves functions defined in the document using the same lexical
scope rules, including nested functions and shadowing. Function definitions
can appear after the calling code. Explicit variable annotations always take
precedence, even if written later; an empty annotation or an ordinary type
annotation such as `int` suppresses inference for that binding.

Like explicit styles, inferred styles apply throughout a binding's scope.
The last resolved call with a string return annotation supplies the fallback;
ordinary reassignments keep that style. This is static style inference, not
execution-order analysis. Inference skips function names that are reassigned
or defined more than once.

Currently, inference handles `name = function(...)` and chained assignments
such as `a = b = function()`, including redundant parentheses. It does not
follow imported functions, aliases, method calls, variable-to-variable copies,
tuple unpacking, `await`, assignment expressions (`:=`), or compound right-hand
sides.

This feature only styles variable names. Attribute names (`obj.x`), keyword
argument labels, comments, and literal text are not styled. Return annotations
style assigned results, not the function's name or call expression. The
extension does not perform general type inference, resolve attributes, execute
Python, or model runtime control flow, wildcard imports, or dynamic bindings
created by `exec`.

The extension attaches classes but does not bundle a CSS compiler. Supply
Tailwind CSS v4 styles in the host page. For an editor that accepts new classes
at runtime, the [Tailwind browser compiler](https://tailwindcss.com/docs/installation/play-cdn)
can generate them as decorations appear. A production integration can instead
provide precompiled CSS for its allowed classes.

Use important utilities so annotation styles override CodeMirror's syntax
highlighting. To keep Tailwind's Preflight reset out of the editor, import
only the theme and utilities, following
[Tailwind's individual-import guidance](https://tailwindcss.com/docs/preflight#disabling-preflight):

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) important;
```

You can also add `pythonTailwind()` alongside an existing `python()`
configuration. `python()` without options preserves the original behavior.
The sibling `demo` checkout includes a self-contained example.

# API Reference

<dl>
<dt id="user-content-python">
  <code><strong><a href="#user-content-python">python</a></strong>(config?: {tailwind?: boolean}) → <a href="https://codemirror.net/docs/ref#language.LanguageSupport">LanguageSupport</a></code></dt>

<dd><p>Python language support. Set <code>tailwind</code> to interpret string variable and return annotations as CSS classes (see <a href="#user-content-pythontailwind">pythonTailwind</a>).</p>
</dd>
<dt id="user-content-pythonlanguage">
  <code><strong><a href="#user-content-pythonlanguage">pythonLanguage</a></strong>: <a href="https://codemirror.net/docs/ref#language.LRLanguage">LRLanguage</a></code></dt>

<dd><p>A language provider based on the <a href="https://code.haverbeke.berlin/lezer/python">Lezer Python
parser</a>, extended with
highlighting and indentation information.</p>
</dd>
<dt id="user-content-pythontailwind">
  <code><strong><a href="#user-content-pythontailwind">pythonTailwind</a></strong>() → <a href="https://codemirror.net/docs/ref/#state.Extension">Extension</a></code></dt>

<dd><p>Apply the classes in string annotations to variable declarations and references in their Python lexical scope. Includes parameters, local and module variables, closures, and shadowing. Direct calls to functions defined in the document infer a style for assigned variables from the function's return annotation. Explicit variable annotations take precedence. Function and attribute names are not styled by inference.</p>
<p>This extension attaches class names; the host must provide Tailwind CSS v4 (or other matching CSS). Use important utilities to override syntax highlighting. No Python code is evaluated.</p>
</dd>
<dt id="user-content-globalcompletion">
  <code><strong><a href="#user-content-globalcompletion">globalCompletion</a></strong>: <a href="https://codemirror.net/docs/ref#autocomplete.CompletionSource">CompletionSource</a></code></dt>

<dd><p>Autocompletion for built-in Python globals and keywords.</p>
</dd>
<dt id="user-content-localcompletionsource">
  <code><strong><a href="#user-content-localcompletionsource">localCompletionSource</a></strong>(<a id="user-content-localcompletionsource^context" href="#user-content-localcompletionsource^context">context</a>: <a href="https://codemirror.net/docs/ref#autocomplete.CompletionContext">CompletionContext</a>) → <a href="https://codemirror.net/docs/ref#autocomplete.CompletionResult">CompletionResult</a> | <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/null">null</a></code></dt>

<dd><p>Completion source that looks up locally defined names in
Python code.</p>
</dd>
</dl>
