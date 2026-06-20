const fs = require("fs")
const c = fs.readFileSync(process.argv[2], "utf8")
let braces = 0, parens = 0, brackets = 0
let inStr = null, inTmpl = false
let lastBraceOpen = -1, lastParenOpen = -1, lastBracketOpen = -1

for (let i = 0; i < c.length; i++) {
  const ch = c[i], pr = c[i - 1]
  if (inStr) {
    if (ch === inStr && pr !== "\\") inStr = null
    continue
  }
  if (ch === "`" && !inStr) { inTmpl = !inTmpl; continue }
  if (inTmpl) { if (ch === "`" && pr !== "\\") inTmpl = false; continue }
  if (ch === '"' || ch === "'") inStr = ch
  else if (ch === "{") { braces++; lastBraceOpen = i }
  else if (ch === "}") braces--
  else if (ch === "(") { parens++; lastParenOpen = i }
  else if (ch === ")") parens--
  else if (ch === "[") { brackets++; lastBracketOpen = i }
  else if (ch === "]") brackets--
}

console.log(`Braces: ${braces}, Parens: ${parens}, Brackets: ${brackets}`)
if (braces > 0) console.log(`Last { at line ${c.slice(0, lastBraceOpen).split("\n").length}`)
if (parens > 0) console.log(`Last ( at line ${c.slice(0, lastParenOpen).split("\n").length}`)
if (brackets > 0) console.log(`Last [ at line ${c.slice(0, lastBracketOpen).split("\n").length}`)
