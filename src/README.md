<!-- NOTE: README.md is generated from src/README.md -->

# @codemirror/lang-python [![NPM version](https://img.shields.io/npm/v/@codemirror/lang-python.svg)](https://www.npmjs.org/package/@codemirror/lang-python)

[ [**WEBSITE**](https://codemirror.net/) | [**ISSUES**](https://code.haverbeke.berlin/codemirror/dev/issues) | [**FORUM**](https://discuss.codemirror.net/c/next/) | [**CHANGELOG**](https://code.haverbeke.berlin/codemirror/lang-python/src/branch/main/CHANGELOG.md) ]

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
an outer style. The last string annotation for a name in a scope determines
its style throughout that scope. Analysis updates as the document and its
incremental parse tree change.

This feature only styles variable names. Attribute names (`obj.x`), keyword
argument labels, comments, literal text, and function return annotations are
not styled. It does not perform type inference, resolve attributes, execute
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

@python

@pythonLanguage

@pythonTailwind

@globalCompletion

@localCompletionSource
