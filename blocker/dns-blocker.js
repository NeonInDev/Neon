// blocker/dns-blocker.js — resolver DNS local que bloqueia sites +18 (permanente).
// Roda na porta 53 (UDP+TCP) e encaminha o resto ao DNS padrão do sistema.
// Instalação: schtasks /Create /SC ONSTART /TN "NeonDNSBlock" /TR "node <caminho>" /RU SYSTEM /RL HIGHEST

const dgram = require("dgram");
const net = require("net");
const fs = require("fs");
const path = require("path");

const PORTA = 53;
const LOG = path.join(__dirname, "log.txt");
const MAX_LOG = 5 * 1024 * 1024;

const DIVIDAS = ["127.0.2.2", "127.0.2.3"];
const FALLBACK = ["8.8.8.8", "1.1.1.1"];
const UPSTREAMS = DIVIDAS.concat(FALLBACK);

const LISTA = [
  // sites adultos (conteúdo)
  "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "xhamsterlive.com",
  "redtube.com", "youporn.com", "tube8.com", "spankwire.com", "youjizz.com",
  "spankbang.com", "tnaflix.com", "alohatube.com", "erome.com", "jerkoff.to",
  "motherless.com", "porn.com", "adultempire.com", "bangbros.com",
  "brazzers.com", "naughtyamerica.com", "realitykings.com", "evilangel.com",
  "mofos.com", "teamskeet.com", "digitalplayground.com",
  "kink.com", "vixen.com", "blacked.com", "blackedraw.com",
  "babes.com", "milf.com", "badoinkvr.com", "vrbangers.com",
  // cams
  "chaturbate.com", "stripchat.com", "cam4.com", "livejasmin.com",
  "bongacams.com", "myfreecams.com", "camfrog.com", "cams.com", "camsoda.com",
  "shagle.com", "omegale.com",
  // creators adultos
  "onlyfans.com", "fansly.com", "justforfans.com",
  // hentai / anime
  "nhentai.net", "hentaihaven.xxx", "hanime.tv", "f95zone.to", "e-hentai.org",
  "rule34.xxx", "gelbooru.com", "danbooru.donmai.us", "sankakucomplex.com",
  "e621.net", "tbib.org", "konachan.com",
  // dating / adultos só
  "adultfriendfinder.com", "friendfinder.com", "ashleymadison.com",
  "seeking.com", "sugardaddymeet.com", "fling.com",
  // misc
  "sex.com", "xart.tv", "extremetube.com", "heavy-r.com", "porntrex.com",
  "hqporner.com",
];

const LISTA_SET = new Set(LISTA.map((d) => d.toLowerCase()));

function logar(msg) {
  const linha = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    const tamanho = fs.existsSync(LOG) ? fs.statSync(LOG).size : 0;
    if (tamanho > MAX_LOG) fs.unlinkSync(LOG);
    fs.appendFileSync(LOG, linha);
  } catch {}
  process.stdout.write(linha);
}

function parseQuery(buf) {
  const qd = buf.readUInt16BE(4);
  if (qd < 1) return null;
  let off = 12;
  const labels = [];
  for (;;) {
    const len = buf[off];
    if (len === 0) { off++; break; }
    if ((len & 0xc0) === 0xc0) { off += 2; break; }
    labels.push(buf.toString("latin1", off + 1, off + 1 + len).toLowerCase());
    off += 1 + len;
  }
  return { qname: labels.join("."), labels, fimQuery: off };
}

function ehBloqueado(parsed) {
  const labels = parsed.labels;
  for (let i = 0; i < labels.length; i++) {
    if (LISTA_SET.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

function respostaCodigo(buf, rcode) {
  const resp = Buffer.from(buf);
  const flags = (buf.readUInt16BE(2) | 0x8000) & ~0x000f;
  resp.writeUInt16BE(flags | rcode, 2);
  resp.writeUInt16BE(0, 6); // ancount = 0
  resp.writeUInt16BE(0, 8); // nscount = 0
  resp.writeUInt16BE(0, 10); // arcount = 0
  return resp;
}

function resolver(upstream, req) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket("udp4");
    const t = setTimeout(() => { try { s.close(); } catch {} reject(new Error("timeout " + upstream)); }, 2500);
    s.on("message", (m) => { clearTimeout(t); try { s.close(); } catch {} resolve(m); });
    s.on("error", (e) => { clearTimeout(t); try { s.close(); } catch {} reject(e); });
    s.send(req, 53, upstream, (e) => { if (e) { clearTimeout(t); try { s.close(); } catch {} reject(e); } });
  });
}

async function encaminhar(req) {
  for (const up of UPSTREAMS) {
    try {
      const m = await resolver(up, req);
      return m;
    } catch {}
  }
  return null;
}

async function tratar(buf, responder) {
  let parsed;
  try { parsed = parseQuery(buf); } catch {}
  if (!parsed) return;

  if (ehBloqueado(parsed)) {
    logar(`BLOQUEADO ${parsed.qname}`);
    responder(respostaCodigo(buf, 3)); // NXDOMAIN
    return;
  }

  let resp = await encaminhar(buf);
  if (!resp) {
    logar(`FALHA_DNS ${parsed.qname}`);
    resp = respostaCodigo(buf, 2); // SERVFAIL
  } else {
    resp = Buffer.from(resp);
    resp.writeUInt16BE(buf.readUInt16BE(0), 0); // devolve o ID original
  }
  responder(resp);
}

const udp = dgram.createSocket("udp4");
udp.on("message", (msg, rinfo) => {
  tratar(msg, (resp) => udp.send(resp, rinfo.port, rinfo.address).catch(() => {}));
});
udp.on("error", (e) => logar("ERRO udp: " + e.message));
udp.bind(PORTA, () => logar(`NeonDNSBlock escutando UDP :${PORTA}`));

const tcp = net.createServer((socket) => {
  let acc = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    acc = Buffer.concat([acc, chunk]);
    while (acc.length >= 2) {
      const len = acc.readUInt16BE(0);
      if (acc.length < 2 + len) break;
      const req = acc.slice(2, 2 + len);
      acc = acc.slice(2 + len);
      tratar(req, (resp) => {
        const cabecalho = Buffer.alloc(2);
        cabecalho.writeUInt16BE(resp.length, 0);
        socket.write(Buffer.concat([cabecalho, resp]));
      });
    }
  });
  socket.on("error", () => {});
});
tcp.on("error", (e) => logar("ERRO tcp: " + e.message));
tcp.listen(PORTA, "0.0.0.0", () => logar(`NeonDNSBlock escutando TCP :${PORTA}`));

process.on("SIGTERM", () => { try { udp.close(); } catch {} try { tcp.close(); } catch {} process.exit(0); });