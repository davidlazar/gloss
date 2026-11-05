# Python variable annotations with Tailwind CSS v4

From this directory:

```sh
pnpm install
pnpm run build
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000>.

Try changing `text-blue-500` to `text-rose-500`, adding `font-bold`, or typing
an arbitrary color like `text-[#123456]`. The example selector covers
parameters, local and module variables, closures, shadowing, function names,
return annotations, and hover variants. The checkbox enables or disables the extension.

In **Return annotations**, `foo`'s return annotation styles `x = foo()`
and subsequent references to `x`. The explicit annotation on `y` overrides
the inferred style. Try editing or deleting the return annotation.

In **Functions**, `foo: 'bg-blue-500 text-white p-1'` styles `foo` in its definition,
calls, and other references. Put the annotation before or after the definition
in the same scope. Each annotation styles that occurrence and subsequent
references; earlier occurrences keep their styles. Try editing or removing
the later red annotation.

The extension is enabled with:

```js
import {python} from "@codemirror/lang-python"

python({tailwind: true})
```

It adds classes to variable-name decorations. The page supplies the actual
CSS. This demo uses the [Tailwind v4 browser compiler](https://tailwindcss.com/docs/installation/play-cdn)
with important utilities to override syntax highlighting and without
Preflight to preserve the editor layout. The browser compiler is intended
for demos and development; applications can supply compiled CSS instead.
Inference supports direct calls to functions defined in this document.
It does not follow imports, aliases, methods, or tuple unpacking.
Attribute names remain outside this feature's scope. See the language
package's README for binding and reassignment semantics.

To run the browser regression test:

```sh
npx playwright install chromium
npm test
```

The test starts and stops its own HTTP server, verifies computed styles and
live edits and return inference, checks scopes, hover, toggling, typing, multiple editors,
large-document scrolling, and mobile width, and saves `dist/demo.png`.
It blocks external network requests while loading the demo.
`CHROMIUM_PATH` can select an existing Chromium executable.
