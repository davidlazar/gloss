import {basicSetup, EditorView} from "codemirror"
import {Compartment} from "@codemirror/state"
import {defaultHighlightStyle, syntaxHighlighting} from "@codemirror/language"
import {oneDark} from "@codemirror/theme-one-dark"
import {githubLightInit} from "@uiw/codemirror-theme-github"
import {vscodeLight} from "@uiw/codemirror-theme-vscode"
import {monokai} from "@uiw/codemirror-theme-monokai"
import {solarizedLight} from "@uiw/codemirror-theme-solarized"
import {tags} from "@lezer/highlight"
import {python} from "@codemirror/lang-python"

const examples = {
  basic: `# Add tailwind CSS classes anywhere types are supported.
# Try changing amber to sky. Try adding 'ring-2' to the type.
def collatz(n: 'bg-amber-400 px-1 rounded-xl shadow'):
    sequence = [n]
    while n != 1:
        n = n // 2 if n % 2 == 0 else 3 * n + 1
        sequence.append(n)
    return sequence

def greet(yourname: 'bg-linear-to-r/longer from-red-500 to-violet-500 bg-clip-text text-transparent font-bold'):
    message: 'text-white text-shadow-lg text-shadow-cyan-700' = f"Hello, {yourname}"
    print(message)

score : 'bg-red-700 p-1 rounded text-white text-lg hover:bg-blue-600 inline-block rotate-5' = 0

def update_score():
    global score
    score += 1
    return score
`,
  functions: `# We can annotate function names
foo: 'bg-blue-500 text-white p-1'
def foo():
    return 42

x = foo()
print(x)

# Change the name's style from here onward.
foo: 'bg-red-500 text-white p-1'
print(foo())

# A nested function with the same name has its own binding.
def outer():
    foo: 'bg-teal-600 text-white p-1 underline'
    def foo():
        return 7
    return foo()

print(outer())
`,
  scopes: `def outer(x: 'bg-blue-600 text-white p-1 rounded-lg'):
    def closure():
        return x

    def shadow(x):
        return x

    def recolored(x: 'text-rose-600 underline'):
        return x

    return x, closure(), shadow(2), recolored(3)

items: 'bg-black p-1 text-pink-300' = [1, 2, 3]
result = [items * 2 for items in items]
print(items)
`,
  returns: `# The return annotation supplies a style for assigned results.
def foo() -> 'bg-pink-400 text-white p-1 rounded-full':
    return 42

x = foo()
print(x)

# An explicit variable annotation overrides the inferred style.
y: 'bg-teal-300 p-1' = foo()
print(y)

def nested():
    def foo() -> 'bg-yellow-200':
        return 7
    result = foo()
    return result
`,
  utilities: `def palette(
    color: 'text-[#7c3aed] font-bold',
    highlight: 'bg-sky-100 text-sky-800 rounded px-1',
    hover_me: 'text-blue-500 hover:text-rose-500 hover:underline',
):
    print(color, highlight, hover_me)
    return color, highlight, hover_me

note: """text-teal-700
         italic underline decoration-dotted""" = "Try more classes"
print(note)

# A return annotation styles assigned results, not the function name.
def unchanged() -> 'text-red-500':
    return "An ordinary string"
`
}

const language = new Compartment()
const syntaxTheme = new Compartment()
const checkbox = document.querySelector<HTMLInputElement>("#enabled")!
const select = document.querySelector<HTMLSelectElement>("#example")!
const themeSelect = document.querySelector<HTMLSelectElement>("#syntax-theme")!
const status = document.querySelector<HTMLElement>("#status")!

const lightTheme = EditorView.theme({
  "&": {color: "#24334b", backgroundColor: "#ffffff"},
  ".cm-gutters": {backgroundColor: "#f8fafc", borderRight: "1px solid #e2e8f0", color: "#94a3b8"},
  ".cm-activeLine": {backgroundColor: "#f1f5f966"},
  ".cm-activeLineGutter": {backgroundColor: "#eef2f6"}
})

const themes = {
  "github-light": githubLightInit({
    styles: [
      {tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "inherit"},
      {tag: tags.string, color: "oklch(0.596 0.145 163.225)"}
    ]
  }),
  light: [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
  "vscode-light": vscodeLight,
  "solarized-light": solarizedLight,
  monokai,
  dark: oneDark,
  // Register a highlighter with no styles to disable basicSetup's fallback.
  plain: [lightTheme, syntaxHighlighting({style: () => null})]
}

const view = new EditorView({
  doc: examples.basic,
  parent: document.querySelector("#editor")!,
  extensions: [
    basicSetup,
    language.of(python({tailwind: true})),
    syntaxTheme.of(themes[themeSelect.value as keyof typeof themes]),
    EditorView.contentAttributes.of({"aria-label": "Python code with Tailwind variable annotations"}),
    EditorView.theme({
      "&": {fontSize: "14px"},
      ".cm-content": {fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", padding: "20px 0"},
      ".cm-line": {padding: "0 20px"},
      ".cm-scroller": {overflow: "auto", lineHeight: "1.8"},
      "&.cm-focused": {outline: "2px solid #93c5fd", outlineOffset: "-2px"}
    })
  ]
})

themeSelect.addEventListener("change", () => {
  view.dispatch({effects: syntaxTheme.reconfigure(themes[themeSelect.value as keyof typeof themes])})
})

checkbox.addEventListener("change", () => {
  view.dispatch({effects: language.reconfigure(python({tailwind: checkbox.checked}))})
  status.textContent = checkbox.checked ? "Annotations on" : "Annotations off"
})

function loadExample() {
  view.dispatch({
    changes: {from: 0, to: view.state.doc.length, insert: examples[select.value as keyof typeof examples]},
    selection: {anchor: 0}
  })
}
select.addEventListener("change", loadExample)
document.querySelector("#reset")!.addEventListener("click", loadExample)

// Useful for experimenting in the console and for the browser regression test.
Object.assign(window, {view})
