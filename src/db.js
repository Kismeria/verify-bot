const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'verify.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  log_channel_id TEXT,
  min_age_days INTEGER NOT NULL DEFAULT 0,
  alt_action TEXT NOT NULL DEFAULT 'flag'
);
CREATE TABLE IF NOT EXISTS verifications (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ver_ip ON verifications (guild_id, ip_hash);
`);

module.exports = {
  getConfig: (guildId) => db.prepare('SELECT * FROM guild_config WHERE guild_id = ?').get(guildId),
  setConfig: (c) =>
    db
      .prepare(
        `INSERT INTO guild_config (guild_id, role_id, log_channel_id, min_age_days, alt_action)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET role_id=excluded.role_id, log_channel_id=excluded.log_channel_id,
           min_age_days=excluded.min_age_days, alt_action=excluded.alt_action`
      )
      .run(c.guild_id, c.role_id, c.log_channel_id ?? null, c.min_age_days, c.alt_action),
  findByIp: (guildId, ipHash, exceptUserId) =>
    db
      .prepare('SELECT user_id FROM verifications WHERE guild_id = ? AND ip_hash = ? AND user_id != ?')
      .all(guildId, ipHash, exceptUserId),
  getVerification: (guildId, userId) =>
    db.prepare('SELECT * FROM verifications WHERE guild_id = ? AND user_id = ?').get(guildId, userId),
  saveVerification: (guildId, userId, ipHash, ua) =>
    db
      .prepare(
        `INSERT INTO verifications (guild_id, user_id, ip_hash, user_agent, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET ip_hash=excluded.ip_hash, user_agent=excluded.user_agent, created_at=excluded.created_at`
      )
      .run(guildId, userId, ipHash, ua ?? null, Date.now()),
  deleteVerification: (guildId, userId) =>
    db.prepare('DELETE FROM verifications WHERE guild_id = ? AND user_id = ?').run(guildId, userId),
};
