import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function setup(on: On, hasWavs: boolean) {
  const played: string[] = []
  const spoken: string[] = []
  const store = new Map<string, unknown>()
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.exists', () => ({ value: hasWavs }))
  on('fs.read', (_$, e) => ({ value: { base64: btoa(e.path) } }))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => (store.set(e.key, e.value), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('audio.play', (_$, e) => {
    if ('base64' in e.clip && e.clip.base64) played.push(atob(e.clip.base64))
    return { value: undefined }
  })
  on('audio.speak', (_$, e) => (spoken.push(e.text), { value: { via: 'system' as const } }))
  return { played, spoken }
}

const start = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const
const radio = (args: string) => ({
  command: 'radio',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
})

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

test('speaks the calls when no CS install is found', async ($, on) => {
  const { played, spoken } = setup(on, false)
  await $.session.start(start)
  expect(played).toHaveLength(0)
  expect(spoken).toContain('Locked and loaded')
})
