const axios = require("axios");
const { log } = require("./logger");

// Config vinda do .env (injetada por dotenv no boot)
const LOGIN_URL = process.env.VERSALA_URL || "https://www.versala.com.br/portais/login.asp";
const NUMERO = process.env.VERSALA_NUMERO || "500";
const IDE = process.env.VERSALA_IDE || "77|77";
const RETORNO = "http://www.cevn-ba.com.br/PortalAluno/index.asp";
const BASE = "https://www.versala.com.br/portais/";

const LOGIN = process.env.VERSALA_LOGIN;
const SENHA = process.env.VERSALA_SENHA;
const PLURALL_LOGIN = process.env.PLURALL_LOGIN;
const PLURALL_SENHA = process.env.PLURALL_SENHA;

let sessaoCookies = null;

// Extrai cookies de resposta Set-Cookie e devolve string pra enviar
function extrairCookies(res) {
  const cookies = [];
  const sc = res.headers["set-cookie"];
  if (sc && Array.isArray(sc)) {
    for (const c of sc) cookies.push(c.split(";")[0]);
  }
  return cookies.join("; ");
}

async function login() {
  try {
    const form = new URLSearchParams();
    form.append("numero", NUMERO);
    form.append("ide", IDE);
    form.append("retorno", RETORNO);
    form.append("login", LOGIN);
    form.append("senha", SENHA);

    const res = await axios.post(LOGIN_URL, form.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 20000,
    });

    sessaoCookies = extrairCookies(res);
    const html = res.data || "";

    // A resposta é um script JS com logouEm('77/indexr.asp?...npl=XXXX')
    const m = html.match(/logouEm\(\s*'([^']+)'\s*\)/);
    if (!m) {
      log("WARN", "[VERSALA] Login sem redirect esperado");
      return { ok: false, erro: "Não conseguiu logar no Versala (resposta inesperada)." };
    }

    // Segue o redirect interno pra estabelecer a sessão real
    const redirectUrl = BASE + m[1].replace(/^\.?\/?/, "");
    await axios.get(redirectUrl, {
      headers: { Cookie: sessaoCookies, "User-Agent": "Mozilla/5.0" },
      maxRedirects: 0,
      validateStatus: () => true,
      timeout: 20000,
    });

    log("INFO", "[VERSALA] Login OK");
    return { ok: true, sessao: sessaoCookies };
  } catch (err) {
    log("ERROR", "[VERSALA] Falha no login", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

async function requester(url) {
  const res = await axios.get(BASE + url, {
    headers: { Cookie: sessaoCookies, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    validateStatus: () => true,
    timeout: 20000,
  });
  return res.data || "";
}

// Normaliza texto ISO-8859-1 pra UTF-8
function decodificar(html) {
  if (typeof html !== "string") return html;
  if (/<meta[^>]*charset=iso-8859-1/i.test(html)) {
    try {
      const buf = Buffer.from(html.replace(/^\uFEFF/, ""), "latin1");
      return buf.toString("utf8");
    } catch (e) {
      return html;
    }
  }
  return html;
}

// Limpa tags e entidades
function limpar(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&atilde;/gi, "ã")
    .replace(/&otilde;/gi, "õ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&atilde;/gi, "ã")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&ordm;/gi, "º")
    .replace(/&ordf;/gi, "ª")
    .replace(/&Ccedil;/gi, "Ç")
    .replace(/\s+/g, " ")
    .trim();
}

async function pegarBoletim() {
  const l = await login();
  if (!l.ok) return l;

  try {
    // 1) Página do boletim -> lista o aluno e dá o link do boletim geral
    let urlBoletim = "interface/rbol.asp?ide=77&apenasBoletimParcial=False&login=rl1809Lidi&senha=rG14441J80&tipoBoletimEdInfantil=naoConforme";
    let html = decodificar(await requester(urlBoletim));

    // Extrai o link cdb.asp (boletim geral) — vem dentro de javascript:abrir('...')
    const link = html.match(/(?:href="|abrir\(')([^"']*cdb\.asp[^"']*)(?:["'])/);
    if (!link) return { ok: false, erro: "Não encontrei o link do boletim geral no portal." };
    const cdbUrl = link[1].replace(/^[.\/]*interface\//, "interface/").replace(/^\.\.?\//, "").replace(/^[.]*\/?/, "");

    // 2) Boletim completo
    const boletimHtml = decodificar(await requester(cdbUrl));
    return parsearBoletim(boletimHtml);
  } catch (err) {
    log("ERROR", "[VERSALA] Erro ao buscar boletim", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

const ORDEM_DISCIPLINAS = [
  "Português", "Matemática", "Ciências", "Geografia", "Projeto de Vida",
  "História", "Ensino Religioso", "Artes", "Educação Física", "Inglês", "Redação",
];

function parsearBoletim(html) {
  const resultado = {
    ok: true,
    aluno: "LAVIS TESEU TORRES SALVADOR",
    serie: "8º Ano EF",
    turma: "D",
    turno: "Vespertino",
    ano: "2026",
    metaSemPF: 6,
    metaComPF: 5,
    disciplinas: [],
  };

  const linhasRaw = html.split(/<tr[^>]*valign="middle"[^>]*>/);

  for (let i = 1; i < linhasRaw.length; i++) {
    const bloco = linhasRaw[i];

    // Separa as <td> na ordem
    const tdContents = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let tm;
    while ((tm = tdRe.exec(bloco))) tdContents.push(limpar(tm[1]));

    // tdContents[0]=nome, [1]=CH. Depois células de nota em grupos de 4 por trimestre.
    if (tdContents.length < 3) continue;
    const cel = tdContents.slice(2); // remove nome e CH
    const nums = cel.map((c) => {
      const n = parseFloat(c.replace(",", "."));
      return isNaN(n) ? null : n;
    });

    // Nome: usa a lista fixa se possível (ordem das linhas), senão o texto da 1ª célula
    const idxDis = i - 1;
    const nome = ORDEM_DISCIPLINAS[idxDis] || limpar(tdContents[0]);

    const dis = {
      nome,
      trims: [nums[3], nums[7], nums[11]], // médias dos 3 trimestres
      avp: [nums[0], nums[4], nums[8]],
      tra: [nums[1], nums[5], nums[9]],
      avg: [nums[2], nums[6], nums[10]],
      totalPontos: nums[12],
    };
    resultado.disciplinas.push(dis);
  }

  if (!resultado.disciplinas.length) {
    return { ok: false, erro: "Não consegui varrer as disciplinas do boletim." };
  }

  // Calcula o que falta em cada disciplina (3º trimestre) pra passar sem/com PF
  for (const d of resultado.disciplinas) {
    const t1 = d.trims[0];
    const t2 = d.trims[1];
    const jaTem = (t1 || 0) + (t2 || 0);
    // Sem PF: precisa média final >= 6 => soma dos 3 trimestres >= 18
    const precisaSemPF = 18 - jaTem;
    // Com PF: média final >= 5 => soma >= 15
    const precisaComPF = 15 - jaTem;
    d.somaAtual = Math.round(jaTem * 10) / 10;
    d.precisaSemPF = mathClamp(precisaSemPF, 0, 10);
    d.precisaComPF = mathClamp(precisaComPF, 0, 10);
    d.mediaAtual = Math.round((jaTem / 2) * 100) / 100;
  }

  return resultado;
}

function mathClamp(v, min, max) {
  return Math.min(max, Math.max(min, Math.round(v * 10) / 10));
}

module.exports = {
  login,
  pegarBoletim,
  LOGIN,
  SENHA,
  PLURALL_LOGIN,
  PLURALL_SENHA,
};
