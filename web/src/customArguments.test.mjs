import assert from 'node:assert/strict'
import {
  buildCustomArguments,
  defaultCustomExtension,
  normalizeCustomExtension,
  parseCustomArguments,
} from './customArguments.js'

assert.deepEqual(
  parseCustomArguments('-c:v libx264 -vf "scale=1280:-2,format=yuv420p" -metadata title=hello\\ world'),
  ['-c:v', 'libx264', '-vf', 'scale=1280:-2,format=yuv420p', '-metadata', 'title=hello world'],
)

assert.deepEqual(
  parseCustomArguments("ffmpeg -filter_complex '[0:v]fps=12[v]' -map '[v]'"),
  ['-filter_complex', '[0:v]fps=12[v]', '-map', '[v]'],
)

assert.deepEqual(
  buildCustomArguments('-c:v libx264 -crf 23', 'input.mov', 'out/output.mp4'),
  ['-i', 'input.mov', '-c:v', 'libx264', '-crf', '23', 'out/output.mp4'],
)

assert.deepEqual(
  buildCustomArguments('-ss 2 {input} -map 0:v:0 -an {output}', 'input.mov', 'out/output.mp4'),
  ['-ss', '2', '-i', 'input.mov', '-map', '0:v:0', '-an', 'out/output.mp4'],
)

assert.equal(normalizeCustomExtension('.MKV'), 'mkv')
assert.throws(() => normalizeCustomExtension('../mp4'), /Output extension/)
assert.throws(() => parseCustomArguments('-vf "scale=1280:-2'), /Unclosed double quote/)
assert.equal(defaultCustomExtension('video'), 'mp4')
assert.equal(defaultCustomExtension('audio'), 'm4a')
assert.equal(defaultCustomExtension('image'), 'webp')

console.log('Custom FFmpeg argument parsing tests passed.')
