const fs = require("fs")
const c = fs.readFileSync(process.argv[2], "utf8")

// Remove strings, template literals, regex literals, comments
let cleaned = ""
let inStr = null, inTmpl = false, inRegex = false, inBlockComment = false
let pendingRegex = false

for (let i = 0; i < c.length; i++) {
  const ch = c[i], pr = c[i - 1], nx = c[i + 1]

  if (inBlockComment) {
    if (ch === "*" && nx === "/") { inBlockComment = false; i++ }
    continue
  }
  if (inStr) {
    if (ch === inStr && pr !== "\\") inStr = null
    continue
  }
  if (inTmpl) {
    if (ch === "`" && pr !== "\\") inTmpl = false
    continue
  }
  if (inRegex) {
    if (ch === "/" && pr !== "\\") inRegex = false
    continue
  }

  // Line comment
  if (ch === "/" && nx === "/") {
    while (i < c.length && c[i] !== "\n") i++
    continue
  }
  // Block comment
  if (ch === "/" && nx === "*") { inBlockComment = true; i++; continue }
  // Regex
  if (ch === "/" && !inStr && !inTmpl) {
    const prev = cleaned.trimEnd().slice(-1)
    if (/[=(,!&|;:{?]/.test(prev) || prev === "" || prev === "~" || prev === "!" || /\b(return|case|typeof|instanceof|new|delete|void|throw|in|of)\s*$/.test(cleaned.trimEnd())) {
      inRegex = true; continue
    }
  }
  // Template literal
  if (ch === "`") { inTmpl = true; continue }
  // String
  if (ch === '"' || ch === "'") { inStr = ch; continue }

  cleaned += ch
}

// Now check balance in cleaned code
let braces = 0, parens = 0, brackets = 0
let lastBraceOpen = -1, lastParenOpen = -1, lastBracketOpen = -1
for (let i = 0; i < cleaned.length; i++) {
  const ch = cleaned[i]
  if (ch === "{") { braces++; lastBraceOpen = i }
  else if (ch === "}") braces--
  else if (ch === "(") { parens++; lastParenOpen = i }
  else if (ch === ")") parens--
  else if (ch === "[") { brackets++; lastBracketOpen = i }
  else if (ch === "]") brackets--
}

console.log(`Braces: ${braces}, Parens: ${parens}, Brackets: ${brackets}`)
if (braces > 0) console.log(`Last { at approx line ${cleaned.slice(0,lastBraceOpen).split("\n").length}`)
if (parens > 0) console.log(`Last ( at approx line ${cleaned.slice(0,lastParenOpen).split("\n").length}`)
if (brackets > 0) console.log(`Last [ at approx line ${cleaned.slice(0,lastBracketOpen).split("\n").length}`)
