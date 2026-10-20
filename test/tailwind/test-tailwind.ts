import ist from "ist"
import {EditorState} from "@codemirror/state"
import {ensureSyntaxTree} from "@codemirror/language"
import {python} from "@codemirror/lang-python"
import {tailwindDecorations} from "../../src/tailwind"

function stateFor(doc: string) {
  let state = EditorState.create({doc, extensions: [python({tailwind: true})]})
  ensureSyntaxTree(state, doc.length, 1000)
  // Like forceParsing(view), flush the newly parsed tree into state.
  return state.update({}).state
}

function styles(state: EditorState) {
  let result: [number, number, string][] = []
  for (let cursor = tailwindDecorations(state).iter(); cursor.value; cursor.next())
    result.push([cursor.from, cursor.to, cursor.value.spec.class])
  return result
}

// Mark only the exact identifiers that should receive a decoration.
function check(marked: string) {
  let doc = "", expected: [number, number, string][] = [], last = 0
  let re = /«([^»|]+)(?:\|([^»]+))?»/g, match: RegExpExecArray | null
  while (match = re.exec(marked)) {
    doc += marked.slice(last, match.index)
    expected.push([doc.length, doc.length + match[1].length, match[2] || "text-blue-500"])
    doc += match[1]
    last = match.index + match[0].length
  }
  doc += marked.slice(last)
  ist(JSON.stringify(styles(stateFor(doc))), JSON.stringify(expected))
}

describe("Python Tailwind variable annotations", () => {
  it("styles a parameter and its references, without leaking to a sibling function", () => check(`
def foo(«x»: 'text-blue-500'):
    return «x» + «x»
def bar(x):
    return x
x = 3
`))

  it("supports several annotations, star parameters, and ordinary types", () => check(`
def foo(«x»: 'text-blue-500', y: int, *«args|italic»: "italic", **«kwargs|font-bold»: 'font-bold'):
    return «x», y, «args|italic», «kwargs|font-bold»
`))

  it("styles module and local variables and preserves styles on reassignment", () => check(`
«x»: 'text-blue-500' = 1
«x» = 2
def foo():
    «local|underline bg-amber-100»: "underline   bg-amber-100" = «x»
    «local|underline bg-amber-100» += 1
    return «local|underline bg-amber-100», «x»
print(«x»)
`))

  it("inherits closure styles and handles annotated and unannotated shadowing", () => check(`
def outer(«x»: 'text-blue-500'):
    def inherited():
        return «x»
    def shadow(x):
        return x
    def recolored(«x|text-red-500»: 'text-red-500'):
        return «x|text-red-500»
    return «x»
`))

  it("collects local bindings before resolving references", () => check(`
«x»: 'text-blue-500' = 1
def shadow():
    print(x)
    x = 2
    return x
print(«x»)
`))

  it("treats blocks as part of the enclosing function scope", () => check(`
def foo():
    if True:
        «x»: 'text-blue-500' = 1
    for «x» in range(3):
        print(«x»)
    return «x»
`))

  it("evaluates defaults in the enclosing scope", () => check(`
«x»: 'text-blue-500' = 1
def foo(x=«x»):
    return x
fn = lambda x=«x»: x
fn2 = lambda: «x»
`))

  it("handles comprehensions and evaluates their first iterable in the outer scope", () => check(`
«x»: 'text-blue-500' = [1, 2]
values = [x for x in «x» if x]
values = {x: y for x in «x» for y in x}
values = (x for x in «x»)
values = {x for x in «x»}
print(«x»)
`))

  it("handles destructuring, imports, for, with, except, and pattern bindings", () => {
    for (let binding of [
      "x, y = values", "(x, *y) = values", "for x in values:\\n        pass",
      "import x.y", "import y as x", "from m import y as x",
      "with open(path) as x:\\n        pass",
      "try:\\n        pass\\n    except Exception as x:\\n        pass",
      "match values:\\n        case [x, *rest]: pass",
      "match values:\\n        case Point(y=x): pass",
      "match values:\\n        case Point() as x: pass",
      "if (x := 1): pass", "del x"
    ]) check(`
«x»: 'text-blue-500'
def foo():
    ${binding.replace(/\\n/g, "\n")}
    return x
print(«x»)
`)
  })

  it("handles global and nonlocal declarations", () => check(`
«x»: 'text-blue-500' = 1
def outer(«y|italic»: 'italic'):
    def inner():
        global «x»
        nonlocal «y|italic»
        «x» = 2
        «y|italic» += 1
        return «x», «y|italic»
`))

  it("binds assignment expressions in comprehensions to the containing scope", () => check(`
«x»: 'text-blue-500'
def foo():
    values = [(x := value) for value in items]
    return x
print(«x»)
`))

  it("keeps class namespaces out of methods and nested classes", () => check(`
«x»: 'text-blue-500' = 1
class A:
    «x|italic»: 'italic' = 2
    print(«x|italic»)
    def method(self):
        return «x»
    class B:
        print(«x»)
`))

  it("leaves properties, keyword labels, literal text, and function names unstyled", () => check(`
def foo(«x»: 'text-blue-500') -> 'text-red-500':
    # x should stay a comment
    obj.x = «x»
    print("x", x=«x»)
    return f"x {«x»} {obj.x}"
foo(1)
`))

  it("does not treat attribute or subscript assignments as name bindings", () => check(`
«x»: 'text-blue-500'
def foo():
    «x».value = 1
    «x»[0] = 2
    «x».other: 'text-red-500' = 3
    return «x»
`))

  it("supports raw, unicode, triple, concatenated, and parenthesized literals", () => {
    for (let literal of [
      "'text-blue-500'", '"text-blue-500"', "r'text-blue-500'", "u'text-blue-500'",
      "'''text-blue-500'''", '"""text-blue-500"""',
      "('text-' 'blue-500')", "'text-blue-\\x35\\x30\\x30'"
    ]) check(`«x»: ${literal}\nprint(«x»)\n`)
  })

  it("normalizes multiline classes and Python whitespace escapes", () => check(`
«x|text-blue-500 font-bold»: """text-blue-500
    font-bold"""
«y|italic underline»: 'italic\\tunderline'
print(«x|text-blue-500 font-bold», «y|italic underline»)
`))

  it("passes through variants, arbitrary values, and v4 important modifiers", () => check(`
«x|text-[#123456] hover:underline font-bold!»: 'text-[#123456] hover:underline font-bold!'
print(«x|text-[#123456] hover:underline font-bold!»)
`))

  it("ignores nonliteral annotations and incomplete strings", () => {
    for (let annotation of ["int", "list[str]", "f'text-{color}'", "b'text-blue-500'", "'text-blue-500", "'a' + 'b'", "''"])
      check(`x: ${annotation}\nprint(x)\n`)
  })

  it("removes styles when an annotation is changed or deleted", () => {
    let doc = "def foo(x: 'text-blue-500'):\n    return x\n"
    let state = stateFor(doc)
    ist(styles(state).length, 2)
    let from = doc.indexOf("'"), to = doc.lastIndexOf("'") + 1
    state = state.update({changes: {from, to, insert: "'text-red-500'"}}).state
    ist(JSON.stringify(styles(state).map(s => s[2])), JSON.stringify(["text-red-500", "text-red-500"]))
    state = state.update({changes: {from: from - 2, to}}).state
    ist(styles(state).length, 0)
  })

  it("analyzes bindings beyond the initial incremental parse budget", () => {
    let doc = "def foo(x: 'text-blue-500'):\n" + "    print(x)\n".repeat(2000)
    ist(styles(stateFor(doc)).length, 2001)
  })
})

