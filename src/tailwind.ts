import {SyntaxNode} from "@lezer/common"
import {syntaxTree} from "@codemirror/language"
import {EditorState, Extension, Prec, Range} from "@codemirror/state"
import {Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate} from "@codemirror/view"

type ScopeKind = "module" | "function" | "class" | "comprehension"

class Binding {
  classes: string | null = null
  annotated = false
  returnClasses: string | null = null
  definitions = 0
}

class Scope {
  bindings = new Map<string, Binding>()
  redirects = new Map<string, "global" | "nonlocal">()

  constructor(readonly kind: ScopeKind, readonly parent: Scope | null) {}

  outer(): Scope | null {
    let scope = this.parent
    // A class namespace isn't an enclosing lexical scope, even for a
    // method or comprehension written inside that class.
    while (scope?.kind == "class") scope = scope.parent
    return scope
  }

  binding(name: string): Binding {
    let binding = this.bindings.get(name)
    if (!binding) this.bindings.set(name, binding = new Binding)
    return binding
  }

  resolve(name: string): Binding | null {
    let redirect = this.redirects.get(name)
    if (redirect == "global") {
      let root: Scope = this
      while (root.parent) root = root.parent
      return root.binding(name)
    }
    if (redirect == "nonlocal") {
      for (let scope = this.outer(); scope && scope.kind != "module"; scope = scope.outer())
        if (scope.bindings.has(name) && !scope.redirects.has(name)) return scope.bindings.get(name)!
      return null
    }
    if (this.bindings.has(name)) return this.bindings.get(name)!
    return this.outer()?.resolve(name) || null
  }
}

function children(node: SyntaxNode): SyntaxNode[] {
  let result: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child)
  return result
}

function unparenthesize(node: SyntaxNode): SyntaxNode {
  while (node.name == "ParenthesizedExpression") {
    let parts = children(node).filter(n => n.name != "(" && n.name != ")" && n.name != "Comment")
    if (parts.length != 1) break
    node = parts[0]
  }
  return node
}

