import {build} from "esbuild"
import {copyFile, mkdir} from "node:fs/promises"
import {createRequire} from "node:module"
import {dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const output = resolve(here, "dist")

// Bundle the sibling checkout's source, and use one instance of each shared
// CodeMirror package even when that checkout has its own node_modules.
const alias = {
  "@codemirror/lang-python": resolve(here, "../src/python.ts")
}
for (const name of [
  "@codemirror/state", "@codemirror/view", "@codemirror/language",
  "@codemirror/autocomplete", "@lezer/common", "@lezer/highlight", "@lezer/python"
]) alias[name] = require.resolve(name)

await mkdir(output, {recursive: true})
await build({
  entryPoints: [resolve(here, "main.ts")],
  outfile: resolve(output, "editor.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias
})
await Promise.all([
  copyFile(resolve(here, "index.html"), resolve(output, "index.html")),
  copyFile(resolve(here, "demo.css"), resolve(output, "demo.css")),
  copyFile(require.resolve("@tailwindcss/browser"), resolve(output, "tailwind.js"))
])
console.log("Built demo/dist. Serve this directory with any static HTTP server.")
