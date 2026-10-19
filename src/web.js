const express = require('express');
const crypto = require('node:crypto');
const db = require('./db');

const SECRET = process.env.SESSION_SECRET || 'change-me';
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const REDIRECT_URI = `${BASE_URL}/callback`;
const STATE_TTL = 10 * 60 * 1000;

const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('hex');
const hashIp = (ip) => hmac(`ip:${ip}`);

const signState = (guildId) => {
  const payload = `${guildId}.${Date.now()}.${crypto.randomBytes(8).toString('hex')}`;
  return `${payload}.${hmac(payload)}`;
};

const readState = (state) => {
  const parts = String(state || '').split('.');
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join('.');
  const a = Buffer.from(parts[3]);
  const b = Buffer.from(hmac(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Date.now() - Number(parts[1]) > STATE_TTL) return null;
  return { guildId: parts[0] };
};

const accountAgeMs = (id) => Date.now() - (Number(BigInt(id) >> 22n) + 1420070400000);

const page = (title, text, ok) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1e1f22;color:#dbdee1;font-family:system-ui,sans-serif}
.card{background:#2b2d31;border-radius:12px;padding:32px 40px;max-width:420px;text-align:center;border-top:4px solid ${ok ? '#23a55a' : '#f23f43'}}
h1{margin:0 0 12px;font-size:22px}p{margin:0;color:#b5bac1;line-height:1.5}
</style></head><body><div class="card"><h1>${title}</h1><p>${text}</p></div></body></html>`;

function startWeb(client) {
  const app = express();
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', true);

  app.get('/', (_req, res) => res.send('ok'));

  // step 1: button link lands here, bounce to discord oauth
  app.get('/verify', (req, res) => {
    const guildId = String(req.query.guild || '');
    if (!/^\d{15,25}$/.test(guildId) || !db.getConfig(guildId)) {
      return res.status(400).send(page('Invalid link', 'This server is not set up for verification.', false));
    }
    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state: signState(guildId),
      prompt: 'none',
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // step 2: discord sends the user back with a code
  app.get('/callback', async (req, res) => {
    const state = readState(req.query.state);
    if (!state || !req.query.code) {
      return res.status(400).send(page('Link expired', 'Go back to Discord and press the button again.', false));
    }
    try {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: String(req.query.code),
          redirect_uri: REDIRECT_URI,
        }),
      });
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
      const { access_token } = await tokenRes.json();
      const meRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!meRes.ok) throw new Error(`me ${meRes.status}`);
      const me = await meRes.json();

      const result = await processVerification(client, state.guildId, me, req.ip, req.get('user-agent'));
      res.status(result.ok ? 200 : 403).send(page(result.title, result.text, result.ok));
    } catch (err) {
      console.error('callback error:', err);
      res.status(500).send(page('Something went wrong', 'Try again in a minute.', false));
    }
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`web on :${port}`));
}

const DENIED = { ok: false, title: 'Verification denied', text: 'Another account from your network is already verified here.' };

async function processVerification(client, guildId, user, ip, ua) {
  const cfg = db.getConfig(guildId);
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!cfg || !guild) return { ok: false, title: 'Server unavailable', text: 'This server is not set up.' };

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return { ok: false, title: 'Not in server', text: 'Join the server first, then verify.' };

  const log = async (content) => {
    if (!cfg.log_channel_id) return;
    const ch = await guild.channels.fetch(cfg.log_channel_id).catch(() => null);
    if (ch?.isTextBased()) await ch.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  };

  const ageDays = accountAgeMs(user.id) / 86_400_000;
  if (cfg.min_age_days > 0 && ageDays < cfg.min_age_days) {
    await log(`blocked <@${user.id}> (\`${user.username}\`): account is ${ageDays.toFixed(1)}d old, min is ${cfg.min_age_days}d`);
    return { ok: false, title: 'Account too new', text: `Your account must be at least ${cfg.min_age_days} days old.` };
  }

  const ipHash = hashIp(ip);
  const others = db.findByIp(guildId, ipHash, user.id);

  if (others.length) {
    await log(`alt detected: <@${user.id}> (\`${user.username}\`) shares ip with ${others.map((o) => `<@${o.user_id}>`).join(', ')}`);
    if (cfg.alt_action === 'block') return DENIED;
    if (cfg.alt_action === 'kick') {
      await member.kick('alt account detected').catch(() => {});
      return DENIED;
    }
    if (cfg.alt_action === 'ban') {
      await member.ban({ reason: 'alt account detected' }).catch(() => {});
      return DENIED;
    }
  }

  db.saveVerification(guildId, user.id, ipHash, ua);
  try {
    await member.roles.add(cfg.role_id, 'verified');
  } catch (err) {
    console.error('role add failed:', err.message);
    return { ok: false, title: 'Role error', text: 'Bot cannot give the role. Tell a server admin to move the bot role above it.' };
  }
  await log(`verified <@${user.id}> (\`${user.username}\`)`);
  return { ok: true, title: 'Verified', text: 'You can close this tab and go back to Discord.' };
}

module.exports = { startWeb, BASE_URL };
