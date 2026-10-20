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

  it("ignores properties, keyword labels, comments, literal text, and return annotations", () => check(`
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
