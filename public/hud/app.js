(() => {
  const $ = (id) => document.getElementById(id);

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
      const r = await fetch("/api/modo", {
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

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

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
      const r = await fetch("/api/voz/audio", {
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
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: t, usuario: "HUD", userId: "hud_web" }),
      });
      const data = await r.json();
      typing.remove();
      const reply = data.resposta || data.erro || "Sem resposta.";
      addMsg("neon", reply);
      falar(reply);
    } catch (err) {
      typing.remove();
      addMsg("neon", `Erro de conexão: ${err.message}`);
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    enviar(chatInput.value);
  });

  // ============ STATUS AO VIVO ============
  async function atualizarStatus() {
    try {
      const r = await fetch("/api/pc", { method: "GET" });
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
  function iniciarReconhecimento() {
    if (!SR) { toast("Seu navegador não suporta voz"); return; }
    reconhecendo = true;
    recognition = new SR();
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
      micBtn.classList.remove("listening");
      micLabel.textContent = "PUSH TO TALK";
      $("voiceBadge").style.display = "none";
      if (reconhecendo && final.trim()) {
        reconhecendo = false;
        enviar(final);
      } else if (reconhecendo && chatInput.value.trim()) {
        reconhecendo = false;
        enviar(chatInput.value);
      }
      reconhecendo = false;
    };
    recognition.onerror = () => { stopReconhecimento(); };

    micBtn.classList.add("listening");
    micLabel.textContent = "OUVINDO...";
    $("voiceBadge").style.display = "block";
    recognition.start();
  }

  function stopReconhecimento() {
    if (recognition) { try { recognition.stop(); } catch {} }
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
      await fetch("/api/pc/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel }),
      });
    } catch {}
  });

  $("btnShot").addEventListener("click", async () => {
    toast("Capturando tela...");
    try {
      const r = await fetch("/api/pc/screenshot", { method: "POST" });
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
      const r = await fetch("/api/pc/notificar", {
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
  const views = { chat: $("viewChat"), terminal: $("viewTerminal"), arquivos: $("viewArquivos") };

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
})();
