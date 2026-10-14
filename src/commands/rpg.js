// Modo RPG (Ordem Paranormal): consulta fichas, rituais, habilidades, itens,
// pericias e rolagens de dados. Dados em data/rpg_fichas.json.
const {
  SlashCommandBuilder,
  EmbedBuilder,
  InteractionContextType,
  ApplicationIntegrationType,
} = require("discord.js");
const rpg = require("../rpg");
const { isOwner } = require("../perm");

const ELEMENTOS = ["Conhecimento", "Energia", "Sangue", "Morte", "Medo", "Outro Lado"];

const COR = 0x8e44ad;

function cortar(s, n = 1024) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function nomeFicha(interaction) {
  return interaction.options.getString("agente") || null;
}

function embedBase(ficha, titulo) {
  const e = new EmbedBuilder().setColor(COR).setTitle(titulo);
  if (ficha.fonte) e.setURL(ficha.fonte);
  return e;
}

function resumoFicha(ficha) {
  const a = ficha.atributos || {};
  const s = ficha.stats || {};
  const e = embedBase(ficha, `Ficha — ${ficha.nome}`);

  e.addFields({
    name: "Identidade",
    value: [
      `**Classe:** ${ficha.classe || "?"}  •  **Origem:** ${ficha.origem || "?"}`,
      `**NEX:** ${ficha.nex || "?"}${ficha.patente ? `  •  **Patente:** ${ficha.patente}` : ""}`,
      ficha.proficiencias ? `**Proficiências:** ${ficha.proficiencias}` : null,
    ].filter(Boolean).join("\n"),
  });

  e.addFields({
    name: "Atributos",
    value: `FOR ${a.FOR ?? 0}  •  AGI ${a.AGI ?? 0}  •  VIG ${a.VIG ?? 0}  •  INT ${a.INT ?? 0}  •  PRE ${a.PRE ?? 0}`,
  });

  const combat = [];
  if (s.pv) combat.push(`**PV** ${s.pv.atual}/${s.pv.max}`);
  if (s.pe) combat.push(`**PE** ${s.pe.atual}/${s.pe.max}${s.pe.porTurno ? ` (${s.pe.porTurno}/turno)` : ""}`);
  if (s.sanidade) combat.push(`**SAN** ${s.sanidade.atual}/${s.sanidade.max}`);
  if (s.determinacao) combat.push(`**PD** ${s.determinacao.atual}/${s.determinacao.max}`);
  if (s.defesa != null) combat.push(`**Defesa** ${s.defesa}`);
  if (s.evasao != null) combat.push(`**Evasão** ${s.evasao}`);
  if (s.deslocamento != null) combat.push(`**Desloc.** ${s.deslocamento}m`);
  if (s.dtRituais != null) combat.push(`**DT Rituais** ${s.dtRituais}`);
  if (combat.length) e.addFields({ name: "Combate", value: combat.join("  •  ") });

  const treinadas = ficha.pericias?.treinadas || [];
  if (treinadas.length) {
    e.addFields({
      name: "Perícias treinadas",
      value: cortar(treinadas.map((p) => `${p.nome} +${p.bonus}`).join(", ")),
    });
  }
  if (ficha.elementos?.length) {
    e.addFields({ name: "Elementos", value: ficha.elementos.join(", ") });
  }
  if (ficha.ataques?.length) {
    e.addFields({
      name: "Ataques",
      value: cortar(ficha.ataques.map((at) => `${at.nome}: ${at.dano}${at.critico ? ` (${at.critico})` : ""}`).join("\n")),
    });
  }
  e.addFields({
    name: "Conteúdo",
    value: `${(ficha.rituais || []).length} rituais  •  ${(ficha.habilidades || []).length} habilidades  •  ${(ficha.itens || []).length} itens`,
  });
  e.setFooter({ text: "use /rpg rituais, /rpg habilidades, /rpg itens — filtre por função ou elemento" });
  return e;
}

