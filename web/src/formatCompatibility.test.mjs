import assert from 'node:assert/strict'
import { FALLBACK_FORMAT_GROUPS, flattenFormats } from './formatCatalog.js'
import {
  assessFormatCompatibility,
  decorateFormatGroups,
  resolveFormatFromMuxerHelp,
} from './formatCompatibility.js'

const formats = flattenFormats(FALLBACK_FORMAT_GROUPS)
const byId = (id) => formats.find((format) => format.id === id)

const video = { kind: 'video', hasVideo: true, hasAudio: true }
const audio = { kind: 'audio', hasVideo: false, hasAudio: true }
const image = { kind: 'image', hasVideo: true, hasAudio: false }

assert.equal(assessFormatCompatibility(byId('mp4'), video).level, 'recommended')
assert.equal(assessFormatCompatibility(byId('mp3'), video).level, 'stream-drop')
assert.equal(assessFormatCompatibility(byId('mp3'), video).dropsVideo, true)
assert.equal(assessFormatCompatibility(byId('jpg'), audio).level, 'unsupported')
assert.equal(assessFormatCompatibility(byId('webp'), image).level, 'recommended')

const decorated = decorateFormatGroups(FALLBACK_FORMAT_GROUPS, video)
const decoratedMp4 = decorated.flatMap((group) => group.options).find((format) => format.id === 'mp4')
assert.match(decoratedMp4.label, /^★ /)

const genericMp4 = {
  id: 'muxer:testmp4',
  label: 'TEST MP4',
  category: 'Video',
  muxer: 'testmp4',
  extension: 'mp4',
  media: 'auto',
  preset: 'auto',
  description: 'test',
}
const help = `
Muxer testmp4 [test]:
    Default video codec: h264.
    Default audio codec: aac.
`
const encoders = `
 V..... libx264 H.264 / AVC
 A..... aac AAC
`
const resolved = resolveFormatFromMuxerHelp(genericMp4, help, encoders, video)
assert.equal(resolved.media, 'video')
assert.equal(resolved.supportsVideo, true)
assert.equal(resolved.supportsAudio, true)
assert.equal(resolved.videoEncoder, 'libx264')
assert.equal(resolved.audioEncoder, 'aac')
assert.equal(assessFormatCompatibility(resolved, video).canRun, true)

const rawH264 = resolveFormatFromMuxerHelp({
  id: 'muxer:h264',
  label: 'H264',
  category: 'Raw / Elementary Streams',
  muxer: 'h264',
  extension: 'h264',
  media: 'auto',
  preset: 'auto',
  description: 'raw H264',
}, '', encoders, video)
assert.equal(rawH264.supportsVideo, true)
assert.equal(rawH264.supportsAudio, false)
assert.equal(rawH264.videoEncoder, 'libx264')
assert.equal(assessFormatCompatibility(rawH264, video).level, 'stream-drop')

console.log('Smart format compatibility tests passed.')
