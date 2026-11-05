import assert from "node:assert/strict"
import {createServer} from "node:http"
import {readFile} from "node:fs/promises"
import {extname} from "node:path"
import {chromium} from "playwright"

// Stable fixtures let the demo's examples evolve without changing regression
// checks for scoping, themes, and edits.
const basics = `def foo(x: 'text-blue-500'):
    return x * x + x
def greet(name: 'text-violet-600 font-semibold'):
    message: 'text-emerald-600 italic' = f"Hello, {name}"
    print(message)
    return message
score: 'bg-amber-100 text-amber-800 rounded px-1' = 42
print(score)
def plain(x):
    return x
`
const scopes = `def outer(x: 'text-blue-500 font-bold'):
    def closure():
        return x
    def shadow(x):
        return x  # This parameter has no annotation.
    def recolored(x: 'text-rose-600 underline'):
        return x
    return x, closure(), shadow(2), recolored(3)
`
const returns = `def foo() -> 'bg-red-300':
    return 42
x = foo()
print(x)
y: 'bg-blue-300' = foo()
print(y)
def nested():
    def foo() -> 'bg-emerald-200':
        return 7
    result = foo()
    return result
`

const root = new URL("./dist/", import.meta.url)
const types = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".map": "application/json"}
const server = createServer(async (req, res) => {
  const file = req.url == "/" ? "index.html" : req.url.slice(1)
  if (!/^[\w.-]+$/.test(file)) { res.writeHead(404).end(); return }
  try {
    const data = await readFile(new URL(file, root))
    res.writeHead(200, {"Content-Type": types[extname(file)] || "application/octet-stream"}).end(data)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))

let browser
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {})
  })
  const page = await browser.newPage({viewport: {width: 1280, height: 1000}})
  const loadCode = code => page.evaluate(doc => {
    window.view.dispatch({changes: {from: 0, to: window.view.state.doc.length, insert: doc}, selection: {anchor: 0}})
  }, code)
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  await page.route("**/*", route => {
    const url = new URL(route.request().url())
    return url.hostname == "127.0.0.1" ? route.continue() : route.abort()
  })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.view && document.querySelector("[data-python-tailwind]"))
  await loadCode(basics)
  await page.waitForFunction(() => {
    const x = document.querySelector('[data-python-tailwind].text-blue-500')
    return x && getComputedStyle(x).color == "oklch(0.623 0.214 259.815)"
  })
  assert.equal(await page.locator('[data-python-tailwind].text-blue-500').count(), 4)
  assert.equal(await page.getByRole("combobox", {name: "Syntax highlighting theme"}).inputValue(), "github-light")

  // Theme changes preserve state. Check the text's own parent, since a
  // syntax span nested inside an annotation can override its visible color.
  const beforeTheme = await page.evaluate(() => ({
    doc: window.view.state.doc.toString(), selection: window.view.state.selection.toJSON()
  }))
  const palettes = {
    "github-light": {keyword: "rgb(215, 58, 73)", background: "rgb(255, 255, 255)"},
    "vscode-light": {keyword: "rgb(0, 0, 255)", background: "rgb(255, 255, 255)"},
    "solarized-light": {keyword: "rgb(133, 153, 0)", background: "rgb(253, 246, 227)"},
    monokai: {keyword: "rgb(249, 38, 114)", background: "rgb(39, 40, 34)"},
    dark: {keyword: "rgb(198, 120, 221)", background: "rgb(40, 44, 52)"},
    plain: {keyword: null, background: "rgb(255, 255, 255)"},
    light: {keyword: "rgb(119, 0, 136)", background: "rgb(255, 255, 255)"}
  }
  for (const [theme, palette] of Object.entries(palettes)) {
    await page.getByRole("combobox", {name: "Syntax highlighting theme"}).selectOption(theme)
    assert.deepEqual(await page.evaluate(() => ({
      doc: window.view.state.doc.toString(), selection: window.view.state.selection.toJSON()
    })), beforeTheme)
    const colors = await page.locator('[data-python-tailwind].text-blue-500').evaluateAll(nodes => nodes.map(node => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()
      return getComputedStyle(text.parentElement).color
    }))
    assert.deepEqual(colors, Array(4).fill("oklch(0.623 0.214 259.815)"))
    assert.equal(await page.locator("#editor .cm-editor").evaluate(node => getComputedStyle(node).backgroundColor),
                 palette.background)
    const keyword = page.locator(".cm-content span").filter({hasText: /^def$/})
    if (theme == "plain") assert.equal(await keyword.count(), 0)
    else assert.equal(await keyword.first().evaluate(node => getComputedStyle(node).color),
                      palette.keyword)
    if (theme == "github-light") {
      // Function tags must be shared between the parser and the theme.
      const functions = page.locator(".cm-content span").filter({hasText: /^(foo|greet|plain|print)$/})
      assert.deepEqual(await functions.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)),
                       Array(5).fill("rgb(36, 41, 46)"))
      const strings = page.locator(".cm-content span").filter({hasText: /^('text-blue-500'|f"Hello, )$/})
      assert.deepEqual(await strings.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color)),
                       Array(2).fill("oklch(0.596 0.145 163.225)"))
    }
  }

  // New classes must compile at runtime, including a previously unseen color.
  await page.evaluate(() => {
    const doc = window.view.state.doc.toString(), from = doc.indexOf("text-blue-500")
    window.view.dispatch({changes: {from, to: from + 13, insert: "text-[#123456] font-bold"}})
  })
  await page.waitForFunction(() => {
    const x = document.querySelector('[data-python-tailwind].font-bold')
    return x && getComputedStyle(x).color == "rgb(18, 52, 86)" && getComputedStyle(x).fontWeight == "700"
  })
  assert.equal(await page.locator('[data-python-tailwind].font-bold').count(), 4)

  // Remove the annotation and check that stale decorations disappear.
  await page.evaluate(() => {
    const doc = window.view.state.doc.toString(), from = doc.indexOf(": 'text-[#123456]")
    const to = doc.indexOf("'", from + 3) + 1
    window.view.dispatch({changes: {from, to}})
  })
  await page.waitForFunction(() => !document.querySelector("[data-python-tailwind].font-bold"))
  await loadCode(basics)
  await page.waitForFunction(() => document.querySelectorAll('[data-python-tailwind].text-blue-500').length == 4)

  await page.locator("#enabled").uncheck()
  assert.equal(await page.locator("[data-python-tailwind]").count(), 0)
  await page.locator("#enabled").check()
  assert.equal(await page.locator('[data-python-tailwind].text-blue-500').count(), 4)

  await loadCode(scopes)
  assert.equal(await page.locator('[data-python-tailwind].text-blue-500').count(), 3)
  assert.equal(await page.locator('[data-python-tailwind].text-rose-600').count(), 2)
  const plainReferences = await page.locator(".cm-line").filter({hasText: "return x  # This parameter"}).locator("[data-python-tailwind]").count()
  assert.equal(plainReferences, 0)

  await loadCode(returns)
  await page.waitForFunction(() => {
    const x = document.querySelector('[data-python-tailwind].bg-red-300')
    return x && getComputedStyle(x).backgroundColor == "oklch(0.808 0.114 19.571)"
  })
  assert.equal(await page.locator('[data-python-tailwind].bg-red-300').count(), 2)
  assert.equal(await page.locator('[data-python-tailwind].bg-blue-300').count(), 2)
  assert.equal(await page.locator('[data-python-tailwind].bg-emerald-200').count(), 2)
  // Editing the return annotation updates inferred styles, while the
  // explicitly annotated variable keeps its own background.
  await page.evaluate(() => {
    const doc = window.view.state.doc.toString(), from = doc.indexOf("bg-red-300")
    window.view.dispatch({changes: {from, to: from + 10, insert: "bg-[#d1fae5]"}})
  })
  await page.waitForFunction(() => {
    const xs = [...document.querySelectorAll("[data-python-tailwind]")].filter(n => n.textContent == "x")
    return xs.length == 2 && xs.every(n => getComputedStyle(n).backgroundColor == "rgb(209, 250, 229)")
  })
  assert.equal(await page.locator('[data-python-tailwind].bg-blue-300').count(), 2)
  await page.evaluate(() => {
    const doc = window.view.state.doc.toString(), annotation = " -> 'bg-[#d1fae5]'"
    const from = doc.indexOf(annotation)
    window.view.dispatch({changes: {from, to: from + annotation.length}})
  })
  await page.waitForFunction(() => ![...document.querySelectorAll("[data-python-tailwind]")].some(n => n.textContent == "x"))
  assert.equal(await page.locator('[data-python-tailwind].bg-blue-300').count(), 2)

  await page.locator("#example").selectOption("utilities")
  await page.waitForFunction(() => {
    const color = [...document.querySelectorAll("[data-python-tailwind]")].find(n => n.textContent == "color")
    return color && getComputedStyle(color).color == "rgb(124, 58, 237)"
  })
  const hover = page.locator("[data-python-tailwind]").filter({hasText: /^hover_me$/}).first()
  await hover.hover()
  await page.waitForFunction(() => {
    const node = [...document.querySelectorAll("[data-python-tailwind]")].find(n => n.textContent == "hover_me")
    return node && getComputedStyle(node).textDecorationLine == "underline"
  })

  // Function backgrounds and padding work across themes and preserve earlier
  // styles. The nested function uses its own annotation.
  await page.locator("#example").selectOption("functions")
  await page.waitForFunction(() => {
    const names = document.querySelectorAll('[data-python-tailwind].bg-red-500')
    return names.length == 2 && [...names].every(n => getComputedStyle(n).backgroundColor == "oklch(0.637 0.237 25.331)")
  })
  for (const theme of Object.keys(palettes)) {
    await page.getByRole("combobox", {name: "Syntax highlighting theme"}).selectOption(theme)
    const names = page.locator('[data-python-tailwind].bg-red-500')
    assert.deepEqual(await names.evaluateAll(nodes => nodes.map(node => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()
      const style = getComputedStyle(node)
      return [style.backgroundColor, style.padding, getComputedStyle(text.parentElement).color]
    })), Array(2).fill(["oklch(0.637 0.237 25.331)", "4px", "rgb(255, 255, 255)"]))
    const earlierNames = page.locator('[data-python-tailwind].bg-blue-500')
    assert.deepEqual(await earlierNames.evaluateAll(nodes => nodes.map(node => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()
      const style = getComputedStyle(node)
      return [style.backgroundColor, style.padding, getComputedStyle(text.parentElement).color]
    })), Array(3).fill(["oklch(0.623 0.214 259.815)", "4px", "rgb(255, 255, 255)"]))
    assert.equal(await page.locator('[data-python-tailwind].bg-teal-600.p-1').count(), 3)
    assert.equal(await page.locator('[data-python-tailwind]').filter({hasText: /^x$/}).count(), 0)
  }
  await page.evaluate(() => {
    const annotation = "foo: 'bg-red-500 text-white p-1'\n"
    const from = window.view.state.doc.toString().indexOf(annotation)
    window.view.dispatch({changes: {from, to: from + annotation.length}})
  })
  assert.equal(await page.locator('[data-python-tailwind].bg-red-500').count(), 0)
  assert.equal(await page.locator('[data-python-tailwind].bg-blue-500.p-1').count(), 4)
  assert.equal(await page.locator('[data-python-tailwind]').filter({hasText: /^x$/}).count(), 0)
  await page.locator("#enabled").uncheck()
  assert.equal(await page.locator("[data-python-tailwind]").count(), 0)
  await page.locator("#enabled").check()
  assert.equal(await page.locator('[data-python-tailwind].bg-blue-500.p-1').count(), 4)

  // Test typing (rather than only programmatic changes), and editor isolation.
  await page.locator("#example").selectOption("basic")
  await page.locator(".cm-content").click()
  await page.keyboard.press("Control+End")
  await page.keyboard.type("\nnew_value: 'text-pink-600' = 1\nprint(new_value)")
  await page.waitForFunction(() => document.querySelectorAll('[data-python-tailwind].text-pink-600').length == 2)
  await page.evaluate(async () => {
    // A second editor uses the same language support but has its own state.
    const parent = document.createElement("div")
    document.body.appendChild(parent)
    const first = window.view
    const second = new first.constructor({
      state: first.state.update({changes: {from: 0, to: first.state.doc.length, insert: "print(x)"}}).state,
      parent
    })
    if (second.dom.querySelector("[data-python-tailwind]")) throw new Error("Styles leaked between editors")
    second.destroy()
    parent.remove()
  })

  // Exercise scrolling and asynchronous parsing on a document larger than
  // CodeMirror's initial parse window.
  await page.evaluate(() => {
    const code = "def big(x: 'text-blue-500'):\n" + "    print(x)\n".repeat(2000)
    window.view.dispatch({changes: {from: 0, to: window.view.state.doc.length, insert: code}})
  })
  await page.locator(".cm-content").click()
  await page.keyboard.press("Control+End")
  await page.waitForFunction(() => {
    const lines = [...document.querySelectorAll(".cm-line")]
    const last = lines[lines.length - 2]
    return last?.querySelector('[data-python-tailwind].text-blue-500')
  })

  await page.locator("#reset").click()
  await page.getByRole("combobox", {name: "Syntax highlighting theme"}).selectOption("github-light")
  await page.screenshot({path: new URL("./dist/demo.png", import.meta.url).pathname, fullPage: true})
  await page.setViewportSize({width: 390, height: 844})
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log("Browser checks passed: themes, function names, source-order styles, visible annotation colors, return inference, explicit overrides, dynamic utilities, edits, scope, hover, toggle, typing, isolation, scrolling, and mobile layout.")
} finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
}