// Decode literals without evaluating Python. Unknown Python escapes retain
// their backslash, which is also useful in Tailwind arbitrary values.
function stringValue(state: EditorState, node: SyntaxNode): string | null {
  if (node.name == "ParenthesizedExpression") {
    let parts = children(node).filter(n => n.name != "(" && n.name != ")" && n.name != "Comment")
    return parts.length == 1 ? stringValue(state, parts[0]) : null
  }
  if (node.name == "ContinuedString") {
    let result = ""
    for (let child of children(node)) {
      if (child.name == "Comment") continue
      let value = stringValue(state, child)
      if (value == null) return null
      result += value
    }
    return result
  }
  if (node.name != "String") return null
  let source = state.sliceDoc(node.from, node.to)
  let match = /^([ru]?)("""|'''|"|')([\s\S]*)$/i.exec(source)
  if (!match) return null
  let [, prefix, quote, rest] = match
  if (rest.length < quote.length || !rest.endsWith(quote)) return null
  let value = rest.slice(0, -quote.length)
  if (prefix.toLowerCase() == "r") return value
  return value.replace(/\\(?:\r?\n|[\\'"abfnrtv]|x[\da-f]{2}|u[\da-f]{4}|U[\da-f]{8}|[0-7]{1,3})/gi, escape => {
    let char = escape.slice(1)
    if (char == "\n" || char == "\r\n") return ""
    let escapes: {[char: string]: string} = {
      "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v"
    }
    if (char in escapes) return escapes[char]
    let code = /^[0-7]/.test(char) ? parseInt(char, 8) : parseInt(char.slice(1), 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : escape
  })
}

function annotationClasses(state: EditorState, node: SyntaxNode | undefined): string | null {
  if (node?.name != "TypeDef") return null
  let parts = children(node).filter(n => n.name != ":" && n.name != "Comment")
  let value = parts.length == 1 ? stringValue(state, parts[0]) : null
  return value == null ? null : value.trim().split(/\s+/).filter(Boolean).join(" ") || null
}

// Keep analysis separate from the view so it can be tested without a DOM.
// Resolve references after gathering *all* bindings: Python assignments
// shadow an enclosing name throughout the function, even before assignment.
export function tailwindDecorations(state: EditorState): DecorationSet {
  let root = new Scope("module", null)
  let scopes = [root]
  let references: {node: SyntaxNode, scope: Scope}[] = []
  let assignments: {name: string, callee: string, scope: Scope}[] = []
  let text = (node: SyntaxNode) => state.sliceDoc(node.from, node.to)

  function bind(node: SyntaxNode, scope: Scope, annotation?: SyntaxNode | null, reference = true) {
    let binding = scope.binding(text(node))
    binding.definitions++
    if (annotation?.name == "TypeDef") {
      binding.annotated = true
      binding.classes = annotationClasses(state, annotation)
    }
    if (reference) references.push({node, scope})
    return binding
  }

  function target(node: SyntaxNode, scope: Scope, annotation?: SyntaxNode) {
    if (node.name == "VariableName") {
      bind(node, scope, annotation)
    } else if (/^(TupleExpression|ArrayExpression|ParenthesizedExpression)$/.test(node.name)) {
      for (let child of children(node)) target(child, scope, annotation)
    } else {
      // In obj.x / obj[index], obj and index are references, not bindings.
      visit(node, scope)
    }
  }

  function parameters(node: SyntaxNode, inner: Scope, outer: Scope) {
    let expectName = true
    for (let child of children(node)) {
      if (child.name == ",") expectName = true
      else if (expectName && child.name == "VariableName") {
        bind(child, inner, child.nextSibling)
        expectName = false
      } else if (child.name != "TypeDef") {
        // Defaults are evaluated in the enclosing scope.
        visit(child, outer)
      }
    }
  }

  function comprehension(node: SyntaxNode, outer: Scope) {
    let inner = new Scope("comprehension", outer), parts = children(node)
    scopes.push(inner)
    let firstFor = parts.findIndex(n => n.name == "for")
    if (firstFor < 0) {
      for (let child of parts) visit(child, outer)
      return
    }
    for (let i = 0; i < firstFor; i++) visit(parts[i], inner)
    for (let i = firstFor; i < parts.length;) {
      if (parts[i].name == "for") {
        let first = i == firstFor
        for (i++; i < parts.length && parts[i].name != "in"; i++) target(parts[i], inner)
        // Only the first iterable is evaluated outside the comprehension.
        if (++i < parts.length) visit(parts[i++], first ? outer : inner)
      } else {
        visit(parts[i++], inner)
      }
    }
  }

  function visit(node: SyntaxNode, scope: Scope): void {
    let parts = children(node)
    switch (node.name) {
      case "TypeDef":
      case "TypeParamList":
        return
      case "VariableName":
        references.push({node, scope})
        return
      case "FunctionDefinition":
      case "ClassDefinition":
      case "LambdaExpression": {
        let inner = new Scope(node.name == "ClassDefinition" ? "class" : "function", scope)
        scopes.push(inner)
        let name = node.name == "LambdaExpression" ? null : node.getChild("VariableName")
        if (name) {
          let binding = bind(name, scope, null, false)
          if (node.name == "FunctionDefinition")
            binding.returnClasses = annotationClasses(state, node.getChild("TypeDef") || undefined)
        }
        for (let child of parts) {
          if (name && child.from == name.from) continue
          if (child.name == "ParamList") parameters(child, inner, scope)
          else if (child.name == "Body" ||
                   (node.name == "LambdaExpression" && child.from > (node.getChild(":")?.from ?? node.to)))
            visit(child, inner)
          else visit(child, scope)
        }
        return
      }
      case "ArrayComprehensionExpression":
      case "SetComprehensionExpression":
      case "DictionaryComprehensionExpression":
      case "ComprehensionExpression":
        comprehension(node, scope)
        return
      case "AssignStatement": {
        let lastAssign = -1
        for (let i = 0; i < parts.length; i++) if (parts[i].name == "AssignOp") lastAssign = i
        for (let i = 0; i < parts.length; i++) {
          let child = parts[i]
          if (child.name == "TypeDef") continue
          if (i < lastAssign || (i == 0 && parts[i + 1]?.name == "TypeDef"))
            target(child, scope, parts[i + 1])
          else visit(child, scope)
        }
        // Only a whole call result assigned to a simple name is inferred.
        // Tuple unpacking, attributes, aliases, and compound expressions
        // require more information than a return annotation provides.
        let rhs = parts.slice(lastAssign + 1).filter(n => n.name != "Comment")
        let call = rhs.length == 1 ? unparenthesize(rhs[0]) : null
        let callee = call?.name == "CallExpression" && call.firstChild ? unparenthesize(call.firstChild) : null
        if (lastAssign >= 0 && callee?.name == "VariableName") {
          for (let from = 0, i = 0; i <= lastAssign; i++) if (parts[i].name == "AssignOp") {
            let lhs = parts.slice(from, i).filter(n => n.name != "TypeDef" && n.name != "Comment")
            let name = lhs.length == 1 ? unparenthesize(lhs[0]) : null
            if (name?.name == "VariableName") assignments.push({name: text(name), callee: text(callee), scope})
            from = i + 1
          }
        }
        return
      }
      case "NamedExpression": {
        // Assignment expressions in comprehensions bind in the containing
        // scope (PEP 572), unlike the iteration variables.
        let owner = scope
        while (owner.kind == "comprehension" && owner.parent) owner = owner.parent
        if (parts[0]) target(parts[0], owner)
        for (let child of parts.slice(1)) visit(child, scope)
        return
      }
      case "UpdateStatement":
      case "DeleteStatement":
        for (let i = 0; i < parts.length; i++) {
          if (node.name == "DeleteStatement" || i == 0) target(parts[i], scope)
          else visit(parts[i], scope)
        }
        return
      case "ForStatement": {
        let inTarget = false
        for (let child of parts) {
          if (child.name == "for") inTarget = true
          else if (child.name == "in") inTarget = false
          else if (inTarget) target(child, scope)
          else visit(child, scope)
        }
        return
      }
      case "WithStatement":
      case "TryStatement":
        for (let i = 0; i < parts.length; i++) {
          if (parts[i - 1]?.name == "as") target(parts[i], scope)
          else visit(parts[i], scope)
        }
        return
      case "ImportStatement": {
        let start = parts.findIndex(n => n.name == "import") + 1
        for (let i = start; i < parts.length;) {
          let end = i
          while (end < parts.length && parts[end].name != ",") end++
          let group = parts.slice(i, end), alias = group.findIndex(n => n.name == "as")
          let name = alias < 0 ? group.find(n => n.name == "VariableName") : group[alias + 1]
          if (name?.name == "VariableName") bind(name, scope)
          i = end + 1
        }
        return
      }
      case "ScopeStatement":
        for (let child of parts) if (child.name == "VariableName") {
          scope.redirects.set(text(child), parts[0].name as "global" | "nonlocal")
          references.push({node: child, scope})
        }
        return
      case "CapturePattern":
        for (let child of parts) if (child.name == "VariableName") bind(child, scope)
        return
      case "AsPattern":
        for (let child of parts) {
          if (child.name == "VariableName") bind(child, scope)
          else visit(child, scope)
        }
        return
      case "KeywordPattern":
        for (let child of parts) if (child.name != "VariableName") visit(child, scope)
        return
      case "ArgList":
        for (let i = 0; i < parts.length; i++)
          if (!(parts[i].name == "VariableName" && parts[i + 1]?.name == "AssignOp")) visit(parts[i], scope)
        return
      default:
        for (let child of parts) visit(child, scope)
    }
  }

  visit(syntaxTree(state).topNode, root)
  // Redirected assignments also count as rebindings of a function. Do this
  // after gathering all scopes so nonlocal names can be declared later.
  for (let scope of scopes) for (let [name, binding] of scope.bindings) {
    if (!scope.redirects.has(name)) continue
    let destination = scope.resolve(name)
    if (destination && destination != binding) {
      destination.definitions += binding.definitions
      if (binding.returnClasses != null) destination.returnClasses = binding.returnClasses
    }
  }
  for (let {name, callee, scope} of assignments) {
    let binding = scope.resolve(name), fn = scope.resolve(callee)
    if (binding && !binding.annotated && fn?.definitions == 1 && fn.returnClasses != null)
      binding.classes = fn.returnClasses
  }
  let marks: Range<Decoration>[] = [], styles = new Map<string, Decoration>()
  for (let {node, scope} of references) {
    let classes = scope.resolve(text(node))?.classes
    if (!classes) continue
    let mark = styles.get(classes)
    if (!mark) styles.set(classes, mark = Decoration.mark({class: classes, attributes: {"data-python-tailwind": ""}}))
    marks.push(mark.range(node.from, node.to))
  }
  return Decoration.set(marks, true)
}

const tailwindPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = tailwindDecorations(view.state)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || syntaxTree(update.startState) != syntaxTree(update.state))
      this.decorations = tailwindDecorations(update.state)
  }
}, {decorations: value => value.decorations})

/// Apply the classes in string annotations to variable declarations and
/// references in their Python lexical scope. Includes parameters, local
/// and module variables, closures, and shadowing. Direct calls to functions
/// defined in the document infer a style for assigned variables from the
/// function's return annotation. Explicit variable annotations take
/// precedence. Function and attribute names are not styled by inference.
///
/// This extension attaches class names; the host must provide Tailwind
/// CSS v4 (or other matching CSS). Use important utilities to override
/// syntax highlighting. No Python code is evaluated.
export function pythonTailwind(): Extension {
  // Higher-precedence decorations are nested inside syntax highlighting,
  // so token colors cannot override inherited annotation colors.
  return Prec.high(tailwindPlugin)
}
