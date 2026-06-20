const fs = require("fs")
const c = fs.readFileSync(process.argv[2], "utf8")
let braces = 0, parens = 0, brackets = 0
let inStr = null, inTmpl = false, inRegex = false
let lastOpen = { brace: -1, paren: -1, bracket: -1 }

for (let i = 0; i < c.length; i++) {
  const ch = c[i], pr = c[i - 1]

  // Strings
  if (inStr) {
    if (ch === inStr && pr !== "\\") inStr = null
    continue
  }
  // Template literals
  if (ch === "`" && !inStr && !inRegex) { inTmpl = !inTmpl; continue }
  if (inTmpl) {
    if (ch === "`" && pr !== "\\") { inTmpl = false }
    // Handle template escapes
    if (ch === "$" && c[i + 1] === "{") { /* expression inside template - skip */ }
    continue
  }
  // Regex
  if (ch === "/" && pr !== "\\" && !inStr && !inTmpl) {
    const prevNonSpace = c.slice(0, i).trimEnd().slice(-1)
    if (prevNonSpace === "" || prevNonSpace === "(" || prevNonSpace === "=" || prevNonSpace === "," || prevNonSpace === "!" || prevNonSpace === "&" || prevNonSpace === "|" || prevNonSpace === ";" || prevNonSpace === "{") {
      inRegex = true
      continue
    }
  }
  if (inRegex) {
    if (ch === "/" && pr !== "\\") inRegex = false
    continue
  }

  if (ch === '"' || ch === "'") inStr = ch
  else if (ch === "{") { braces++; lastOpen.brace = i }
  else if (ch === "}") braces--
  else if (ch === "(" && !inRegex) { parens++; lastOpen.paren = i }
  else if (ch === ")" && !inRegex) parens--
  else if (ch === "[" && !inRegex) { brackets++; lastOpen.bracket = i }
  else if (ch === "]" && !inRegex) brackets--
}

console.log(`Braces: ${braces}, Parens: ${parens}, Brackets: ${brackets}`)
if (braces > 0) console.log(`Last { at line ${c.slice(0, lastOpen.brace).split("\n").length}: ${c.slice(Math.max(0,lastOpen.brace-30), lastOpen.brace+1)}`)
if (parens > 0) console.log(`Last ( at line ${c.slice(0, lastOpen.paren).split("\n").length}: ${c.slice(Math.max(0,lastOpen.paren-40), lastOpen.paren+1)}`)
if (brackets > 0) console.log(`Last [ at line ${c.slice(0, lastOpen.bracket).split("\n").length}: ${c.slice(Math.max(0,lastOpen.bracket-40), lastOpen.bracket+1)}`)
