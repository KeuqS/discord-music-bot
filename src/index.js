import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
} from "discord.js";
import { LavalinkManager } from "lavalink-client";
import { config } from "./config.js";
import { startDashboard } from "./dashboard-server.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.lavalink = new LavalinkManager({
  nodes: [
    {
      id: "main",
      host: config.lavalink.host,
      port: config.lavalink.port,
      authorization: config.lavalink.password,
      secure: config.lavalink.secure,
    },
  ],
  autoSkip: true,
  sendToShard: (guildId, payload) => client.guilds.cache.get(guildId)?.shard?.send(payload),
  client: { id: config.clientId, username: "BeatWave Music" },
  playerOptions: {
    defaultSearchPlatform: config.lavalink.searchPlatform,
    onDisconnect: { autoReconnect: true, destroyPlayer: false },
    onEmptyQueue: { destroyAfterMs: 30_000 },
  },
});

const getPlayer = (guildId) => client.lavalink.getPlayer(guildId);

function voiceChannelOf(interaction) {
  return interaction.member?.voice?.channel;
}

function requireVoiceChannel(interaction) {
  const channel = voiceChannelOf(interaction);
  if (!channel) throw new Error("Önce bir ses kanalına katılmalısın.");
  if (!channel.joinable || !channel.speakable) {
    throw new Error("Botun bu ses kanalına katılma veya konuşma izni yok.");
  }
  return channel;
}

function requirePlayerInCallerChannel(interaction) {
  const channel = requireVoiceChannel(interaction);
  const player = getPlayer(interaction.guildId);

  if (!player || !player.queue?.current) {
    throw new Error("Şu anda oynatılan bir parça yok.");
  }
  if (player.voiceChannelId !== channel.id) {
    throw new Error("Bu komutu botun bulunduğu ses kanalından kullanmalısın.");
  }
  return player;
}

function formatDuration(milliseconds = 0) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

async function ensurePlayer(interaction, channel) {
  const player =
    getPlayer(interaction.guildId) ??
    client.lavalink.createPlayer({
      guildId: interaction.guildId,
      voiceChannelId: channel.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
      volume: 80,
    });

  if (player.voiceChannelId && player.voiceChannelId !== channel.id) {
    throw new Error("Bot şu anda başka bir ses kanalında kullanılıyor.");
  }
  if (!player.connected) await player.connect();
  return player;
}

async function dashboardChannel(guild, channelId, kind) {
  const channel = await guild.channels.fetch(channelId);
  if (!channel || (kind === "voice" ? !channel.isVoiceBased?.() : !channel.isTextBased?.())) {
    throw new Error(kind === "voice" ? "Geçerli bir ses kanalı seçmelisin." : "Geçerli bir metin kanalı seçmelisin.");
  }
  return channel;
}

async function playFromDashboard(guild, body) {
  const query = String(body.query ?? "").trim();
  if (!query) throw new Error("Bir şarkı adı veya bağlantı girmelisin.");

  const voiceChannel = await dashboardChannel(guild, body.voiceChannelId, "voice");
  if (!voiceChannel.joinable || !voiceChannel.speakable) {
    throw new Error("Botun bu ses kanalına katılma veya konuşma izni yok.");
  }

  const textChannel = body.textChannelId
    ? await dashboardChannel(guild, body.textChannelId, "text")
    : [...guild.channels.cache.values()].find((channel) =>
        channel?.isTextBased?.() && !channel?.isThread?.() && channel?.isSendable?.() !== false,
      );
  if (!textChannel) throw new Error("Bir metin kanalı seçmelisin.");

  const player = getPlayer(guild.id) ?? client.lavalink.createPlayer({
    guildId: guild.id,
    voiceChannelId: voiceChannel.id,
    textChannelId: textChannel.id,
    selfDeaf: true,
    volume: 80,
  });
  if (player.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
    throw new Error("Bot şu anda başka bir ses kanalında kullanılıyor.");
  }
  if (player.textChannelId !== textChannel.id) player.textChannelId = textChannel.id;
  if (!player.connected) await player.connect();

  const isUrl = /^https?:\/\//i.test(query);
  const result = await player.search(
    isUrl ? { query } : { query, source: config.lavalink.searchPlatform },
    client.user,
  );
  if (!result.tracks?.length) throw new Error("Bu aramayla eşleşen parça bulunamadı.");

  const tracks = result.loadType === "playlist" ? result.tracks : [result.tracks[0]];
  for (const track of tracks) player.queue.add(track);
  const wasPlaying = Boolean(player.queue.current && (player.playing || player.paused));
  if (!wasPlaying) await player.play();
  return { message: wasPlaying ? "Kuyruğa eklendi." : "Oynatılıyor.", title: tracks[0].info?.title };
}

async function actionFromDashboard(guild, body) {
  const player = getPlayer(guild.id);
  const action = String(body.action ?? "");
  if (action === "volume") {
    const percent = Number(body.percent);
    if (!player) throw new Error("Şu anda aktif bir oynatıcı yok.");
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Ses seviyesi 0-100 arasında olmalı.");
    await player.setVolume(percent);
    return { message: `Ses seviyesi %${percent} yapıldı.` };
  }
  if (!player) throw new Error("Şu anda aktif bir oynatıcı yok.");
  if (action === "pause") await player.pause(true);
  else if (action === "resume") await player.pause(false);
  else if (action === "skip") await player.skip();
  else if (action === "stop") await player.destroy();
  else throw new Error("Geçersiz oynatma işlemi.");
  return { message: "İşlem uygulandı." };
}