describe("Python Tailwind return annotation inference", () => {
  it("styles assignments and references using a function's return annotation", () => check(`
def foo() -> 'bg-red-300':
    return 42
«x|bg-red-300» = foo()
print(«x|bg-red-300»)
foo()
`))

  it("supports local assignments, closures, and functions declared later", () => check(`
def consume():
    «x» = foo()
    def closure():
        return «x»
    return «x», closure()
def foo() -> 'text-blue-500':
    return 42
x = 0
`))

  it("resolves nested functions in the caller's lexical scope", () => check(`
def foo() -> 'text-blue-500':
    return 1
def outer():
    def foo() -> 'italic':
        return 2
    «x|italic» = foo()
    return «x|italic»
«x» = foo()
print(«x»)
`))

  it("gives explicit annotations precedence regardless of declaration order", () => check(`
def foo() -> 'text-blue-500':
    return 1
«a|bg-blue-300»: 'bg-blue-300' = foo()
«b|italic»: 'italic'
«b|italic» = foo()
«c|underline» = foo()
«c|underline»: 'underline'
def consume(«x|font-bold»: 'font-bold'):
    «x|font-bold» = foo()
    return «x|font-bold»
print(«a|bg-blue-300», «b|italic», «c|underline»)
`))

  it("allows empty or ordinary explicit annotations to suppress inference", () => check(`
def foo() -> 'text-blue-500':
    return 1
a: '' = foo()
b: int = foo()
c = foo()
c: ''
print(a, b, c)
`))

  it("handles chained assignments and parenthesized names and calls", () => check(`
def foo() -> 'text-blue-500':
    return 1
«a» = «b» = foo()
(«c») = ((foo()))
«d» = (foo)()
print(«a», «b», «c», «d»)
`))

  it("handles keyword arguments and comments without inferring from arguments", () => check(`
def foo(value=0) -> 'text-blue-500':
    return value
def plain(value):
    return value
«x» = foo(value=42)  # x = other()
y = plain(foo())
print(«x», y)
`))

  it("supports all supported string literal forms and utility syntax in returns", () => {
    for (let annotation of [
      "'text-blue-500'", '"""text-blue-500"""', "r'text-blue-500'",
      "('text-' 'blue-500')", "u'text-blue-500'"
    ]) check(`def foo() -> ${annotation}: return 1\n«x» = foo()\nprint(«x»)\n`)
    check(`
def foo() -> """text-[#123456]
    hover:underline font-bold!""":
    return 1
«x|text-[#123456] hover:underline font-bold!» = foo()
print(«x|text-[#123456] hover:underline font-bold!»)
`)
  })

  it("ignores nonliteral, missing, empty, and incomplete return annotations", () => {
    for (let annotation of ["", " -> int", " -> ''", " -> f'text-{color}'", " -> b'text-blue-500'", " -> 'a' + 'b'"])
      check(`def foo()${annotation}: return 1\nx = foo()\nprint(x)\n`)
    check("def foo() -> 'text-blue-500\nx = foo()\nprint(x)\n")
  })

  it("does not resolve an outer function through a parameter or other local binding", () => {
    check(`
def foo() -> 'text-blue-500': return 1
def consume(foo):
    x = foo()
    return x
`)
    for (let binding of [
      "foo = replacement", "import foo", "from module import foo",
      "def foo(): return 2", "class foo: pass",
      "for foo in factories:\\n        pass",
      "with factory() as foo:\\n        pass"
    ]) check(`
def foo() -> 'text-blue-500': return 1
def consume():
    x = foo()
    ${binding.replace(/\\n/g, "\n")}
    return x
`)
  })

  it("does not infer from reassigned or multiply defined function names", () => {
    for (let rebinding of ["foo = replacement", "import foo", "def foo() -> 'italic': return 2"])
      check(`def foo() -> 'text-blue-500': return 1\nx = foo()\n${rebinding}\nprint(x)\n`)
    check(`
foo = replacement
def foo() -> 'text-blue-500': return 1
x = foo()
print(x)
`)
  })

  it("respects global and nonlocal function lookup and assignment targets", () => check(`
def foo() -> 'text-blue-500': return 1
«x» = 0
def outer():
    «y|italic» = 0
    def local() -> 'italic': return 2
    def inner():
        global foo, «x»
        nonlocal local, «y|italic»
        «x» = foo()
        «y|italic» = local()
        return «x», «y|italic»
    return «y|italic»
print(«x»)
`))

  it("accounts for rebindings made through global and nonlocal directives", () => check(`
def foo() -> 'text-blue-500': return 1
def replace():
    global foo
    foo = replacement
x = foo()
def outer():
    def local() -> 'italic': return 2
    def inner():
        nonlocal local
        local = replacement
    y = local()
    return y
print(x)
`))

  it("creates a global result binding when it is first assigned inside a function", () => check(`
def foo() -> 'text-blue-500': return 1
def consume():
    global «x»
    «x» = foo()
print(«x»)
`))

  it("does not leak an inferred style into shadowing bindings", () => check(`
def foo() -> 'text-blue-500': return 1
«x» = foo()
def consume(x):
    return x
def local():
    x = 2
    return x
items = [x for x in values]
print(«x»)
`))

  it("skips class namespaces when resolving functions in methods", () => check(`
def foo() -> 'text-blue-500': return 1
class Example:
    def foo() -> 'italic': return 2
    «local|italic» = foo()
    def method(self):
        «result» = foo()
        return «result»
`))

  it("does not infer through imports, aliases, attributes, unpacking, or compound expressions", () => check(`
def foo() -> 'text-blue-500': return 1
alias = foo
from external import factory
a = alias()
b = factory()
c = obj.foo()
d, e = foo()
[f, g] = foo()
h = foo() + 1
i = foo(), 1
j = foo() if condition else 1
obj.value = foo()
items[0] = foo()
copy = a
print(a, b, c, d, e, f, g, h, i, j, copy)
`))

  it("uses the last resolved annotated call as a binding's fallback style", () => check(`
def foo() -> 'text-blue-500': return 1
def bar() -> 'italic': return 2
«x|italic» = foo()
«x|italic» = bar()
«x|italic» = 3
print(«x|italic»)
`))

  it("updates inferred styles when return annotations, callees, and bindings change", () => {
    let state = stateFor("def foo() -> 'bg-red-300': return 42\nx = foo()\nprint(x)\n")
    const expect = (classes: string | null) =>
      ist(JSON.stringify(styles(state).map(s => s[2])), JSON.stringify(classes ? [classes, classes] : []))
    function edit(from: string, to: string) {
      let pos = state.doc.toString().indexOf(from)
      ist(pos >= 0, true)
      state = state.update({changes: {from: pos, to: pos + from.length, insert: to}}).state
    }
    expect("bg-red-300")
    edit("bg-red-300", "bg-green-300")
    expect("bg-green-300")
    edit("x = foo()", "x = missing()")
    expect(null)
    edit("x = missing()", "x = foo()")
    expect("bg-green-300")
    edit("x = foo()", "x: 'bg-blue-300' = foo()")
    expect("bg-blue-300")
    edit("x: 'bg-blue-300'", "x")
    expect("bg-green-300")
    edit(" -> 'bg-green-300'", "")
    expect(null)
  })
})
