# verify-bot

discord verification bot with alt detection, same idea as double counter.
user presses a button, finishes discord oauth in the browser, gets a role.
accounts verifying from the same ip are flagged / blocked / kicked / banned.

ips are stored only as salted hmac hashes.

## how it works

1. admin runs `/setup`, bot posts the "Verify to access this server" panel
2. user clicks **Verify my account**, bot replies with a private link
3. link opens the web page, which redirects to discord oauth (`identify` scope)
4. discord sends the user back to `BASE_URL/callback`
5. bot checks account age and ip, then gives the role or applies the alt action

## setup

### 1. create the discord app

1. go to https://discord.com/developers/applications and press **New Application**
2. **Bot** tab: press **Reset Token**, copy it (`DISCORD_TOKEN`)
3. **Bot** tab: enable **Server Members Intent**
4. **OAuth2** tab: copy **Client ID** (`CLIENT_ID`) and **Client Secret** (`CLIENT_SECRET`)
5. **OAuth2** tab, **Redirects**: add `BASE_URL/callback`, for example `https://verify.example.com/callback` (must match `.env` exactly)

### 2. invite the bot

1. **OAuth2 > URL Generator**: scopes `bot` and `applications.commands`
2. bot permissions: **Manage Roles** (+ **Kick Members** / **Ban Members** if you use those alt actions)
3. open the generated link and add the bot to your server
4. in server settings > roles drag the bot role **above** the role it should give

### 3. public url

the web server must be reachable by users from the internet, `localhost` works only for you.
pick one:

- vps / domain with nginx or caddy proxying to the port, then set `TRUST_PROXY=1`
- tunnel for testing: `cloudflared tunnel --url http://localhost:3000` or ngrok, use the given https url as `BASE_URL`

if `TRUST_PROXY` is wrong, every user looks like the same ip (proxy ip) and everyone is flagged as an alt.

### 4. config

copy `.env.example` to `.env` and fill it:

| var | what |
| --- | --- |
| `DISCORD_TOKEN` | bot token |
| `CLIENT_ID` | application id |
| `CLIENT_SECRET` | oauth2 secret |
| `BASE_URL` | public url, no trailing slash |
| `PORT` | web port, default 3000 |
| `SESSION_SECRET` | long random string, signs state and salts ip hashes. do not change after launch or old hashes stop matching |
| `TRUST_PROXY` | `1` if behind nginx / cloudflare |

generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 5. run

needs node >= 22.5 (uses built-in sqlite).

```
npm install
npm run deploy   # registers slash commands, once (and after command changes)
npm start
```

### 6. configure in discord

run `/setup` in your server (needs Manage Server):

- `channel` where to post the panel
- `role` role given after verification
- `log` (optional) channel for verification logs
- `min_age` (optional) minimum account age in days
- `alt_action` (optional) `flag`, `block`, `kick` or `ban`

hide the rest of the server from users without the role, so the panel channel is the only one they see.

## commands

- `/setup channel role [log] [min_age] [alt_action]` posts the panel
- `/alts user` shows accounts sharing a network
- `/unverify user` removes record + role

## notes

- data lives in `data/verify.db`, back it up
- users on the same wifi / vpn / mobile carrier nat share an ip, use `flag` first and check `/alts` before banning anyone
