import { SlashCommandBuilder } from "discord.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Bir parça veya arama sonucu oynatır.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Şarkı adı ya da desteklenen kaynak URL'si")
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName("pause").setDescription("Oynatmayı duraklatır."),
  new SlashCommandBuilder().setName("resume").setDescription("Oynatmayı sürdürür."),
  new SlashCommandBuilder().setName("skip").setDescription("Sıradaki parçaya geçer."),
  new SlashCommandBuilder().setName("stop").setDescription("Oynatmayı durdurur ve botu kanaldan çıkarır."),
  new SlashCommandBuilder().setName("queue").setDescription("Mevcut kuyruğu gösterir."),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Ses seviyesini ayarlar.")
    .addIntegerOption((option) =>
      option
        .setName("percent")
        .setDescription("0-100 arası ses seviyesi")
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(true),
    ),
];

export const commandJson = commands.map((command) => command.toJSON());
