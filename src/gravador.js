// Gravador de call: a Neon escuta os canais de voz fora do canal de staff,
// grava o audio de cada pessoa, transcreve e aplica warn automatico quando
// alguem fala palavra proibida.
//
// LIMITE DO DISCORD: um bot so pode estar conectado a UM canal de voz por
// servidor. Nao da para gravar varios canais ao mesmo tempo, entao o gravador
// escolhe o canal com mais gente (fora o staff) e troca quando ele esvazia.
//
// Uso:
//   const gravador = require("./gravador");
//   gravador.iniciar(client)                 // no boot
//   gravador.ligar(guildId) / desligar()     // /gravar
//   gravador.status(guildId)

const { joinVoiceChannel, VoiceConnectionStatus, entersState, EndBehaviorType } = require("@discordjs/voice");
const { log } = require("./logger");
const ffmpegPath = require("ffmpeg-static");
const { exec: execCb } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(execCb);
const fs = require("fs");
const path = require("path");

const exec = { windowsHide: true };

const RAIZ = path.join(__dirname, "..");
const ARQ = path.join(RAIZ, "data", "gravador.json");
const PASTA = path.join(RAIZ, "gravacoes");

const PADRAO = {
  ativo: false,          // vigilancia ligada?
  canalStaffId: null,    // canal de voz que NAO entra na gravacao
  pastaGravar: PASTA,
  aplicarWarn: true,     // aplica warn automatico em palavra proibida
  mutedSegundos: 0,      // 0 = nao muta, so avisa
  msMinimo: 2500,        // clip menor que isso e ruido, ignora
  msMaximo: 120000,      // corta o clip em 2 min para o arquivo nao crescer sem limite
  silencioMs: 1200,      // para de ouvir apos esse silencio
  apagarLimpo: true,     // apaga o audio quando nao achou nada (so guarda o transcript)
  avisarNoLog: true,     // manda o aviso no canal de log da automod
  versao: 1,
};

const CFG = { ...PADRAO };
let clientRef = null;
const timers = new Map();   // guildId -> { poll, conexoes, streams }
const sessoes = new Map();  // guildId -> { channelId, iniciadaEm, itens: [] }

function carregar() {
  try {
    if (fs.existsSync(ARQ)) Object.assign(CFG, JSON.parse(fs.readFileSync(ARQ, "utf8")));
  } catch (err) {
    log("WARN", "[GRAVADOR] config invalida, usando padrao", { erro: err.message });
  }
  return CFG;
}

function salvar() {
  fs.mkdirSync(path.dirname(ARQ), { recursive: true });
  fs.writeFileSync(ARQ, JSON.stringify(CFG, null, 2), "utf8");
}

// ---------- texto proibido ----------

// O Whisper alucina "[Musica]" em silencio, e a call ainda capta o som do
// ambiente. Isso nao pode virar warn. O clip so e descartado se for composto
// INTEIRAMENTE por essas palavras (comparadas ja sem acento).
const RUIDO_PALAVRAS = new Set([
  "musica", "music", "song", "som", "riso", "risos", "risada", "risadas",
  "laughter", "silencio", "aplausos", "clapping", "barulho", "noise",
  "ambiente", "ruido", "fundo", "tocando", "playing", "voz", "audio",
  "unintelligivel", "unintelligible", "inaudivel", "inaudivel", "mudo",
  "a", "o", "as", "os", "de", "do", "da",
  "das", "dos", "ao", "aos", "em", "no", "na", "e",
]);

function ehRuido(texto) {
  const limpo = normalizar(texto);
  if (!limpo) return true;
  const palavras = limpo.split(/[^a-z0-9]+/).filter(Boolean);
  if (!palavras.length) return true;
  return palavras.every((p) => RUIDO_PALAVRAS.has(p));
}

