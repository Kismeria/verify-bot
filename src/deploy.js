require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { commands } = require('./commands');

const rest = new REST().setToken(process.env.DISCORD_TOKEN);
rest
  .put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands.map((c) => c.toJSON()) })
  .then(() => console.log('commands registered'))
  .catch(console.error);