function camposDeLista(embed, ficha, rotulo, lista, vazio) {
  if (!lista.length) {
    embed.addFields({ name: rotulo, value: vazio });
    return embed;
  }
  for (const x of lista.slice(0, 20)) {
    const tags = [];
    if (x.circulo) tags.push(`${x.circulo}º círculo`);
    if (x.elemento) tags.push(x.elemento);
    if (x.categoria) tags.push(`categoria ${x.categoria}`);
    if (x.equipado) tags.push("equipado");
    embed.addFields({
      name: cortar(x.nome + (tags.length ? ` (${tags.join(", ")})` : ""), 256),
      value: cortar(x.resumo || x.descricao || "—"),
    });
  }
  if (lista.length > 20) embed.addFields({ name: "…", value: `+${lista.length - 20} itens não exibidos. Refine o filtro.` });
  return embed;
}

function detalheRitual(ficha, r) {
  const e = embedBase(ficha, r.nome);
  e.setDescription(cortar(r.descricao || r.resumo || "—", 4000));
  const info = [];
  if (r.elemento) info.push(`**Elemento:** ${r.elemento}`);
  if (r.circulo) info.push(`**Círculo:** ${r.circulo}º`);
  if (r.execucao) info.push(`**Execução:** ${r.execucao}`);
  if (r.alcance) info.push(`**Alcance:** ${r.alcance}`);
  if (r.alvo) info.push(`**Alvo:** ${r.alvo}`);
  if (r.area) info.push(`**Área:** ${r.area}`);
  if (r.duracao) info.push(`**Duração:** ${r.duracao}`);
  if (r.resistencia) info.push(`**Resistência:** ${r.resistencia}`);
  if (r.funcoes?.length) info.push(`**Funções:** ${r.funcoes.join(", ")}`);
  if (r.dados && Object.keys(r.dados).length) {
    info.push(`**Dano:** ${Object.entries(r.dados).map(([k, v]) => `${k} ${v}`).join(" / ")}`);
  }
  e.addFields({ name: "Atributos do ritual", value: info.join("\n") || "—" });
  return e;
}