function normalizar(txt) {
  return String(txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Devolve as palavras proibidas que apareceram no texto (direta ou disfarce).
function checarProibidas(texto, guildId) {
  const automod = require("./automod");
  const cfg = automod.configGuild(guildId);
  const lista = [...new Set([
    ...(cfg?.filtros?.palavras || []),
    ...(automod.PALAVRAS_PADRAO || []),
  ])].filter(Boolean).map((p) => String(p).trim()).filter(Boolean);

  const alvo = normalizar(texto);
  if (!alvo) return [];
  const achadas = [];
  for (const p of lista) {
    const np = normalizar(p);
    if (np && alvo.includes(np)) achadas.push({ palavra: p, burla: false });
  }
  if (typeof automod.palavraBurla === "function") {
    for (const p of lista) {
      if (achadas.some((a) => normalizar(a.palavra) === normalizar(p))) continue;
      if (automod.palavraBurla(texto, p)) achadas.push({ palavra: p, burla: true });
    }
  }
  return achadas;
}

// ---------- audio ----------

function ehWavValido(caminho) {
  try {
    const buf = fs.readFileSync(caminho);
    return buf.length > 44 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
  } catch {
    return false;
  }
}

async function pcmParaWav(pcmPath, wavPath) {
  await execAsync(
    `"${ffmpegPath}" -f s16le -ar 48000 -ac 2 -i "${pcmPath}" -ar 16000 -ac 1 "${wavPath}" -y`,
    { ...exec, timeout: 20000 }
  );
  if (!ehWavValido(wavPath)) throw new Error("WAV invalido apos conversao");
}

async function wavParaMp3(wavPath, mp3Path) {
  await execAsync(`"${ffmpegPath}" -i "${wavPath}" -vn -ac 1 -b:a 48k "${mp3Path}" -y`, { ...exec, timeout: 20000 });
}

// ---------- transcricao + punicao ----------

async function analisar({ guild, guildId, user, member, texto, wavPath, canalNome }) {
  const automod = require("./automod");
  const stt = require("./stt");

  const res = await stt.transcribeFile(wavPath, {
    language: process.env.WHISPER_LANGUAGE || "pt",
    timeout: parseInt(process.env.STT_TIMEOUT_MS, 10) || 30000,
  }).catch(() => null);

  const transcricao = String(res?.text || "").trim();
  if (!transcricao || ehRuido(transcricao)) {
    return { transcricao: transcricao || null, violacoes: [], punido: false };
  }

  const violacoes = checarProibidas(transcricao, guildId);

  // O dono nunca e punido automaticamente por fala.
  if (violacoes.length && automod.ehOwner(guild, member || user)) {
    log("INFO", "[GRAVADOR] owner nao punido", { guild: guild.name, usuario: user.tag });
    return { transcricao, violacoes, punido: false, ownerIgnorado: true };
  }

  let punido = false;
  if (violacoes.length && CFG.aplicarWarn && member) {
    const termos = violacoes.map((v) => (v.burla ? `"${v.palavra}" (disfarce)` : `"${v.palavra}"`)).join(", ");
    const motivo = `Palavra proibida na call de ${canalNome}: ${termos}`;
    const r = await automod.darWarn(guild, user, motivo, clientRef?.users?.cache?.get(guild.ownerId) || user, {
      member,
      automatico: true,
      tipo: "palavraProibidaCall",
      autorId: clientRef?.user?.id || null,
      channelId: member.voice?.channelId || null,
    }).catch((e) => {
      log("WARN", "[GRAVADOR] darWarn falhou", { erro: e.message });
      return null;
    });
    punido = !!(r && !r.owner);

    if (CFG.mutedSegundos > 0 && punido && member.moderatable) {
      await member.timeout(CFG.mutedSegundos * 1000, `Call: ${motivo}`).catch(() => {});
    }

    if (CFG.avisarNoLog) {
      automod.registrarLog(guild, {
        cor: 0xed4245,
        titulo: "Fala proibida em call",
        campos: [
          { nome: "Usuario", valor: `<@${user.id}> (\`${user.tag}\`)`, inline: true },
          { nome: "Canal", valor: `${canalNome} (\`${member.voice?.channelId}\`)`, inline: true },
          { nome: "Palavra", valor: termos, inline: false },
          { nome: "Transcricao", valor: `\`\`\`${transcricao.slice(0, 900)}\`\`\``, inline: false },
        ],
      }).catch(() => {});
    }
  }

  return { transcricao, violacoes, punido };
}

function registrarItem(guildId, item) {
  const s = sessoes.get(guildId);
  if (s) {
    s.itens.push(item);
    if (s.itens.length > 500) s.itens.splice(0, s.itens.length - 500);
  }
  const idx = path.join(CFG.pastaGravar, `transcricoes_${guildId}.json`);
  try {
    fs.mkdirSync(CFG.pastaGravar, { recursive: true });
    const lista = fs.existsSync(idx) ? JSON.parse(fs.readFileSync(idx, "utf8")) : [];
    lista.push(item);
    fs.writeFileSync(idx, JSON.stringify(lista.slice(-2000), null, 2), "utf8");
  } catch {}
}

// ---------- escuta de um canal ----------

function ouvirMembro(guild, guildId, connection, userId, user, member, canalNome) {
  const receiver = connection.receiver;
  const chunks = [];
  let bytes = 0;
  let stream;

  const parar = () => {
    try { stream?.destroy(); } catch {}
    clearTimeout(timerTrava);
  };

  const timerTrava = setTimeout(parar, CFG.msMaximo);

  try {
    stream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: CFG.silencioMs },
    });
  } catch (err) {
    log("WARN", "[GRAVADOR] subscribe falhou", { usuario: userId, erro: err.message });
    clearTimeout(timerTrava);
    return;
  }

  stream.on("data", (chunk) => {
    chunks.push(chunk);
    bytes += chunk.length;
  });

  stream.on("end", async () => {
    clearTimeout(timerTrava);
    const aindaLigado = timers.get(guildId)?.conexao;
    if (aindaLigado) {
      setTimeout(() => {
        if (timers.get(guildId)?.conexao) ouvirMembro(guild, guildId, connection, userId, user, member, canalNome);
      }, 400);
    }
    if (bytes === 0) return;

    const ms = (bytes / 4 / 48000) * 1000;
    if (ms < CFG.msMinimo) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.join(CFG.pastaGravar, `${guildId}_${connection.joinConfig.channelId}`, `${stamp}_${userId}`);
    const pcm = `${base}.pcm`;
    const wav = `${base}.wav`;
    const mp3 = `${base}.mp3`;

    try {
      fs.mkdirSync(path.dirname(pcm), { recursive: true });
      fs.writeFileSync(pcm, Buffer.concat(chunks));
      await pcmParaWav(pcm, wav);
      try { fs.unlinkSync(pcm); } catch {}

      const r = await analisar({ guild, guildId, user, member, texto: null, wavPath: wav, canalNome });

      if (CFG.apagarLimpo && !r.violacoes.length) {
        try { fs.unlinkSync(wav); } catch {}
      } else {
        await wavParaMp3(wav, mp3).catch(() => {});
        try { fs.unlinkSync(wav); } catch {}
      }

      registrarItem(guildId, {
        em: stamp,
        canal: connection.joinConfig.channelId,
        canalNome,
        usuario: userId,
        tag: user.tag,
        ms: Math.round(ms),
        audio: r.violacoes.length || !CFG.apagarLimpo ? path.basename(mp3) : null,
        transcricao: r.transcricao,
        violacoes: r.violacoes,
        punido: r.punido,
        ownerIgnorado: !!r.ownerIgnorado,
      });

      if (r.violacoes.length) {
        log("WARN", "[GRAVADOR] palavra proibida em call", {
          usuario: user.tag, canal: canalNome, palavras: r.violacoes.map((v) => v.palavra), punido: r.punido,
        });
      }
    } catch (err) {
      log("WARN", "[GRAVADOR] erro processando clip", { erro: err.message });
      for (const f of [pcm, wav]) { try { fs.unlinkSync(f); } catch {} }
    }
  });

  stream.on("error", () => { clearTimeout(timerTrava); });
}

