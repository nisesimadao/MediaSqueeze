import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildConvertArguments,
  buildOutputFormatGroups,
  flattenFormats,
} from './formatCatalog.js'
import {
  assessFormatCompatibility,
  buildSmartConvertArguments,
  resolveFormatFromMuxerHelp,
} from './formatCompatibility.js'

const root = join(tmpdir(), `mediasqueeze-matrix-${process.pid}`)
mkdirSync(root, { recursive: true })

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stderr || result.stdout}`)
  }
  return result.stdout + result.stderr
}

function ffprobe(path) {
  const json = run('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=format_name,duration:stream=codec_type,codec_name,width,height',
    '-of', 'json', path,
  ])
  const probe = JSON.parse(json)
  assert.ok(probe.format || probe.streams?.length, `ffprobe returned no media info for ${path}`)
  return probe
}

function stripDecoratedLabel(label) {
  return String(label || '').replace(/^[★✓△⚙×]\s*/, '')
}

try {
  const videoInput = join(root, 'input.mp4')
  const audioInput = join(root, 'input.wav')
  const imageInput = join(root, 'input.png')

  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=15:duration=1',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoInput,
  ])
  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-c:a', 'pcm_s16le', audioInput,
  ])
  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:s=96x64:d=0.04', '-frames:v', '1', imageInput,
  ])

  const muxers = run('ffmpeg', ['-hide_banner', '-muxers'])
  const encoders = run('ffmpeg', ['-hide_banner', '-encoders'])
  const devices = run('ffmpeg', ['-hide_banner', '-devices'])
  const groups = buildOutputFormatGroups(muxers, encoders, devices)
  const formats = flattenFormats(groups)
  const byId = (id) => formats.find((format) => format.id === id)

  const cases = [
    { input: videoInput, inspection: { kind: 'video', hasVideo: true, hasAudio: true }, id: 'mp4' },
    { input: videoInput, inspection: { kind: 'video', hasVideo: true, hasAudio: true }, id: 'mkv' },
    { input: videoInput, inspection: { kind: 'video', hasVideo: true, hasAudio: true }, id: 'webm' },
    { input: videoInput, inspection: { kind: 'video', hasVideo: true, hasAudio: true }, id: 'mp3' },
    { input: audioInput, inspection: { kind: 'audio', hasVideo: false, hasAudio: true }, id: 'mp3' },
    { input: audioInput, inspection: { kind: 'audio', hasVideo: false, hasAudio: true }, id: 'm4a' },
    { input: audioInput, inspection: { kind: 'audio', hasVideo: false, hasAudio: true }, id: 'flac' },
    { input: imageInput, inspection: { kind: 'image', hasVideo: true, hasAudio: false }, id: 'jpg' },
    { input: imageInput, inspection: { kind: 'image', hasVideo: true, hasAudio: false }, id: 'png' },
    { input: imageInput, inspection: { kind: 'image', hasVideo: true, hasAudio: false }, id: 'webp' },
  ]

  for (const test of cases) {
    const spec = byId(test.id)
    assert.ok(spec, `Format ${test.id} is missing from runtime catalog`)
    const compatibility = assessFormatCompatibility(spec, test.inspection)
    assert.equal(compatibility.canRun, true, `${test.id}: ${compatibility.message}`)

    const output = join(root, `case-${test.id}-${cases.indexOf(test)}.${spec.extension}`)
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error', '-i', test.input,
      ...buildConvertArguments(spec, test.inspection),
      '-f', spec.muxer,
      output,
    ]
    run('ffmpeg', args)
    const probe = ffprobe(output)
    assert.ok(probe.streams?.length, `${test.id} output has no streams`)
    console.log(`PASS ${test.inspection.kind} -> ${stripDecoratedLabel(spec.label)} (${spec.muxer})`)
  }

  // Exercise the lazy smart path on a format whose preset is intentionally auto.
  const nut = byId('nut')
  assert.ok(nut, 'NUT format missing from runtime catalog')
  const nutHelp = run('ffmpeg', ['-hide_banner', '-h', `muxer=${nut.muxer}`])
  const resolvedNut = resolveFormatFromMuxerHelp(
    nut,
    nutHelp,
    encoders,
    { kind: 'video', hasVideo: true, hasAudio: true },
  )
  assert.equal(resolvedNut.resolved, true)
  assert.ok(resolvedNut.videoEncoder || resolvedNut.audioEncoder, 'NUT did not resolve any usable encoder')
  const nutCompatibility = assessFormatCompatibility(resolvedNut, { kind: 'video', hasVideo: true, hasAudio: true })
  assert.equal(nutCompatibility.canRun, true, nutCompatibility.message)

  const nutOutput = join(root, 'smart-auto.nut')
  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', videoInput,
    ...buildSmartConvertArguments(resolvedNut, { kind: 'video', hasVideo: true, hasAudio: true }, buildConvertArguments),
    '-f', resolvedNut.muxer,
    nutOutput,
  ])
  ffprobe(nutOutput)
  console.log(`PASS smart auto preset -> NUT (${resolvedNut.videoEncoder || 'no video'} + ${resolvedNut.audioEncoder || 'no audio'})`)

  console.log(`Real FFmpeg matrix passed: ${cases.length + 1} conversions.`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
