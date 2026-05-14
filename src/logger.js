function log(level, msg, extra) {
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${agora}] [${level}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

module.exports = { log };