// ---------- escolher canal ----------

function podeGravar(channel, canalStaffId) {
  if (!channel || channel.type !== 2) return false;          // 2 = GUILD_VOICE
  if (canalStaffId && channel.id === canalStaffId) return false;
  return true;
}

function escolherCanal(guild, cfg) {
  const membros = [...guild.members.cache.values()];
  const candidatos = [];

  for (const channel of guild.channels.cache.values()) {
    if (!podeGravar(channel, cfg.canalStaffId)) continue;
    const presentes = membros.filter(
      (m) => !m.user.bot && m.voice?.channelId === channel.id
    );
    if (!presentes.length) continue;
    const perms = channel.permissionsFor(guild.members.me);
    if (!perms || !perms.has("Connect")) continue;
    candidatos.push({ channel, presentes });
  }

  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.presentes.length - a.presentes.length);
  return candidatos[0];
}

async function sincronizar(guild) {
  const cfg = carregar();
  const guildId = guild.id;
  const t = timers.get(guildId);
  if (!t) return;

  if (!cfg.ativo) return;

  const alvo = escolherCanal(guild, cfg);

  // sai do staff ou de um canal vazio
  if (t.conexao && (!alvo || t.conexao.joinConfig.channelId !== alvo.channel.id)) {
    log("INFO", "[GRAVADOR] saindo do canal", { guild: guild.name, de: t.conexao.joinConfig.channelId });
    try { t.conexao.destroy(); } catch {}
    t.conexao = null;
    t.ouvintes.clear();
  }

  if (!alvo || t.conexao) return;

  let connection;
  try {
    connection = joinVoiceChannel({
      channelId: alvo.channel.id,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
      group: "gravador",
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  } catch (err) {
    log("WARN", "[GRAVADOR] nao entrou no canal", { guild: guild.name, canal: alvo.channel.name, erro: err.message });
    try { connection?.destroy(); } catch {}
    return;
  }

  t.conexao = connection;
  sessoes.set(guildId, { channelId: alvo.channel.id, iniciadaEm: Date.now(), itens: [] });
  log("INFO", "[GRAVADOR] gravando", { guild: guild.name, canal: alvo.channel.name, pessoas: alvo.presentes.length });

  connection.on(VoiceConnectionStatus.Disconnected, () => { t.conexao = null; t.ouvintes.clear(); });
  connection.on(VoiceConnectionStatus.Destroyed, () => { t.conexao = null; t.ouvintes.clear(); });

  const ouvintes = new Map();
  t.ouvintes = ouvintes;
  for (const m of alvo.presentes) {
    ouvirMembro(guild, guildId, connection, m.id, m.user, m, alvo.channel.name);
    ouvintes.set(m.id, Date.now());
  }
}

// Mantem a escuta em dia quando alguem entra/sai de canal.
function vigiarMovimento() {
  clientRef.on("voiceStateUpdate", (oldS, novoS) => {
    const g = novoS.guild || oldS.guild;
    if (!g) return;
    if (!timers.has(g.id)) return;
    if (CFG.canalStaffId && [oldS.channelId, novoS.channelId].includes(CFG.canalStaffId)) return;
    clearTimeout(timers.get(g.id).moveDebounce);
    timers.get(g.id).moveDebounce = setTimeout(() => {
      sincronizar(g).catch(() => {});
    }, 2500);
  });
}

// ---------- API ----------

function iniciar(client) {
  carregar();
  clientRef = client;
  for (const guild of client.guilds.cache.values()) {
    if (!timers.has(guild.id)) {
      timers.set(guild.id, { conexao: null, ouvintes: new Map(), moveDebounce: null });
    }
    if (CFG.ativo) {
      timers.get(guild.id).poll = setInterval(() => sincronizar(guild).catch(() => {}), 20000);
    }
  }
  client.on("guildCreate", (g) => {
    if (!timers.has(g.id)) timers.set(g.id, { conexao: null, ouvintes: new Map(), moveDebounce: null });
    if (CFG.ativo) timers.get(g.id).poll = setInterval(() => sincronizar(g).catch(() => {}), 20000);
  });
  if (!client.__gravadorVigia) {
    client.__gravadorVigia = true;
    vigiarMovimento();
  }
  log("INFO", "[GRAVADOR] modulo carregado", { ativo: CFG.ativo });
}

async function ligar(guildId) {
  carregar();
  CFG.ativo = true;
  salvar();
  const t = timers.get(guildId);
  if (t && !t.poll) {
    const guild = clientRef?.guilds.cache.get(guildId);
    if (guild) t.poll = setInterval(() => sincronizar(guild).catch(() => {}), 20000);
  }
  const guild = clientRef?.guilds.cache.get(guildId);
  if (guild) await sincronizar(guild);
  return true;
}

function desligar(guildId) {
  carregar();
  CFG.ativo = false;
  salvar();
  const t = timers.get(guildId);
  if (t?.conexao) { try { t.conexao.destroy(); } catch {} }
  if (t) { t.conexao = null; t.ouvintes.clear(); }
  return true;
}

function definirCanalStaff(guildId, channelId) {
  carregar();
  CFG.canalStaffId = channelId || null;
  salvar();
  return CFG.canalStaffId;
}

function status(guildId) {
  carregar();
  const t = timers.get(guildId);
  return {
    ativo: CFG.ativo,
    canalStaffId: CFG.canalStaffId,
    aplicandoWarn: CFG.aplicarWarn,
    mutedSegundos: CFG.mutedSegundos,
    gravandoAgora: t?.conexao?.joinConfig?.channelId || null,
    pessoa: t?.conexao ? t.ouvintes.size : 0,
    itens: sessoes.get(guildId)?.itens.length || 0,
    pasta: CFG.pastaGravar,
  };
}

module.exports = {
  iniciar, ligar, desligar, definirCanalStaff, status,
  carregar, salvar, checarProibidas, ehRuido, normalizar, CFG, sessoes,
};
