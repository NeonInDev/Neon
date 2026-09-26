const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, EmbedBuilder } = require("discord.js");
const { log } = require("../logger");
const pc = require("../pc");

const AZUL = 0x4aa8ff;
const CIANO = 0x7fe3ff;
const DOURADO = 0xffd166;
const VERDE = 0x2dd4a7;

function embedsProjeto() {
  return [
    new EmbedBuilder()
      .setTitle("⚛️ Reator HHO — Ark Reactor")
      .setColor(AZUL)
      .setDescription(
        "Célula eletrolítica H₂+O₂ com Arduino, montada pra **parecer** um Arc Reactor e **medir de verdade** o que produz.\n\n" +
        "A sacada: o brilho do núcleo é **dirigido por dado real**. Mais ampères na célula → o núcleo pulsa mais rápido e mais forte. A luz não é enfeite, é leitura."
      )
      .addFields(
        {
          name: "O que já existe",
          value: "Arduino Uno · fonte 12V/2A · DS18B20 · ACS712 · módulo relé · ventoinha · dissipador · placas inox 316 · NaOH · borbulhador · tela de inox",
          inline: false,
        },
        { name: "Caminho do gás", value: "`Célula → Borbulhador → Rotamâmetro → Flame arrester → Chama (fora da carcaça)`", inline: false },
        { name: "Pinagem", value: "D7 relé · D9 ventoinha · D4 temp · A0 corrente · **D5 livre** (vai pro MOSFET do ímã)", inline: false }
      )
      .setFooter({ text: "Nunca feche hermético · sempre flame arrester · luva + óculos pro NaOH" }),

    new EmbedBuilder()
      .setTitle("🧲 Agitador magnético")
      .setColor(CIANO)
      .setDescription(
        "Barra imantada girando dentro da célula, movida por um eletroímã por baixo.\n\n" +
        "Melhora o rendimento de verdade: renova o eletrólito na superfície das placas, descola bolhas e uniformiza a concentração de NaOH."
      )
      .addFields(
        {
          name: "Peças",
          value: "Fonte 12V/1A **separada** · MOSFET IRLZ44N · resistor 100Ω · diodo 1N5819 (flyback) · núcleo de ferro · fio de esmalte 0,2mm (~30m) · barra PTFE 20–25mm",
          inline: false,
        },
        {
          name: "⚠️ Regras que não dá pra furar",
          value:
            "• A bobina fica **fora** do líquido — NaOH come o esmalte e o fio vira eletrodo\n" +
            "• Núcleo de ferro **nunca** dentro do líquido\n" +
            "• Fonte separada: a de 12V/2A já está no limite com a célula e afundaria\n" +
            "• Ímã **encapsulado** em epóxi/PTFE — neodímio solto perto de H₂ é risco de faísca",
          inline: false,
        }
      ),

    new EmbedBuilder()
      .setTitle("🎬 A carcaça")
      .setColor(DOURADO)
      .addFields(
        {
          name: "Para comprar",
          value:
            "**Estrutura:** tambor de aço Ø20–25cm · chapa acrílico 3–5mm · anel de alumínio usinado · spray preto fosco + esmalte cromado · parafusos M3/M4 inox\n" +
            "**Núcleo:** anel WS2812B 12/24LED · fonte 5V/2A · capacitor 1000µF\n" +
            "**Instrumento:** rotamâmetro 0–100 mL/min · OLED SSD1306 · cilindro graduado 500–1000mL · válvula de retenção · manômetro 0–60 mbar",
          inline: false,
        },
        {
          name: "Fases",
          value: "1. Medir o gás (rotamâmetro + OLED)\n2. Agitador magnético\n3. Carcaça de aço\n4. Núcleo de LED (brilho = vazão medida)\n5. Gasômetro + célula a combustível PEM *(opcional)*",
          inline: false,
        },
        { name: "Custo do que falta", value: "~R$ 350–550\nCorta pra ~R$ 200 tirando manômetro e cilindro graduado", inline: true },
        {
          name: "Por que vale",
          value: "Faraday na prática (11,4 mL/min/A), volume acumulado no gasômetro, lei de Avogadro (2:1). **HHO não é combustível** — a 2A dá só ~23 mL/min. O valor é didático e demonstrativo.",
          inline: true,
        }
      )
      .setFooter({ text: "A chama do hidrogênio é azul pálido e quase invisível na luz do dia — cuidado" }),
  ];
}

