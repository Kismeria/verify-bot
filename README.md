# verify-bot

discord verification bot with alt detection, same idea as double counter.
user presses a button, finishes discord oauth in the browser, gets a role.
accounts verifying from the same ip are flagged / blocked / kicked / banned.

ips are stored only as salted hmac hashes.

## setup

1. create an app at https://discord.com/developers/applications
2. bot tab: enable **server members intent**, copy the token
3. oauth2 tab: copy client id + secret, add redirect `BASE_URL/callback`
4. invite the bot with scopes `bot applications.commands` and permission manage roles (+ kick/ban if you use those actions). put the bot role above the verified role
5. copy `.env.example` to `.env` and fill it
6. run:

```
npm install
npm run deploy   # registers slash commands once
npm start
```

`BASE_URL` must be reachable by your users (domain / tunnel / vps). behind a reverse proxy set `TRUST_PROXY=1`.

## commands

- `/setup channel role [log] [min_age] [alt_action]` posts the panel
- `/alts user` shows accounts sharing a network
- `/unverify user` removes record + role

needs node >= 22.5 (uses built-in sqlite).
