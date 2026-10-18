import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commandJson } from "./commands.js";

const rest = new REST({ version: "10" }).setToken(config.token);

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body: commandJson });
console.log(`Registered ${commandJson.length} slash commands.`);
