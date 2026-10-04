# Claude Counter-Strike

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

In Claude Code:

```
/plugin marketplace add ben-rogerson/claude-counter-strike
/plugin install cs-radio@cs-radio
```

Or from your terminal:

```
claude plugin marketplace add ben-rogerson/claude-counter-strike
claude plugin install cs-radio@cs-radio
```

Function-hook plugins (mods) are early access in Claude Code, so you need a recent build.

## Sounds

Claude Counter-Strike looks for sounds in this order:

1. **Valve's originals** from your own Counter-Strike 1.6 install (they're not in this repo). It checks the usual Steam folders:
   - macOS: `~/Library/Application Support/Steam/steamapps/common/Half-Life/cstrike/sound/radio`
   - Linux: `~/.steam/steam/...` or `~/.local/share/Steam/...` (same path from `steamapps` on)

   If yours is somewhere else, set **CS 1.6 radio folder** in `/config` to the `cstrike/sound/radio` folder.
2. **Bundled soundalikes** in `sounds/`, used when no install is found. They were made for this repo with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) text-to-speech plus a radio filter, so they're free to redistribute. Regenerate them with `uv run scripts/make-sounds.py` (see the script header).
3. **Your system voice**, if a clip can't play.

Clips play on:

- macOS: built in (`afplay`)
- Linux: the first of `paplay`, `pw-play` or `aplay` it finds
- Windows: PowerShell's `SoundPlayer`. It also checks `C:/Program Files (x86)/Steam/...` for a CS 1.6 install

Linux and Windows support is new and only covered by tests so far. If it doesn't play for you, please [open an issue](https://github.com/ben-rogerson/claude-counter-strike/issues).

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

MIT for the code and the bundled soundalikes. Counter-Strike and its original sounds are Valve's.
