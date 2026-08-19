(() => {
  const $ = (id) => document.getElementById(id);

  const AMBIENTE_RENDER = window.location.hostname.endsWith("onrender.com");
  if (AMBIENTE_RENDER) {
    ["terminal", "arquivos", "historico", "tela", "celular"].forEach((v) => {
      const view = $(`view${v[0].toUpperCase()}${v.slice(1)}`);
      if (view) view.classList.add("hidden");
      document.querySelectorAll(`[data-view="${v}"]`).forEach((b) => (b.style.display = "none"));
    });
  }

  const chat = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const statusDot = $("statusDot");
  const statusText = $("statusText");
  const coreStatus = $("coreStatus");
  const coreCpu = $("coreCpu");
  const pcLine = $("pcLine");
  const micBtn = $("micBtn");
  const micLabel = $("micLabel");
  const volRange = $("volRange");
  const volVal = $("volVal");
  const audio = new Audio();
  const modoBtn = $("modoBtn");

  function aplicarTema(modo) {
    document.documentElement.dataset.theme = modo === "ultron" ? "ultron" : "jarvis";
    modoBtn.dataset.mode = modo;
    modoBtn.textContent = `MODO: ${modo.toUpperCase()}`;
  }

  async function sincronizarModo() {
    try {
      const r = await fetch("/api/modo", { method: "GET" });
      const { modo } = await r.json();
      aplicarTema(modo);
    } catch {}
  }

  modoBtn.addEventListener("click", async () => {
    const atual = document.documentElement.dataset.theme === "ultron" ? "ultron" : "jarvis";
    const novo = atual === "ultron" ? "jarvis" : "ultron";
    toast(novo === "ultron" ? "☠️ MODO ULTRON" : "🟦 MODO JARVIS");
    try {
      const r = await api("/api/modo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: novo }),
      });
      const data = await r.json();
      aplicarTema(data.modo || novo);
    } catch { aplicarTema(novo); }
  });

  const CIRC = 276.5;
  const setRing = (id, pct) => {
    const el = $(id);
    if (el) el.style.strokeDashoffset = CIRC * (1 - Math.min(100, Math.max(0, pct)) / 100);
  };

  let vozAtiva = true;
  let reconhecendo = false;
  let recognition = null;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.add("hidden"), 3000);
  }

  function addMsg(who, text) {
    const el = document.createElement("div");
    el.className = `msg ${who}`;
    el.innerHTML = `<span class="who">${who === "user" ? "VOCÊ" : "NEON"}</span>${escapeHtml(text)}`;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function setStatus(ok, label) {
    statusDot.className = `dot ${ok ? "on" : "err"}`;
    statusText.textContent = label;
    coreStatus.textContent = ok ? "ONLINE" : "OFFLINE";
  }

  async function falar(texto) {
    if (!vozAtiva || !texto) return;
    try {
      const r = await api("/api/voz/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.slice(0, 500) }),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      audio.src = URL.createObjectURL(blob);
      audio.play().catch(() => {});
    } catch {}
  }

  async function enviar(texto) {
    const t = texto.trim();
    if (!t) return;
    addMsg("user", t);
    chatInput.value = "";
    const typing = addMsg("neon", "processando...");
    typing.classList.add("typing");
    try {
      const r = await api("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: t, usuario: "HUD", userId: "hud_web" }),
      });
      const data = await r.json();
      typing.remove();
      const reply = data.resposta || data.erro || "Sem resposta.";
      addMsg("neon", reply);
      falar(reply);
      if (data.resposta) {
        try {
          await api("/api/historico", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usuario: "HUD", mensagem: t, resposta: data.resposta }),
          });
        } catch {}
      }
      return reply;
    } catch (err) {
      typing.remove();
      addMsg("neon", `Erro de conexão: ${err.message}`);
      return `Erro de conexão: ${err.message}`;
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    enviar(chatInput.value);
  });

  // ============ STATUS AO VIVO ============
  async function atualizarStatus() {
    try {
      const r = await api("/api/pc", { method: "GET" });
      if (!r.ok) throw new Error("status");
      const { info, bateria } = await r.json();
      setStatus(true, "SISTEMA ONLINE");

      const cpu = info?.cpuUso ?? null;
      const ram = info?.ramUso ?? null;
      const disco = info?.discoUso ?? null;

      coreCpu.textContent = cpu != null ? `CPU ${Math.round(cpu)}%` : "CPU --%";
      if (ram != null) { setRing("ringRam", ram); $("ramVal").textContent = `${Math.round(ram)}%`; }
      if (disco != null) { setRing("ringDisk", disco); $("diskVal").textContent = `${Math.round(disco)}%`; }

      if (bateria?.temBateria) {
        setRing("ringBat", bateria.pct);
        $("batVal").textContent = `${bateria.pct}%`;
        $("batVal").style.color = bateria.pct <= 20 ? "var(--red)" : "";
      } else {
        $("batVal").textContent = "--";
        $("batVal").style.color = "var(--dim)";
      }

      const partes = [];
      if (info) {
        if (cpu != null) partes.push(`CPU ${Math.round(cpu)}%`);
        if (ram != null) partes.push(`RAM ${Math.round(ram)}%`);
        if (info.temperatura != null) partes.push(`Temp ${info.temperatura}°C`);
        if (info.temperaturaGpu != null) partes.push(`GPU ${info.temperaturaGpu}°C`);
        if (info.ramLivre != null) partes.push(`${info.ramLivre.toFixed(1)} GB livres`);
        if (info.cpuNome) partes.push(info.cpuNome.trim().slice(0, 28));
        if (bateria?.temBateria) partes.push(`Bateria ${bateria.pct}% (${bateria.status})`);
      }
      pcLine.textContent = partes.join(" · ");
    } catch (err) {
      setStatus(false, "OFFLINE");
      coreCpu.textContent = "CPU --%";
    }
  }

  setInterval(atualizarStatus, 5000);
  atualizarStatus();
  sincronizarModo();

  // ============ RELÓGIO ============
  function relogio() {
    const d = new Date();
    $("clock").textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  setInterval(relogio, 1000);
  relogio();

  // ============ VOZ (PUSH TO TALK) ============
  let mediaRecorder = null;
  let gravando = false;
  const suportaWebSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  async function obterMicrofone() {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return null; }
  }

  function setMic(ativo, label) {
    micBtn.classList.toggle("listening", ativo);
    micLabel.textContent = label;
    $("voiceBadge").style.display = ativo ? "block" : "none";
    $("voiceBadge").textContent = `● ${label}`;
  }

  function usarWebSpeech() {
    if (!suportaWebSpeech) return false;
    try {
      reconhecendo = true;
      recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = "pt-BR";
      recognition.interimResults = true;
      recognition.continuous = false;

      let final = "";
      recognition.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        chatInput.value = (final + interim).trim();
      };
      recognition.onend = () => {
        reconhecendo = false;
        const t = (final || chatInput.value).trim();
        if (t) { chatInput.value = ""; enviar(t); }
        setMic(false, "PUSH TO TALK");
      };
      recognition.onerror = () => { try { recognition.stop(); } catch {} setMic(false, "PUSH TO TALK"); };

      setMic(true, "OUVINDO...");
      recognition.start();
      return true;
    } catch { return false; }
  }

  async function iniciarReconhecimento() {
    if (gravando) return;
    const stream = await obterMicrofone();
    if (!stream) {
      if (!usarWebSpeech()) toast("Sem acesso ao microfone");
      return;
    }

    gravando = true;
    setMic(true, "GRAVANDO...");

    try { mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" }); }
    catch { mediaRecorder = new MediaRecorder(stream); }

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      await transcreverBlob(blob);
    };
    mediaRecorder.start();
  }

  function stopReconhecimento() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  }

  async function transcreverBlob(blob) {
    setMic(true, "PROCESSANDO...");
    try {
      const r = await api("/api/voz/stt", { method: "POST", body: blob });
      const data = await r.json();
      const texto = (data.texto || "").trim();
      if (texto) {
        chatInput.value = "";
        enviar(texto);
      } else {
        toast(data.erro || "Não entendi o áudio. Tenta de novo.");
      }
    } catch (err) {
      toast("Falha na transcrição: " + err.message);
    } finally {
      setMic(false, "PUSH TO TALK");
    }
  }

  micBtn.addEventListener("mousedown", iniciarReconhecimento);
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); iniciarReconhecimento(); }, { passive: false });
  micBtn.addEventListener("mouseup", stopReconhecimento);
  micBtn.addEventListener("mouseleave", stopReconhecimento);
  micBtn.addEventListener("touchend", stopReconhecimento);

  window.addEventListener("keydown", (e) => {
    if (e.key === "v" || e.key === "V") {
      vozAtiva = !vozAtiva;
      toast(`Voz ${vozAtiva ? "ATIVADA" : "DESATIVADA"}`);
    }
  });

  // ============ CONTROLES ============
  volRange.addEventListener("input", () => { volVal.textContent = `${volRange.value}%`; });
  volRange.addEventListener("change", async () => {
    const nivel = parseInt(volRange.value, 10);
    volVal.textContent = `${nivel}%`;
    try {
      await api("/api/pc/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel }),
      });
    } catch {}
  });

  $("btnShot").addEventListener("click", async () => {
    toast("Capturando tela...");
    try {
      const r = await api("/api/pc/screenshot", { method: "POST" });
      const data = await r.json();
      if (data.imagem) {
        $("shotImg").src = data.imagem;
        $("shotModal").classList.remove("hidden");
      } else toast(data.erro || "Falha na captura");
    } catch (err) { toast(err.message); }
  });

  $("closeShot").addEventListener("click", () => $("shotModal").classList.add("hidden"));
  $("shotModal").addEventListener("click", (e) => { if (e.target === $("shotModal")) $("shotModal").classList.add("hidden"); });

  $("btnNotify").addEventListener("click", async () => {
    const titulo = prompt("Título da notificação:", "Neon HUD");
    if (titulo === null) return;
    const mensagem = prompt("Mensagem:", "");
    if (mensagem === null) return;
    try {
      const r = await api("/api/pc/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensagem }),
      });
      const data = await r.json();
      toast(data.ok ? "Notificação enviada" : data.erro);
    } catch (err) { toast(err.message); }
  });

  document.body.insertAdjacentHTML("beforeend", '<div id="voiceBadge">● OUVINDO</div>');

  // ============ CHAVE (terminal/arquivos) ============
  function hudKey() {
    let k = localStorage.getItem("hud_key");
    if (!k) {
      k = prompt("Digite a chave de acesso (MASTER_KEY do .env):");
      if (k) localStorage.setItem("hud_key", k);
    }
    return k;
  }

  function api(pathname, opts = {}) {
    const k = hudKey();
    if (!k) throw new Error("sem chave");
    return fetch(pathname, {
      ...opts,
      headers: { ...(opts.headers || {}), "X-Hud-Key": k },
    });
  }

  // ============ ABAS ============
  const tabs = document.querySelectorAll(".tab");
  const views = { chat: $("viewChat"), terminal: $("viewTerminal"), arquivos: $("viewArquivos"), historico: $("viewHistorico"), tela: $("viewTela"), celular: $("viewCelular"), opencode: $("viewOpencode") };

  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === t.dataset.view));
      if (t.dataset.view === "arquivos" && !fileList.dataset.carregado) carregarArquivos();
    });
  });

  // ============ TERMINAL ============
  const termOut = $("termOut");
  const termForm = $("termForm");
  const termInput = $("termInput");

  function termEscrever(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    termOut.appendChild(div);
    while (termOut.childNodes.length > 2000) termOut.removeChild(termOut.firstChild);
    termOut.scrollTop = termOut.scrollHeight;
  }

  termEscrever('<div class="t-hint">Terminal remoto — PowerShell do PC da Neon. Use com responsabilidade.</div>');

  termForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const comando = termInput.value.trim();
    if (!comando) return;
    termInput.value = "";
    termEscrever(`<div class="t-cmd">&gt; ${escapeHtml(comando)}</div>`);
    try {
      const r = await api("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comando }),
      });
      const data = await r.json();
      if (data.stdout) termEscrever(`<div class="t-out">${escapeHtml(data.stdout)}</div>`);
      if (data.stderr) termEscrever(`<div class="t-err">${escapeHtml(data.stderr)}</div>`);
      if (data.erro) termEscrever(`<div class="t-err">[erro] ${escapeHtml(data.erro)}</div>`);
    } catch (err) {
      termEscrever(`<div class="t-err">[erro] ${escapeHtml(err.message)}</div>`);
    }
  });

  // ============ ARQUIVOS ============
  const fileList = $("fileList");
  const filePathEl = $("filePath");
  const fileEditor = $("fileEditor");
  const fileEditPath = $("fileEditPath");
  const fileEditText = $("fileEditText");
  let dirAtual = "";

  function fmtTamanho(n) {
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function carregarArquivos(dir) {
    fileList.dataset.carregado = "1";
    fileEditor.classList.add("hidden");
    try {
      const url = dir ? `/api/arquivos?dir=${encodeURIComponent(dir)}` : "/api/arquivos";
      const r = await api(url);
      const data = await r.json();
      if (data.erro) throw new Error(data.erro);
      dirAtual = data.dir;
      filePathEl.textContent = data.dir;
      fileList.innerHTML = "";

      if (data.raiz) {
        data.raizes.forEach((l) => fileList.appendChild(itemPasta(l, `${l}`, true)));
      } else {
        fileList.appendChild(itemPasta("..", data.pai));
        data.itens.forEach((i) => {
          if (i.pasta) fileList.appendChild(itemPasta(i.nome, joinDir(data.dir, i.nome)));
          else fileList.appendChild(itemArquivo(i));
        });
      }
    } catch (err) {
      fileList.innerHTML = `<div class="f-item erro">${escapeHtml(err.message)}</div>`;
    }
  }

  function joinDir(base, nome) {
    return base.endsWith("\\") ? base + nome : base + "\\" + nome;
  }

  function itemPasta(nome, caminho, raiz) {
    const el = document.createElement("div");
    el.className = "f-item pasta";
    el.innerHTML = `<span class="f-icon">${raiz ? "▣" : "📁"}</span><span class="f-nome">${escapeHtml(nome)}</span>`;
    el.addEventListener("click", () => carregarArquivos(caminho));
    return el;
  }

  function itemArquivo(i) {
    const el = document.createElement("div");
    el.className = "f-item";
    const data = i.mtime ? new Date(i.mtime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    el.innerHTML = `<span class="f-icon">📄</span><span class="f-nome">${escapeHtml(i.nome)}</span><span class="f-meta">${fmtTamanho(i.tamanho)} ${data}</span>`;
    el.addEventListener("click", () => abrirEditor(joinDir(dirAtual, i.nome)));
    return el;
  }

  async function abrirEditor(caminho) {
    try {
      const r = await api(`/api/arquivos/conteudo?path=${encodeURIComponent(caminho)}`);
      const data = await r.json();
      if (data.erro) { toast(data.erro); return; }
      fileEditPath.textContent = data.caminho;
      fileEditText.value = data.conteudo;
      fileList.style.display = "none";
      fileEditor.classList.remove("hidden");
    } catch (err) { toast(err.message); }
  }

  $("btnSubir").addEventListener("click", async () => {
    if (!dirAtual) { carregarArquivos(); return; }
    const pai = dirAtual.replace(/[\\/][^\\/]*$/, "");
    const letra = dirAtual.match(/^([A-Za-z]):[\\/]?$/);
    carregarArquivos(letra ? "\\" : (pai || "\\"));
  });

  $("btnAtualizar").addEventListener("click", () => carregarArquivos(dirAtual));

  $("btnEditarFechar").addEventListener("click", () => {
    fileEditor.classList.add("hidden");
    fileList.style.display = "";
  });

  $("btnEditarSalvar").addEventListener("click", async () => {
    try {
      const r = await api("/api/arquivos/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: fileEditPath.textContent, conteudo: fileEditText.value }),
      });
      const data = await r.json();
      toast(data.ok ? "Arquivo salvo" : data.erro);
    } catch (err) { toast(err.message); }
  });

  // ============ CONTROLES RÁPIDOS ============
  document.querySelectorAll(".qb-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      const acao = chip.dataset.quick.toLowerCase();
      let tipo, nome;
      if (acao.includes("dormir")) tipo = "dormir";
      else if (acao.includes("bloquear")) tipo = "bloquear";
      else if (acao.includes("desligar")) tipo = "desligar";
      else if (acao.includes("vscode")) { tipo = "abrir_app"; nome = "code"; }
      if (!tipo) return;
      toast("Executando...");
      try {
        const r = await api("/api/pc/acao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: tipo, nome }),
        });
        const data = await r.json();
        toast(data.resultado || data.erro || "ok");
      } catch (err) { toast(err.message); }
    });
  });

  // ============ HISTÓRICO ============
  const histList = $("histList");
  const HIST_USUARIO = "HUD";

  function histItem(h) {
    const el = document.createElement("div");
    el.className = "hist-item";
    const d = new Date(h.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `<div class="hist-q">${escapeHtml(h.m)}</div><div class="hist-a">${escapeHtml(h.r)}</div><div class="hist-t">${d}</div>`;
    el.addEventListener("click", () => {
      chatInput.value = h.m;
      enviar(h.m);
    });
    return el;
  }

  async function carregarHistorico() {
    histList.innerHTML = '<div class="hist-empty">carregando...</div>';
    try {
      const r = await api(`/api/historico?usuario=${encodeURIComponent(HIST_USUARIO)}`);
      const data = await r.json();
      const hist = data.historico || [];
      histList.innerHTML = "";
      if (!hist.length) {
        histList.innerHTML = '<div class="hist-empty">Sem histórico ainda. Fale com a Neon no chat!</div>';
        return;
      }
      hist.slice().reverse().forEach((h) => histList.appendChild(histItem(h)));
    } catch (err) {
      histList.innerHTML = `<div class="hist-empty">${escapeHtml(err.message)}</div>`;
    }
  }

  $("btnHistAtualizar").addEventListener("click", carregarHistorico);
  $("btnHistLimpar").addEventListener("click", async () => {
    if (!confirm("Apagar todo o histórico de conversa?")) return;
    try {
      await api(`/api/historico?usuario=${encodeURIComponent(HIST_USUARIO)}`, { method: "DELETE" });
      carregarHistorico();
      toast("Histórico apagado");
    } catch (err) { toast(err.message); }
  });

  // ============ TELA AO VIVO ============
  const screenImg = $("screenImg");
  let telaTimer = null;
  const TELA_MS = 2000;

  async function frameTela() {
    try {
      const r = await api("/api/pc/tela");
      const data = await r.json();
      if (data.imagem) screenImg.src = data.imagem;
    } catch {}
  }

  function telaParar() {
    clearInterval(telaTimer);
    telaTimer = null;
    screenImg.classList.remove("on");
  }

  $("btnTelaPlay").addEventListener("click", async () => {
    if (telaTimer) telaParar();
    toast("Transmitindo tela...");
    screenImg.classList.remove("on");
    await frameTela();
    screenImg.classList.add("on");
    telaTimer = setInterval(frameTela, TELA_MS);
  });

  $("btnTelaStop").addEventListener("click", () => {
    telaParar();
    toast("Transmissão parada");
  });

  // ============ NAV MOBILE + TAB TOPS ============
  const botoes = document.querySelectorAll(".bn-item");
  botoes.forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.dataset.view;
      tabs.forEach((x) => x.classList.toggle("active", x.dataset.view === v));
      botoes.forEach((x) => x.classList.toggle("active", x === b));
      Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === v));
      if (v === "arquivos" && !fileList.dataset.carregado) carregarArquivos();
      if (v === "historico") carregarHistorico();
      if (v === "tela") $("viewTela").classList.add("active");
      if (v === "celular") carregarCelular();
    });
  });

  // ============ CELULAR (adb/scrcpy) ============
  const celStatus = $("celStatus");
  const celShot = $("celShot");
  const celShotImg = $("celShotImg");
  const celAppInput = $("celApp");

  async function carregarCelular() {
    try {
      const r = await api("/api/celular");
      const d = await r.json();
      celStatus.textContent = d.conectado ? `✅ conectado (${d.dispositivo || (d.ip + ":" + d.porta)})` : "❌ desconectado";
    } catch { celStatus.textContent = "❌ offline"; }
  }

  async function acaoCelular(caminho, body) {
    toast("Executando...");
    try {
      const r = await api(`/api/celular/${caminho}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (d.imagem) {
        celShot.classList.remove("hidden");
        celShotImg.src = d.imagem;
        toast("Print gerado");
      } else {
        toast(d.mensagem || d.erro || "ok");
      }
    } catch (err) { toast(err.message); }
    carregarCelular();
  }

  $("btnCelConectar").addEventListener("click", () => acaoCelular("conectar"));
  $("btnCelDesconectar").addEventListener("click", () => acaoCelular("desconectar"));
  $("btnCelEspelhar").addEventListener("click", () => acaoCelular("espelhar"));
  $("btnCelPrint").addEventListener("click", () => acaoCelular("print"));
  $("btnCelAbrir").addEventListener("click", () => {
    const app = celAppInput.value.trim();
    if (app) acaoCelular("abrir", { app });
  });

  // ============ OPENCODE (comunicar com o opencode da Neon) ============
  const ocChat = $("ocChat");
  const ocForm = $("ocForm");
  const ocInput = $("ocInput");

  function ocMsg(texto, cls) {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = texto;
    ocChat.appendChild(d);
    ocChat.scrollTop = ocChat.scrollHeight;
  }

  ocForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tarefa = ocInput.value.trim();
    if (!tarefa) return;
    ocInput.value = "";
    ocMsg(tarefa, "user");
    ocMsg("pensando...", "neon oc-busy");
    try {
      const r = await api("/api/opencode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tarefa }),
      });
      const data = await r.json();
      ocChat.querySelector(".oc-busy")?.remove();
      if (data.ok && data.resultado) ocMsg(data.resultado, "neon");
      else ocMsg(data.erro || "sem resposta", "neon");
    } catch (err) {
      ocChat.querySelector(".oc-busy")?.remove();
      ocMsg("Falha: " + err.message, "neon");
    }
  });

  // registra histórico de cada troca de chat
})();
