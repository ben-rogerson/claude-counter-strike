# cs-radio

Counter-Strike 1.6 radio calls for [Claude Code](https://claude.com/claude-code).

| When | You hear |
| --- | --- |
| Session starts | "Locked and loaded" |
| A long turn finishes (45s+) | "Bomb has been defused" |
| A turn errors | "Negative" |
| You interrupt a turn | "Fall back" |
| A deploy starts | "Fire in the hole" |
| The deploy succeeds | "Counter-Terrorists win" |
| The deploy fails | "Terrorists win" |

A deploy is any command Claude runs that looks like one: `pnpm/npm/yarn/bun run deploy`, `wrangler deploy`, `vercel --prod`, `fly deploy`, `scripts/deploy.sh`.

## Install

```
/plugin marketplace add ben-rogerson/cs-radio
/plugin install cs-radio@cs-radio
```

Function-hook plugins (mods) are early access in Claude Code, so you need a recent build.

## Sounds

The radio wavs belong to Valve, so this repo doesn't include them. cs-radio reads them from your own Counter-Strike 1.6 install, checking the usual Steam folders:

- macOS: `~/Library/Application Support/Steam/steamapps/common/Half-Life/cstrike/sound/radio`
- Linux: `~/.steam/steam/...` or `~/.local/share/Steam/...` (same path from `steamapps` on)

If yours is somewhere else, set **CS 1.6 radio folder** in `/config` to the `cstrike/sound/radio` folder.

No install? It speaks the calls with your system voice instead, which is honestly still pretty good.

Clip playback uses `afplay`, so wavs only play on macOS for now.

## Commands

- `/radio` - toggle on/off (remembered across sessions)
- `/radio on` / `/radio off`
- `/radio test` - plays "Counter-Terrorists win" and tells you where the sounds come from

## Options (`/config`)

- **CS 1.6 radio folder** - path to `cstrike/sound/radio`
- **Long turn (seconds)** - how long a turn runs before "Bomb has been defused" plays. Default 45.

## Develop

```
claude --plugin-dir .          # load it from this checkout
claude plugin validate .
claude plugin test .
```

## License

MIT for the code. Counter-Strike and its sounds are Valve's.
