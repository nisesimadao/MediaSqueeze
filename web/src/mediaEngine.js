import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const CORE_VERSION = '0.12.10'
const CORE_MT_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`
const CORE_ST_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

const textDecoder = new TextDecoder()
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const safeBase = (name) => (name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'media').slice(0, 80)
const extOf = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : 'bin'

export const OUTPUTS = {
  video: [
    { value: 'mp4', label: 'MP4' },
    { value: 'mov', label: 'MOV' },
    { value: 'mkv', label: 'MKV' },
    { value: 'webm', label: 'WebM' },
    { value: 'mp3', label: 'MP3' },
    { value: 'm4a', label: 'M4A' },
    { value: 'wav', label: 'WAV' },
    { value: 'ogg', label: 'OGG' },
    { value: 'flac', label: 'FLAC' },
    { value: 'gif', label: 'GIF' },
  ],
  audio: [
    { value: 'mp3', label: 'MP3' },
    { value: 'm4a', label: 'M4A' },
    { value: 'wav', label: 'WAV' },
    { value: 'ogg', label: 'OGG' },
    { value: 'flac', label: 'FLAC' },
  ],
  image: [
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
  ],
}

export class MediaEngine {
  constructor() {
    this.ffmpeg = null
    this.loaded = false
    this.loadPromise = null
    this.onProgress = null
    this.onLog = null
  }

  createFFmpeg() {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => this.onProgress?.(clamp(progress, 0, 1)))
    ffmpeg.on('log', ({ message }) => this.onLog?.(message))
    return ffmpeg
  }

  async load(onStatus) {
    if (this.loaded && this.ffmpeg) return
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = (async () => {
      onStatus?.('Preparing FFmpeg...')
      this.ffmpeg = this.createFFmpeg()
      const threaded = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
      const baseURL = threaded ? CORE_MT_URL : CORE_ST_URL
      const config = {
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      }
      if (threaded) config.workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
      await this.ffmpeg.load(config)
      this.loaded = true
      onStatus?.(threaded ? 'FFmpeg ready (multi-threaded).' : 'FFmpeg ready.')
    })().finally(() => {
      this.loadPromise = null
    })

    return this.loadPromise
  }

  async inspect(file, onStatus) {
    await this.load(onStatus)
    const inputName = `input_${Date.now()}.${extOf(file.name)}`
    const probeName = `probe_${Date.now()}.json`
    onStatus?.('Reading media information...')
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    const code = await this.ffmpeg.ffprobe([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputName,
      '-o', probeName,
    ])
    if (code !== 0) throw new Error('ffprobe could not analyze this file.')

    const data = await this.ffmpeg.readFile(probeName)
    const probe = JSON.parse(textDecoder.decode(data))
    await this.tryDelete(probeName)

    const streams = probe.streams || []
    const videoStream = streams.find((stream) => stream.codec_type === 'video')
    const audioStream = streams.find((stream) => stream.codec_type === 'audio')
    const duration = Number(probe.format?.duration || videoStream?.duration || audioStream?.duration || 0)
    const isStillImage = Boolean(videoStream) && !audioStream && (
      file.type.startsWith('image/') || duration <= 0.1
    )
    const kind = isStillImage ? 'image' : videoStream ? 'video' : audioStream ? 'audio' : 'unknown'

    return {
      inputName,
      probe,
      kind,
      duration,
      width: Number(videoStream?.width || 0),
      height: Number(videoStream?.height || 0),
      videoCodec: videoStream?.codec_name || null,
      audioCodec: audioStream?.codec_name || null,
      hasAudio: Boolean(audioStream),
      bitrateKbps: Math.round(Number(probe.format?.bit_rate || 0) / 1000) || null,
    }
  }

  async compressQuality({ file, inspection, quality = 'medium', scale, onStatus }) {
    await this.load(onStatus)
    if (inspection.kind === 'image') throw new Error('Compress mode supports video and audio files.')

    const preset = {
      high: { video: 2000, audio: 192 },
      medium: { video: 1500, audio: 128 },
      low: { video: 1000, audio: 96 },
    }[quality] || { video: 1500, audio: 128 }

    const format = inspection.kind === 'audio' ? 'm4a' : 'mp4'
    const outputName = `${safeBase(file.name)}_compressed.${format}`
    await this.tryDelete(outputName)
    const args = ['-i', inspection.inputName]

    if (inspection.kind === 'audio') {
      args.push('-vn', '-c:a', 'aac', '-b:a', `${preset.audio}k`)
    } else {
      const filter = scaleFilter(scale)
      if (filter) args.push('-vf', filter)
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${preset.video}k`, '-pix_fmt', 'yuv420p')
      if (inspection.hasAudio) args.push('-c:a', 'aac', '-b:a', `${preset.audio}k`)
      else args.push('-an')
      args.push('-movflags', '+faststart')
    }

    args.push(outputName)
    onStatus?.(`Processing... ${quality[0].toUpperCase()}${quality.slice(1)} quality`)
    await this.execWithFallback(args, outputName)
    return this.readResult(outputName, format)
  }

  async compress({ file, inspection, targetMB, scale, onStatus }) {
    await this.load(onStatus)
    if (!inspection.duration || inspection.kind === 'image') {
      throw new Error('Target-size compression supports video and audio files with a readable duration.')
    }

    const sourceMB = file.size / 1024 / 1024
    if (sourceMB <= targetMB) {
      return {
        blob: file,
        filename: file.name,
        size: file.size,
        format: extOf(file.name),
        passthrough: true,
        targetMB,
        withinTarget: true,
      }
    }

    const format = inspection.kind === 'audio' ? 'm4a' : 'mp4'
    const outputName = `${safeBase(file.name)}_${formatTarget(targetMB)}.${format}`
    const targetBytes = Math.floor(targetMB * 1024 * 1024)
    const usableBits = targetBytes * 8 * 0.94
    const initialBudgetKbps = Math.max(12, Math.floor(usableBits / inspection.duration / 1000))
    await this.tryDelete(outputName)

    const buildArgs = (totalKbps) => {
      const args = ['-i', inspection.inputName]
      if (inspection.kind === 'audio') {
        const audioKbps = clamp(Math.floor(totalKbps - 4), 16, 320)
        args.push('-vn', '-c:a', 'aac', '-b:a', `${audioKbps}k`)
      } else {
        let audioKbps = 0
        if (inspection.hasAudio && totalKbps >= 90) {
          audioKbps = totalKbps < 180 ? 24 : clamp(Math.round(totalKbps * 0.12), 32, 160)
        }
        const videoKbps = Math.max(12, totalKbps - audioKbps - 6)
        const filter = scaleFilter(scale)
        if (filter) args.push('-vf', filter)
        args.push(
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-b:v', `${videoKbps}k`,
          '-maxrate', `${Math.max(videoKbps, Math.round(videoKbps * 1.05))}k`,
          '-bufsize', `${Math.max(48, videoKbps * 2)}k`,
          '-pix_fmt', 'yuv420p',
        )
        if (audioKbps > 0) args.push('-c:a', 'aac', '-b:a', `${audioKbps}k`)
        else args.push('-an')
        args.push('-movflags', '+faststart')
      }
      args.push(outputName)
      return args
    }

    onStatus?.(`Processing... target ${formatCompactNumber(targetMB)} MB`)
    await this.execWithFallback(buildArgs(initialBudgetKbps), outputName)
    let data = await this.ffmpeg.readFile(outputName)

    if (data.byteLength > targetBytes) {
      const correction = clamp((targetBytes * 0.97) / data.byteLength, 0.35, 0.96)
      const correctedBudget = Math.max(12, Math.floor(initialBudgetKbps * correction))
      await this.tryDelete(outputName)
      this.onProgress?.(0)
      onStatus?.('Fine-tuning to target size...')
      await this.execWithFallback(buildArgs(correctedBudget), outputName)
      data = await this.ffmpeg.readFile(outputName)
    }

    const copy = new Uint8Array(data)
    const blob = new Blob([copy], { type: mimeFor(format) })
    await this.tryDelete(outputName)
    return {
      blob,
      filename: outputName,
      size: copy.byteLength,
      format,
      targetMB,
      withinTarget: copy.byteLength <= targetBytes,
    }
  }

  async convert({ file, inspection, outputFormat, onStatus }) {
    await this.load(onStatus)
    const outputName = `${safeBase(file.name)}_converted.${outputFormat}`
    await this.tryDelete(outputName)
    const args = ['-i', inspection.inputName]

    if (['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(outputFormat)) {
      args.push('-vn')
      if (outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '192k')
      if (outputFormat === 'm4a') args.push('-c:a', 'aac', '-b:a', '192k')
      if (outputFormat === 'wav') args.push('-c:a', 'pcm_s16le')
      if (outputFormat === 'ogg') args.push('-c:a', 'libvorbis', '-q:a', '5')
      if (outputFormat === 'flac') args.push('-c:a', 'flac')
    } else if (['jpg', 'png', 'webp'].includes(outputFormat)) {
      args.push('-frames:v', '1')
      if (outputFormat === 'jpg') args.push('-q:v', '2')
      if (outputFormat === 'webp') args.push('-quality', '88')
    } else if (outputFormat === 'gif') {
      args.push('-an', '-vf', 'fps=12')
    } else if (outputFormat === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', '31', '-b:v', '0')
      if (inspection.hasAudio) args.push('-c:a', 'libopus', '-b:a', '128k')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p')
      if (inspection.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k')
      if (outputFormat === 'mp4' || outputFormat === 'mov') args.push('-movflags', '+faststart')
    }

    args.push(outputName)
    onStatus?.(`Converting to ${outputFormat.toUpperCase()}...`)
    await this.execWithFallback(args, outputName)
    return this.readResult(outputName, outputFormat)
  }

  async resize({ file, inspection, scale, onStatus }) {
    await this.load(onStatus)
    if (inspection.kind === 'audio') throw new Error('Resize is not available for audio files.')
    const filter = scaleFilter(scale)
    if (!filter) throw new Error('Choose Percent, Width, or Height for Resize mode.')

    const sourceExtension = normalizeImageExtension(extOf(file.name))
    const isImage = inspection.kind === 'image'
    const format = isImage && ['jpg', 'png', 'webp'].includes(sourceExtension) ? sourceExtension : 'mp4'
    const outputName = `${safeBase(file.name)}_resized.${format}`
    await this.tryDelete(outputName)
    const args = ['-i', inspection.inputName, '-vf', filter]

    if (isImage) {
      args.push('-frames:v', '1')
      if (format === 'jpg') args.push('-q:v', '2')
      if (format === 'webp') args.push('-quality', '88')
    } else {
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p')
      if (inspection.hasAudio) args.push('-c:a', 'aac', '-b:a', '128k')
      else args.push('-an')
      args.push('-movflags', '+faststart')
    }

    args.push(outputName)
    onStatus?.('Resizing...')
    await this.execWithFallback(args, outputName)
    return this.readResult(outputName, format)
  }

  async execWithFallback(args, outputName) {
    this.onProgress?.(0)
    let code = await this.ffmpeg.exec(args)
    if (code === 0) return

    if (args.includes('libx264')) {
      await this.tryDelete(outputName)
      const fallback = args.map((arg) => arg === 'libx264' ? 'mpeg4' : arg)
      const cleaned = []
      for (let index = 0; index < fallback.length; index += 1) {
        if (['-preset', '-crf', '-maxrate', '-bufsize'].includes(fallback[index])) {
          index += 1
          continue
        }
        cleaned.push(fallback[index])
      }
      code = await this.ffmpeg.exec(cleaned)
    }

    if (code !== 0) {
      throw new Error('FFmpeg processing failed. This codec or format may not be supported in the browser build.')
    }
  }

  async readResult(outputName, format) {
    const data = await this.ffmpeg.readFile(outputName)
    const copy = new Uint8Array(data)
    const blob = new Blob([copy], { type: mimeFor(format) })
    await this.tryDelete(outputName)
    return { blob, filename: outputName, size: copy.byteLength, format }
  }

  async cleanupInput(inspection) {
    if (inspection?.inputName) await this.tryDelete(inspection.inputName)
  }

  async tryDelete(name) {
    if (!this.ffmpeg || !name) return
    try {
      await this.ffmpeg.deleteFile(name)
    } catch {
      // The file may already be gone after terminate() or a failed run.
    }
  }

  cancel() {
    if (this.ffmpeg) this.ffmpeg.terminate()
    this.ffmpeg = null
    this.loaded = false
    this.loadPromise = null
  }
}

function scaleFilter(scale) {
  if (!scale || scale.mode === 'original') return null
  const value = Number(scale.value)
  if (!Number.isFinite(value) || value <= 0) return null

  if (scale.mode === 'percent') {
    const factor = value / 100
    return `scale=trunc(iw*${factor}/2)*2:trunc(ih*${factor}/2)*2`
  }
  if (scale.mode === 'width') return `scale=${Math.round(value)}:-2`
  if (scale.mode === 'height') return `scale=-2:${Math.round(value)}`
  return null
}

function formatTarget(targetMB) {
  return `${String(targetMB).replace('.', '_')}MB`
}

function formatCompactNumber(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1).replace(/\.0$/, '')
}

function normalizeImageExtension(extension) {
  return extension === 'jpeg' ? 'jpg' : extension
}

function mimeFor(format) {
  return {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[format] || 'application/octet-stream'
}