async function handlePlay(interaction) {
  const channel = requireVoiceChannel(interaction);
  const query = interaction.options.getString("query", true).trim();
  if (!query) throw new Error("Bir şarkı adı veya bağlantı girmelisin.");
  await interaction.deferReply();

  const player = await ensurePlayer(interaction, channel);
  const isUrl = /^https?:\/\//i.test(query);
  const result = await player.search(
    isUrl ? { query } : { query, source: config.lavalink.searchPlatform },
    interaction.user,
  );

  if (!result.tracks?.length) {
    return interaction.editReply("Bu aramayla eşleşen parça bulunamadı. Kaynağın Lavalink üzerinde etkin olduğundan emin ol.");
  }

  const tracks = result.loadType === "playlist" ? result.tracks : [result.tracks[0]];
  for (const track of tracks) player.queue.add(track);

  const wasPlaying = Boolean(player.queue.current && (player.playing || player.paused));
  if (!wasPlaying) await player.play();

  const first = tracks[0];
  return interaction.editReply(
    wasPlaying
      ? `Kuyruğa eklendi: **${first.info.title}**`
      : `Oynatılıyor: **${first.info.title}**`,
  );
}

async function handleQueue(interaction) {
  const player = getPlayer(interaction.guildId);
  if (!player?.queue?.current) return interaction.reply("Kuyruk şu anda boş.");

  const current = player.queue.current;
  const tracks = player.queue.tracks ?? [];
  const lines = tracks.slice(0, 10).map((track, index) =>
    `${index + 1}. **${track.info.title}** — ${formatDuration(track.info.length)}`,
  );
  const embed = new EmbedBuilder()
    .setTitle("Müzik kuyruğu")
    .setDescription(
      `Şimdi çalıyor: **${current.info.title}**\n\n${lines.join("\n") || "Sırada başka parça yok."}`,
    )
    .setColor(0x7c3aed);
  return interaction.reply({ embeds: [embed] });
}

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  switch (interaction.commandName) {
    case "play":
      return handlePlay(interaction);
    case "queue":
      return handleQueue(interaction);
    case "pause": {
      const player = requirePlayerInCallerChannel(interaction);
      if (player.paused) return interaction.reply("Parça zaten duraklatılmış.");
      await player.pause(true);
      return interaction.reply("⏸️ Duraklatıldı.");
    }
    case "resume": {
      const player = requirePlayerInCallerChannel(interaction);
      if (!player.paused) return interaction.reply("Parça zaten oynatılıyor.");
      await player.pause(false);
      return interaction.reply("▶️ Devam ediyor.");
    }
    case "skip": {
      const player = requirePlayerInCallerChannel(interaction);
      await player.skip();
      return interaction.reply("⏭️ Sıradaki parçaya geçildi.");
    }
    case "stop": {
      const player = getPlayer(interaction.guildId);
      if (!player) return interaction.reply("Bot zaten ses kanalında değil.");
      const channel = requireVoiceChannel(interaction);
      if (player.voiceChannelId !== channel.id) {
        throw new Error("Bu komutu botun bulunduğu ses kanalından kullanmalısın.");
      }
      await player.destroy();
      return interaction.reply("⏹️ Oynatma durduruldu.");
    }
    case "volume": {
      const player = requirePlayerInCallerChannel(interaction);
      const percent = interaction.options.getInteger("percent", true);
      await player.setVolume(percent);
      return interaction.reply(`🔊 Ses seviyesi: **%${percent}**`);
    }
    default:
      return undefined;
  }
}

client.on("raw", (payload) => client.lavalink.sendRawData(payload));

client.once("ready", () => {
  client.lavalink.init({ ...client.user });
  console.log(`Logged in as ${client.user.tag}`);
  if (config.dashboard.enabled && config.dashboard.password) {
    startDashboard({
      client,
      config,
      getPlayer,
      play: playFromDashboard,
      action: actionFromDashboard,
    });
  } else {
    console.warn("Dashboard disabled: set DASHBOARD_PASSWORD to enable it.");
  }
});

client.lavalink.on("trackStart", (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId);
  channel?.send(`🎶 Şimdi çalıyor: **${track.info.title}**`).catch((error) => {
    console.error("Could not send track announcement:", error.message);
  });
});

client.lavalink.on("queueEnd", (player) => {
  const channel = client.channels.cache.get(player.textChannelId);
  channel?.send("Kuyruk tamamlandı. Yeni bir parça ekleyebilirsin.").catch((error) => {
    console.error("Could not send queue-end message:", error.message);
  });
  player.destroy().catch((error) => {
    console.error("Could not destroy idle player:", error.message);
  });
});

client.lavalink.nodeManager.on("connect", (node) => {
  console.log(`Lavalink node connected: ${node.id}`);
});

client.lavalink.nodeManager.on("error", (node, error) => {
  console.error(`Lavalink node error (${node.id}):`, error.message);
});

client.on("interactionCreate", async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(`❌ ${message}`).catch(console.error);
    } else {
      await interaction.reply({ content: `❌ ${message}`, ephemeral: true }).catch(console.error);
    }
  }
});

process.on("SIGINT", () => {
  client.destroy();
});
process.on("SIGTERM", () => {
  client.destroy();
});

await client.login(config.token);
