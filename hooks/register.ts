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
// Valve's wavs can't ship here, so they're read from your own CS 1.6 install (soundDir
// option, else the usual Steam folders). Without them it plays the soundalikes in sounds/
// (scripts/make-sounds.py), and speaks the call if those can't play.
//
// The engine's clip player is afplay, so it only plays on macOS. Linux plays clips with
// paplay, pw-play or aplay and Windows with PowerShell's SoundPlayer.

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
const WINDOWS_STEAM_RADIO = 'C:/Program Files (x86)/Steam/steamapps/common/Half-Life/cstrike/sound/radio'
const LINUX_PLAYERS = ['paplay', 'pw-play', 'aplay']

const DEPLOY = /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?deploy\b|\bwrangler\s+deploy\b|\bvercel\s+(?:--prod|deploy)\b|\bfly\s+deploy\b|scripts\/deploy\.sh/

// 'engine': $.audio.play (macOS). A function: the command that plays a wav file.
// undefined: nothing can play clips here, so calls are spoken.
type Player = 'engine' | ((file: string) => string[]) | undefined

let soundDir: string | undefined
let player: Player
const clips = new Map<Call, string>()

async function isWindows($: EngineInterface) {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function findPlayer($: EngineInterface): Promise<Player> {
  if (await isWindows($)) {
    return file => [
      'powershell', '-NoProfile', '-NonInteractive', '-Command',
      `(New-Object Media.SoundPlayer '${file.replaceAll("'", "''")}').PlaySync()`,
    ]
  }
  const os = await $.process.run(['uname', '-s']).then(r => r.stdout.trim(), () => '')
  if (os === 'Darwin' || !os) return 'engine' // !os: can't tell, keep the engine's player
  for (const bin of LINUX_PLAYERS) {
    const found = await $.process.run(['sh', '-c', `command -v ${bin}`]).then(r => r.exitCode === 0, () => false)
    if (found) return file => [bin, file]
  }
  return undefined
}

async function findSoundDir($: EngineInterface, configured: string) {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  const candidates = configured
    ? [configured.replace(/^~(?=[\/\\])/, home)]
    : (await isWindows($))
      ? [WINDOWS_STEAM_RADIO]
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
  const speak = () => void $.audio.speak(CALLS[call]).catch(fail)
  if (!player) return speak()
  if (player !== 'engine') {
    const file = soundDir ? `${soundDir}/${call}.wav` : `${$.plugin.root}/sounds/${call}.wav`
    const argv = player(file)
    void $.process.run(argv, { timeoutMs: 15_000 })
      .then(r => {
        if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `${argv[0]} exited ${r.exitCode}`)
      })
      .catch(err => (fail(err), speak()))
    return
  }
  if (!soundDir) {
    return void $.audio.play({ asset: `sounds/${call}.wav` }).catch(err => (fail(err), speak()))
  }
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
    speak()
  }
}

export const register: Register = (on, options) => {
  const longTurnMs = Number(options.longTurnSeconds ?? 45) * 1000

  on('session.start', async ($, e, next) => {
    soundDir = await findSoundDir($, String(options.soundDir ?? ''))
    player = await findPlayer($)
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
    const source = !player
      ? 'your system voice (no audio player found)'
      : soundDir
        ? `wavs from ${soundDir}`
        : 'the bundled soundalikes (no CS 1.6 radio folder found, set soundDir in /config)'
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
