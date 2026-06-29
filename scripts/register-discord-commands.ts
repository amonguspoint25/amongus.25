import * as dotenv from "dotenv";
dotenv.config();
import { COMMANDS } from "../src/lib/discord/commands";

// Registers the slash commands with Discord. Run once (and again whenever COMMANDS changes):
//   npx tsx scripts/register-discord-commands.ts
// Set DISCORD_APP_ID + DISCORD_BOT_TOKEN in .env. Optionally set DISCORD_GUILD_ID to register
// guild-scoped commands (appear instantly); without it, global commands register (~1h to appear).
async function main() {
  const appId = process.env.DISCORD_APP_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!appId || !token) {
    console.error("Missing DISCORD_APP_ID and/or DISCORD_BOT_TOKEN in env.");
    process.exit(1);
  }

  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(COMMANDS),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  if (!res.ok) {
    console.error(text.slice(0, 800));
    process.exit(1);
  }
  console.log(
    guildId
      ? `Registered ${COMMANDS.length} guild commands (instant).`
      : `Registered ${COMMANDS.length} GLOBAL commands (can take ~1h to appear).`,
  );
}

main();
