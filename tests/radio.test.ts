import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// the test runtime has timers; the hooks lib types don't declare them
declare function setTimeout(fn: () => void, ms: number): unknown

type Platform = { os: 'Darwin' | 'Linux' | 'Windows'; players?: string[]; failingPlayer?: string }

function setup(on: On, hasWavs: boolean, platform: Platform = { os: 'Darwin' }, assetsPlay = true) {
  const played: string[] = []
  const spoken: string[] = []
  const ran: (readonly string[])[] = []
  const store = new Map<string, unknown>()
  const env: Record<string, string> = { HOME: '/home/me' }
  if (platform.os === 'Windows') env.OS = 'Windows_NT'
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('env.get', (_$, e) => ({ value: env[e.name] }))
  on('fs.exists', () => ({ value: hasWavs }))
  on('fs.read', (_$, e) => ({ value: { base64: btoa(e.path) } }))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => (store.set(e.key, e.value), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('process.run', (_$, e) => {
    const [bin, ...args] = e.argv
    const result = (exitCode: number, stdout = '') => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })
    if (bin === 'uname') {
      if (platform.os === 'Windows') throw new Error('not found')
      return result(0, `${platform.os}\n`)
    }
    if (bin === 'sh') {
      const wanted = (args[1] ?? '').replace('command -v ', '')
      return result(platform.players?.includes(wanted) ? 0 : 1)
    }
    ran.push(e.argv)
    return result(bin === platform.failingPlayer ? 1 : 0)
  })
  on('audio.play', (_$, e) => {
    if (e.clip.asset !== undefined) {
      if (!assetsPlay) throw new Error('no player')
      played.push(e.clip.asset)
    }
    if (e.clip.base64) played.push(atob(e.clip.base64))
    return { value: undefined }
  })
  on('audio.speak', (_$, e) => (spoken.push(e.text), { value: { via: 'system' as const } }))
  return { played, spoken, ran }
}

const start = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const radio = (args: string) => ({
  command: 'radio',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
})
// lets a clip's fire-and-forget playback (and any fallback) finish
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))

test('plays wavs from the configured folder and /radio toggles them', { options: { soundDir: '~/cs/radio' } }, async ($, on) => {
  const { played } = setup(on, true)
  await $.session.start(start)
  expect(played).toContain('/home/me/cs/radio/locknload.wav')

  expect((await $.command.run(radio('off'))).text).toBe('Radio off.')
  played.length = 0
  await $.command.run(radio('test'))
  expect(played).toHaveLength(0)

  expect((await $.command.run(radio(''))).text).toBe('Radio on.')
  expect(played).toContain('/home/me/cs/radio/locknload.wav')
})

test('plays the bundled soundalikes when no CS install is found', async ($, on) => {
  const { played, spoken } = setup(on, false)
  await $.session.start(start)
  expect(played).toEqual(['sounds/locknload.wav'])
  expect(spoken).toHaveLength(0)
})

test('speaks the calls when the bundled clips cannot play', async ($, on) => {
  const { played, spoken } = setup(on, false, { os: 'Darwin' }, false)
  await $.session.start(start)
  await settle()
  expect(played).toHaveLength(0)
  expect(spoken).toContain('Locked and loaded')
})

test('plays clips on Linux with the first player it finds', { options: { soundDir: '~/cs/radio' } }, async ($, on) => {
  const { played, ran } = setup(on, true, { os: 'Linux', players: ['pw-play', 'aplay'] })
  await $.session.start(start)
  await settle()
  expect(played).toHaveLength(0)
  expect(ran).toEqual([['pw-play', '/home/me/cs/radio/locknload.wav']])
})

test('plays the bundled soundalikes on Linux from the plugin folder', async ($, on) => {
  const { ran } = setup(on, false, { os: 'Linux', players: ['aplay'] })
  await $.session.start(start)
  await settle()
  expect(ran).toHaveLength(1)
  const [bin, file] = ran[0] ?? []
  expect(bin).toBe('aplay')
  expect(file?.endsWith('/sounds/locknload.wav')).toBe(true)
})

test('speaks on Linux when the player fails', async ($, on) => {
  const { spoken } = setup(on, false, { os: 'Linux', players: ['paplay'], failingPlayer: 'paplay' })
  await $.session.start(start)
  await settle()
  expect(spoken).toContain('Locked and loaded')
})

test('speaks on Linux when there is no audio player', async ($, on) => {
  const { spoken, ran } = setup(on, false, { os: 'Linux', players: [] })
  await $.session.start(start)
  expect(ran).toHaveLength(0)
  expect(spoken).toContain('Locked and loaded')
  expect((await $.command.run(radio('test'))).text).toContain('your system voice')
})

test('plays clips on Windows through PowerShell', { options: { soundDir: "C:/Games/it's cs/radio" } }, async ($, on) => {
  const { ran } = setup(on, true, { os: 'Windows' })
  await $.session.start(start)
  await settle()
  expect(ran).toHaveLength(1)
  expect(ran[0]).toEqual([
    'powershell', '-NoProfile', '-NonInteractive', '-Command',
    "(New-Object Media.SoundPlayer 'C:/Games/it''s cs/radio/locknload.wav').PlaySync()",
  ])
})