function detalheGenerico(ficha, x, tipo) {
  const e = embedBase(ficha, x.nome);
  e.setDescription(cortar(x.descricao || x.resumo || "—", 4000));
  const info = [];
  if (x.tipo) info.push(`**Tipo:** ${x.tipo}`);
  if (x.elemento) info.push(`**Elemento:** ${x.elemento}`);
  if (x.categoria) info.push(`**Categoria:** ${x.categoria}`);
  if (x.slots != null) info.push(`**Slots:** ${x.slots}`);
  if (x.defesa != null) info.push(`**Defesa:** +${x.defesa}`);
  if (x.funcoes?.length) info.push(`**Funções:** ${x.funcoes.join(", ")}`);
  e.addFields({ name: tipo === "item" ? "Item" : "Habilidade", value: info.join("\n") || "—" });
  if (x.subHabilidades?.length) {
    e.addFields({
      name: "Sub-habilidades",
      value: cortar(x.subHabilidades.map((h) => `**${h.nome}**${h.custo ? ` (${h.custo})` : ""}: ${h.resumo}`).join("\n\n")),
    });
  }
  return e;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rpg")
    .setDescription("Modo RPG (Ordem Paranormal): fichas, rituais, habilidades, itens e rolagens")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addSubcommand((s) =>
      s.setName("ficha").setDescription("Resumo da ficha").addStringOption((o) =>
        o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true)
      )
    )
    .addSubcommand((s) =>
      s
        .setName("rituais")
        .setDescription("Lista rituais (filtrável)")
        .addStringOption((o) => o.setName("funcao").setDescription("Função (combate, investigação, utilidade...)").setAutocomplete(true))
        .addStringOption((o) => o.setName("elemento").setDescription("Elemento").setAutocomplete(true))
        .addStringOption((o) => o.setName("busca").setDescription("Texto livre"))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("ritual")
        .setDescription("Detalhe de um ritual")
        .addStringOption((o) => o.setName("nome").setDescription("Nome do ritual").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("habilidades")
        .setDescription("Lista habilidades (filtrável)")
        .addStringOption((o) => o.setName("funcao").setDescription("Função").setAutocomplete(true))
        .addStringOption((o) => o.setName("busca").setDescription("Texto livre"))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("habilidade")
        .setDescription("Detalhe de uma habilidade")
        .addStringOption((o) => o.setName("nome").setDescription("Nome da habilidade").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("itens")
        .setDescription("Lista itens (filtrável)")
        .addStringOption((o) => o.setName("funcao").setDescription("Função").setAutocomplete(true))
        .addStringOption((o) => o.setName("elemento").setDescription("Elemento").setAutocomplete(true))
        .addStringOption((o) => o.setName("busca").setDescription("Texto livre"))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("item")
        .setDescription("Detalhe de um item")
        .addStringOption((o) => o.setName("nome").setDescription("Nome do item").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("funcao")
        .setDescription("Mostra tudo ligado a uma função (rituais + habilidades + itens)")
        .addStringOption((o) => o.setName("nome").setDescription("Função").setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("pericia")
        .setDescription("Rola um teste de perícia (d20 + atributo + bônus)")
        .addStringOption((o) => o.setName("nome").setDescription("Perícia").setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName("vantagem").setDescription("Rola 2d20 e usa o melhor"))
        .addBooleanOption((o) => o.setName("desvantagem").setDescription("Rola 2d20 e usa o pior"))
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s
        .setName("rolar")
        .setDescription("Rola dados (ex.: 3d6, 1d20+5, 2d8+1d4-1)")
        .addStringOption((o) => o.setName("dados").setDescription("Expressão de dados").setRequired(true))
        .addBooleanOption((o) => o.setName("vantagem").setDescription("d20: rola 2 e usa o melhor"))
        .addBooleanOption((o) => o.setName("desvantagem").setDescription("d20: rola 2 e usa o pior"))
    )
    .addSubcommand((s) => s.setName("links").setDescription("Links da campanha (ficha, escudo, mapa)"))
    .addSubcommand((s) =>
      s
        .setName("ativa")
        .setDescription("Define a ficha ativa padrão")
        .addStringOption((o) => o.setName("agente").setDescription("Nome da ficha").setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const focada = interaction.options.getFocused(true);
    const ficha = rpg.getFicha(interaction.options.getString("agente"));
    const responder = (arr) =>
      interaction.respond(arr.slice(0, 25)).catch(() => {});
    const contem = (s) => rpg.normalizar(s).includes(rpg.normalizar(focada.value || ""));

    if (focada.name === "agente") {
      return responder(rpg.listarFichas().map((f) => ({ name: f.nome, value: f.id })).filter((x) => contem(x.name)));
    }
    if (focada.name === "funcao") {
      const funcoes = ficha ? rpg.todasFuncoes(ficha) : [];
      return responder(funcoes.filter(contem).map((v) => ({ name: v, value: v })));
    }
    if (focada.name === "elemento") {
      const els = new Set([...ELEMENTOS, ...(ficha?.elementos || [])]);
      return responder(Array.from(els).filter(contem).map((v) => ({ name: v, value: v })));
    }
    if (focada.name === "nome" && ficha) {
      const sub = interaction.options.getSubcommand();
      if (sub === "funcao") {
        return responder(rpg.todasFuncoes(ficha).filter(contem).map((v) => ({ name: v, value: v })));
      }
      const lista =
        sub === "ritual" ? ficha.rituais : sub === "habilidade" ? ficha.habilidades : sub === "item" ? ficha.itens : [];
      if (lista.length) return responder(lista.map((x) => ({ name: x.nome, value: x.nome })).filter((x) => contem(x.name)));
      if (sub === "pericia") {
        const per = Object.keys(ficha.pericias?.todos || {}).map((n) => ({ name: n, value: n }));
        return responder(per.filter((x) => contem(x.name)));
      }
    }
    return responder([]);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const ficha = rpg.getFicha(nomeFicha(interaction));

    if (sub === "links") {
      const links = rpg.carregar().links || {};
      const linhas = Object.entries(links).map(([k, v]) => `**${k}:** ${v}`);
      return interaction.reply({ content: linhas.join("\n") || "sem links cadastrados.", ephemeral: false });
    }

    if (sub === "rolar") {
      const expr = interaction.options.getString("dados");
      const r = rpg.rolar(expr, {
        vantagem: !!interaction.options.getBoolean("vantagem"),
        desvantagem: !!interaction.options.getBoolean("desvantagem"),
      });
      if (!r.ok) return interaction.reply({ content: `erro: ${r.erro}`, ephemeral: true });
      const marca = r.critico ? "  **CRÍTICO!**" : r.desastre ? "  **desastre...**" : "";
      return interaction.reply(`\`${expr}\` → ${r.detalhes.join(" ")} = **${r.total}**${marca}`);
    }

    if (!ficha) {
      return interaction.reply({
        content: "Nenhuma ficha encontrada. Use `/rpg ativa` ou passe o `agente`.",
        ephemeral: true,
      });
    }

    if (sub === "ativa") {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({ content: "só o dono define a ficha ativa.", ephemeral: true });
      }
      const f = rpg.definirAtiva(nomeFicha(interaction));
      return interaction.reply(`ficha ativa: **${f.nome}**.`);
    }

    if (sub === "ficha") {
      return interaction.reply({ embeds: [resumoFicha(ficha)] });
    }

    if (sub === "pericia") {
      const nome = interaction.options.getString("nome");
      const r = rpg.rolarPericia(ficha, nome, {
        vantagem: !!interaction.options.getBoolean("vantagem"),
        desvantagem: !!interaction.options.getBoolean("desvantagem"),
      });
      if (!r.ok) return interaction.reply({ content: r.erro, ephemeral: true });
      const marca = r.critico ? "  **CRÍTICO!**" : r.desastre ? "  **desastre...**" : "";
      return interaction.reply(`**${r.pericia}** — ${r.formula} = **${r.total}**${marca}`);
    }

    if (sub === "ritual" || sub === "habilidade" || sub === "item") {
      const nome = interaction.options.getString("nome");
      const x =
        sub === "ritual" ? rpg.buscarRitual(ficha, nome) : sub === "habilidade" ? rpg.buscarHabilidade(ficha, nome) : rpg.buscarItem(ficha, nome);
      if (!x) return interaction.reply({ content: `não achei "${nome}" na ficha de ${ficha.nome}.`, ephemeral: true });
      return interaction.reply({ embeds: [sub === "ritual" ? detalheRitual(ficha, x) : detalheGenerico(ficha, x, sub)] });
    }

    if (sub === "funcao") {
      const funcao = interaction.options.getString("nome");
      const res = rpg.filtrarTudo(ficha, { funcao });
      const total = res.rituais.length + res.habilidades.length + res.itens.length;
      const e = embedBase(ficha, `Função: ${funcao}`);
      e.setDescription(`${total} resultado(s) em ${ficha.nome}.`);
      if (res.rituais.length) camposDeLista(e, ficha, "Rituais", res.rituais, "—");
      if (res.habilidades.length) camposDeLista(e, ficha, "Habilidades", res.habilidades, "—");
      if (res.itens.length) camposDeLista(e, ficha, "Itens", res.itens, "—");
      if (!total) e.setDescription(`Nada com a função "${funcao}" em ${ficha.nome}.`);
      return interaction.reply({ embeds: [e] });
    }

    // listagens
    const tipo = sub; // rituais | habilidades | itens
    const filtros = {
      funcao: interaction.options.getString("funcao"),
      elemento: interaction.options.getString("elemento"),
      busca: interaction.options.getString("busca"),
    };
    const lista = rpg.filtrar(ficha, tipo, filtros);
    const e = embedBase(ficha, `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} — ${ficha.nome}`);
    const filtrosTxt = [filtros.funcao && `função: ${filtros.funcao}`, filtros.elemento && `elemento: ${filtros.elemento}`, filtros.busca && `busca: "${filtros.busca}"`]
      .filter(Boolean)
      .join("  •  ");
    e.setDescription(`${lista.length} resultado(s)${filtrosTxt ? `  •  ${filtrosTxt}` : ""}.`);
    camposDeLista(e, ficha, tipo, lista, "nada encontrado.");
    return interaction.reply({ embeds: [e] });
  },
};