async function embedsPC() {
  const base = new EmbedBuilder()
    .setTitle("🖥️ Estado do Neon World")
    .setColor(VERDE)
    .setTimestamp();

  try {
    const i = await pc.pcInfoJson();
    const num = (v, suf = "") => (v === null || v === undefined ? "—" : `${v}${suf}`);
    const barra = (pct) => {
      if (pct === null || pct === undefined) return "";
      const cheio = Math.round((pct / 100) * 10);
      return `\n\`${"█".repeat(Math.max(0, cheio)).padEnd(10, "░")}\` ${pct}%`;
    };

    base
      .setDescription(`**${i.cpuNome || "CPU desconhecida"}**`)
      .addFields(
        { name: "CPU", value: num(i.cpuUso, "%") + barra(i.cpuUso), inline: true },
        {
          name: "Memória",
          value: `${num(i.ramLivre)} GB livres de ${num(i.ramTotal)} GB` + barra(i.ramUso),
          inline: true,
        },
        {
          name: "Disco",
          value: `${num(i.discoLivre)} GB livres de ${num(i.discoTotal)} GB` + barra(i.discoUso),
          inline: true,
        },
        {
          name: "Temperatura",
          value: i.temperaturaDisponivel
            ? `CPU ${num(i.temperatura, "°C")}${i.temperaturaGpu !== null && i.temperaturaGpu !== undefined ? ` · GPU ${i.temperaturaGpu}°C` : ""}`
            : "Sem sensor disponível",
          inline: true,
        }
      );
  } catch (err) {
    base.setColor(0xef4444).setDescription(`Falha ao ler o sistema: ${err.message}`);
  }

  return [base];
}

async function entregar(user, embeds) {
  try {
    await user.send({ embeds });
    return "dm";
  } catch {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("relatorio")
    .setDescription("Manda um relatório pro seu celular e (opcionalmente) desliga o PC")
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .addStringOption((o) =>
      o
        .setName("tipo")
        .setDescription("Qual relatório")
        .setRequired(false)
        .addChoices(
          { name: "Projeto Ark Reactor / HHO", value: "projeto" },
          { name: "Estado do PC", value: "pc" }
        )
    )
    .addBooleanOption((o) => o.setName("desligar").setDescription("Desligar o PC logo depois de enviar"))
    .addIntegerOption((o) =>
      o.setName("espera").setDescription("Segundos de contagem antes de desligar (0-600, padrão 10)")
    ),
  adminOnly: true,

  async execute(interaction) {
    const tipo = interaction.options.getString("tipo") || "projeto";
    const querDesligar = interaction.options.getBoolean("desligar") || false;
    const espera = Math.min(600, Math.max(0, interaction.options.getInteger("espera") ?? 10));

    await interaction.deferReply({ ephemeral: true });

    const embeds = tipo === "pc" ? await embedsPC() : embedsProjeto();
    const via = await entregar(interaction.user, embeds);

    if (!via) {
      log("WARN", "Relatorio: DM bloqueada, sem canal de reserva", { user: interaction.user.id });
      return interaction.editReply(
        "❌ **Não consegui te mandar a DM** — seu privacidade tá bloqueada pra mim.\n\nAbre o perfil → **Privacidade → Permitir mensagens diretas do servidor**, e dexa a Neon te mandar mensagem pelo menos uma vez. Depois roda o comando de novo."
      );
    }

    log("INFO", "Relatorio enviado", { tipo, user: interaction.user.id });

    if (!querDesligar) {
      return interaction.editReply(`📨 Mandei pro seu celular (**${embeds.length} embed${embeds.length > 1 ? "s" : ""}**).`);
    }

    const msg = await pc.desligar(espera);
    log("WARN", "Desligamento agendado via /relatorio", { user: interaction.user.id, espera });
    return interaction.editReply(
      `📨 Mandei pro celular e ${msg}\n\n⚠️ **Só dá pra cancelar pelo PC** — digite \`neon, cancelar\` antes de estourar o tempo. O desligamento roda no próprio PC, então do celular não tem como reverter.`
    );
  },
};
