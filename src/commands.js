const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const db = require('./db');
const { BASE_URL } = require('./web');

const admin = PermissionFlagsBits.ManageGuild;
const eph = MessageFlags.Ephemeral;
const quiet = { parse: [] };

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post the verification panel and configure the bot')
    .setDefaultMemberPermissions(admin)
    .setDMPermission(false)
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Where to post the panel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Role given after verification').setRequired(true))
    .addChannelOption((o) =>
      o.setName('log').setDescription('Channel for verification logs').addChannelTypes(ChannelType.GuildText))
    .addIntegerOption((o) =>
      o.setName('min_age').setDescription('Minimum account age in days (0 = off)').setMinValue(0).setMaxValue(3650))
    .addStringOption((o) =>
      o.setName('alt_action').setDescription('What to do when an alt is detected').addChoices(
        { name: 'flag (verify + log)', value: 'flag' },
        { name: 'block (deny + log)', value: 'block' },
        { name: 'kick', value: 'kick' },
        { name: 'ban', value: 'ban' }
      )),
  new SlashCommandBuilder()
    .setName('alts')
    .setDescription('Show accounts that verified from the same network as a user')
    .setDefaultMemberPermissions(admin)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User to check').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Remove a user verification record and role')
    .setDefaultMemberPermissions(admin)
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
];

const panel = (guildId) => ({
  embeds: [
    new EmbedBuilder()
      .setColor(0x23a55a)
      .setTitle('Verify to access this server')
      .setDescription('This server is protected by a verification system. Click the button below to verify.')
      .setFooter({ text: 'Powered by Verify Bot' }),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verify:${guildId}`).setLabel('Verify my account').setStyle(ButtonStyle.Success)
    ),
  ],
});

async function handle(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith('verify:')) {
    const guildId = interaction.customId.split(':')[1];
    const cfg = db.getConfig(guildId);
    if (!cfg) return interaction.reply({ content: 'Verification is not configured.', flags: eph });
    if (interaction.member?.roles?.cache?.has(cfg.role_id)) {
      return interaction.reply({ content: 'You are already verified.', flags: eph });
    }
    return interaction.reply({
      content: 'Press the button below to finish verification in your browser.',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel('Continue').setStyle(ButtonStyle.Link).setURL(`${BASE_URL}/verify?guild=${guildId}`)
        ),
      ],
      flags: eph,
    });
  }

  if (!interaction.isChatInputCommand()) return;
  const { guild } = interaction;

  if (interaction.commandName === 'setup') {
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const log = interaction.options.getChannel('log');
    db.setConfig({
      guild_id: guild.id,
      role_id: role.id,
      log_channel_id: log?.id,
      min_age_days: interaction.options.getInteger('min_age') ?? 0,
      alt_action: interaction.options.getString('alt_action') ?? 'flag',
    });
    await channel.send(panel(guild.id));
    return interaction.reply({ content: `panel posted in ${channel}`, flags: eph });
  }

  if (interaction.commandName === 'alts') {
    const user = interaction.options.getUser('user');
    const rec = db.getVerification(guild.id, user.id);
    if (!rec) return interaction.reply({ content: `${user} is not verified`, flags: eph, allowedMentions: quiet });
    const others = db.findByIp(guild.id, rec.ip_hash, user.id);
    return interaction.reply({
      content: others.length
        ? `${user} shares a network with: ${others.map((o) => `<@${o.user_id}>`).join(', ')}`
        : `no alts found for ${user}`,
      flags: eph,
      allowedMentions: quiet,
    });
  }

  if (interaction.commandName === 'unverify') {
    const user = interaction.options.getUser('user');
    const cfg = db.getConfig(guild.id);
    db.deleteVerification(guild.id, user.id);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member && cfg) await member.roles.remove(cfg.role_id).catch(() => {});
    return interaction.reply({ content: `${user} unverified`, flags: eph, allowedMentions: quiet });
  }
}

module.exports = { commands, handle };
