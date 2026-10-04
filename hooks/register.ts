import type { EngineInterface, Register } from 'claude-code'

// Counter-Strike 1.6 radio calls for Claude Code events. /radio [on|off|test] toggles,
// kept across sessions.
//
//   session start         "Locked and loaded"       locknload.wav
//   long turn finishes    "Bomb has been defused"   bombdef.wav
//   turn errors           "Negative"                negative.wav
//   turn interrupted      "Fall back"               fallback.wav
//   deploy starts         "Fire in the hole"        ct_fireinhole.wav
//   deploy ok / failed    "Counter-Terrorists win"  ctwin.wav / terwin.wav
//
// The wavs are Valve's, so none ship here: they're read from your own CS 1.6 install
// (soundDir option, else the usual Steam folders). Without them the calls are spoken.

const CALLS = {
  locknload: 'Locked and loaded',
  bombdef: 'Bomb has been defused',
  negative: 'Negative',
  fallback: 'Fall back',
  ct_fireinhole: 'Fire in the hole',
  ctwin: 'Counter-Terrorists win',
  terwin: 'Terrorists win',
} as const
type Call = keyof typeof CALLS

const STEAM_RADIO = [
  'Library/Application Support/Steam/steamapps/common/Half-Life/cstrike/sound/radio',
  '.steam/steam/steamapps/common/Half-Life/cstrike/sound/radio',
  '.local/share/Steam/steamapps/common/Half-Life/cstrike/sound/radio',
]

const DEPLOY = /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?deploy\b|\bwrangler\s+deploy\b|\bvercel\s+(?:--prod|deploy)\b|\bfly\s+deploy\b|scripts\/deploy\.sh/

let soundDir: string | undefined
const clips = new Map<Call, string>()

async function findSoundDir($: EngineInterface, configured: string) {
  const home = (await $.env.get('HOME')) ?? ''
  const candidates = configured
    ? [configured.replace(/^~(?=\/)/, home)]
    : STEAM_RADIO.map(p => `${home}/${p}`)
  for (const dir of candidates) {
    if (await $.fs.exists(`${dir}/ctwin.wav`)) return dir
  }
  return undefined
}

async function isOn($: EngineInterface) {
  return (await $.store.get('enabled')) !== false
}

async function play($: EngineInterface, call: Call) {
  if (!(await isOn($))) return
  const fail = (err: unknown) => $.ui.log(`cs-radio: ${err}`, { to: 'debug' })
  if (!soundDir) return void $.audio.speak(CALLS[call]).catch(fail)
  try {
    let base64 = clips.get(call)
    if (!base64) {
      const read = await $.fs.read(`${soundDir}/${call}.wav`, { as: 'bytes' })
      base64 = read.base64
      clips.set(call, base64)
    }
    void $.audio.play({ base64, mime: 'audio/wav' }).catch(fail)
  } catch (err) {
    fail(err)
    void $.audio.speak(CALLS[call]).catch(fail)
  }
}

export const register: Register = (on, options) => {
  const longTurnMs = Number(options.longTurnSeconds ?? 45) * 1000

  on('session.start', async ($, e, next) => {
    soundDir = await findSoundDir($, String(options.soundDir ?? ''))
    await $.command.register({
      name: 'radio',
      description: 'Toggle Counter-Strike radio calls',
      argumentHint: '[on|off|test]',
      immediate: true,
    })
    await play($, 'locknload')
    return next(e)
  })

  on('command.run', { command: 'radio' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const source = soundDir ? `wavs from ${soundDir}` : 'spoken (no CS 1.6 radio folder found, set soundDir in /config)'
    if (arg === 'test') {
      if (!(await isOn($))) return { text: 'Radio is off - /radio on first.' }
      await play($, 'ctwin')
      return { text: `Radio check: Counter-Terrorists win. Using ${source}.` }
    }
    if (arg && arg !== 'on' && arg !== 'off') return { text: 'Usage: /radio [on|off|test]' }
    const now = arg ? arg === 'on' : !(await isOn($))
    await $.store.set('enabled', now)
    if (now) await play($, 'locknload')
    return { text: `Radio ${now ? 'on' : 'off'}.` }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.reason === 'aborted') await play($, 'fallback')
    else if (e.reason === 'error') await play($, 'negative')
    else if (e.reason === 'answer' && e.durationMs >= longTurnMs) await play($, 'bombdef')
    return next(e)
  })

  // deploys Claude runs through Bash
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!DEPLOY.test(e.command) || e.run_in_background) return next(e)
    await play($, 'ct_fireinhole')
    const ran = await next(e)
    if (ran.deny === undefined) await play($, ran.isError ? 'terwin' : 'ctwin')
    return ran
  })

  // deploys other plugins spawn
  on('process.spawn', async function* ($, e, next) {
    if (!DEPLOY.test(e.argv.join(' '))) return yield* next(e)
    await play($, 'ct_fireinhole')
    const result = yield* next(e)
    if (result.deny === undefined) await play($, result.value.code === 0 ? 'ctwin' : 'terwin')
    return result
  })
}
