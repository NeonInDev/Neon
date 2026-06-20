const fs = require("fs")
const c = fs.readFileSync(process.argv[2], "utf8")
let bq = 0, sq = 0, dq = 0
let inStr = null, inTmpl = false, inRegex = false
let lines = c.split("\n")

for (let i = 0; i < c.length; i++) {
  const ch = c[i], pr = c[i - 1]
  if (inStr) { if (ch === inStr && pr !== "\\") inStr = null; continue }
  if (ch === "`" && !inStr && !inRegex) { inTmpl = !inTmpl; bq++; continue }
  if (inTmpl) { if (ch === "`" && pr !== "\\") inTmpl = false; continue }
  
  // simple regex detection
  if (ch === "/" && !inStr && !inTmpl && !inRegex) {
    const prev = c.slice(Math.max(0,i-5), i).trim()
    if (/[=(,!&|;:{]\s*$/.test(prev)) { inRegex = true; continue }
  }
  if (inRegex) { if (ch === "/" && pr !== "\\") inRegex = false; continue }
  
  if (ch === '"') { dq++; inStr = ch }
  else if (ch === "'") { sq++; inStr = ch }
}

console.log(`Backticks: ${bq} (${bq % 2 === 0 ? "even" : "ODD!"})`)
console.log(`Single quotes: ${sq} (${sq % 2 === 0 ? "even" : "ODD!"})`)
console.log(`Double quotes: ${dq} (${dq % 2 === 0 ? "even" : "ODD!"})`)
