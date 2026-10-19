require('dotenv').config();
const { Client, GatewayIntentBits, MessageFlags } = require('discord.js');
const { startWeb } = require('./web');
const { handle } = require('./commands');

for (const k of ['DISCORD_TOKEN', 'CLIENT_ID', 'CLIENT_SECRET', 'BASE_URL', 'SESSION_SECRET']) {
  if (!process.env[k]) {
    console.error(`missing ${k} in .env`);
    process.exit(1);
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => console.log(`logged in as ${client.user.tag}`));
client.on('interactionCreate', (i) =>
  handle(i).catch((err) => {
    console.error(err);
    if (i.isRepliable() && !i.replied && !i.deferred) i.reply({ content: 'error', flags: MessageFlags.Ephemeral }).catch(() => {});
  })
);

startWeb(client);
client.login(process.env.DISCORD_TOKEN);
