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
    { value: 'mp4', label: 'MP4', note: 'おすすめ' },
    { value: 'webm', label: 'WebM' },
    { value: 'mov', label: 'MOV' },
    { value: 'mkv', label: 'MKV' },
    { value: 'mp3', label: 'MP3', note: '音声のみ' },
    { value: 'm4a', label: 'M4A', note: '音声のみ' },
    { value: 'wav', label: 'WAV', note: '音声のみ' },
    { value: 'ogg', label: 'OGG', note: '音声のみ' },
    { value: 'flac', label: 'FLAC', note: '音声のみ' },
    { value: 'gif', label: 'GIF', note: '音声なし' },
  ],
  audio: [
    { value: 'mp3', label: 'MP3', note: 'おすすめ' },
    { value: 'm4a', label: 'M4A' },
    { value: 'wav', label: 'WAV' },
    { value: 'ogg', label: 'OGG' },
    { value: 'flac', label: 'FLAC' },
  ],
  image: [
    { value: 'jpg', label: 'JPG', note: '写真向け' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP', note: '軽量' },
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
    ffmpeg.on('progress', ({ progress }) => {
      this.onProgress?.(clamp(progress, 0, 1))
    })
    ffmpeg.on('log', ({ message }) => this.onLog?.(message))
    return ffmpeg
  }

  async load(onStatus) {
    if (this.loaded && this.ffmpeg) return
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = (async () => {
      onStatus?.('FFmpegを読み込み中…')
      this.ffmpeg = this.createFFmpeg()
      const threaded = globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
      const baseURL = threaded ? CORE_MT_URL : CORE_ST_URL
      const config = {
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      }
      if (threaded) {
        config.workerURL = await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript')
      }
      await this.ffmpeg.load(config)
      this.loaded = true
      onStatus?.(threaded ? 'マルチスレッド版 FFmpeg 準備完了' : 'FFmpeg 準備完了')
    })().finally(() => {
      this.loadPromise = null
    })

    return this.loadPromise
  }

  async inspect(file, onStatus) {
    await this.load(onStatus)
    const inputName = `input_${Date.now()}.${extOf(file.name)}`
    const probeName = `probe_${Date.now()}.json`
    onStatus?.('ファイルを解析中…')
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    const code = await this.ffmpeg.ffprobe([
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputName,
      '-o', probeName,
    ])
    if (code !== 0) throw new Error('ffprobeでファイルを解析できませんでした。')

    const data = await this.ffmpeg.readFile(probeName)
    const probe = JSON.parse(textDecoder.decode(data))
    await this.tryDelete(probeName)

    const streams = probe.streams || []
    const videoStream = streams.find((s) => s.codec_type === 'video')
    const audioStream = streams.find((s) => s.codec_type === 'audio')
    const isStillImage = Boolean(videoStream) && !audioStream && (
      file.type.startsWith('image/') || Number(probe.format?.duration || 0) <= 0.1
    )
    const kind = isStillImage ? 'image' : videoStream ? 'video' : audioStream ? 'audio' : 'unknown'
    const duration = Number(probe.format?.duration || videoStream?.duration || audioStream?.duration || 0)

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

  async convert({ file, inspection, outputFormat, resolution = 'original', quality = 'balanced', onStatus }) {
    await this.load(onStatus)
    const outputName = `${safeBase(file.name)}_converted.${outputFormat}`
    await this.tryDelete(outputName)
    const args = ['-i', inspection.inputName]

    if (['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(outputFormat)) {
      args.push('-vn')
      if (outputFormat === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', quality === 'small' ? '128k' : '192k')
      if (outputFormat === 'm4a') args.push('-c:a', 'aac', '-b:a', quality === 'small' ? '128k' : '192k')
      if (outputFormat === 'wav') args.push('-c:a', 'pcm_s16le')
      if (outputFormat === 'ogg') args.push('-c:a', 'libvorbis', '-q:a', quality === 'small' ? '3' : '5')
      if (outputFormat === 'flac') args.push('-c:a', 'flac')
    } else if (['jpg', 'png', 'webp'].includes(outputFormat)) {
      args.push('-frames:v', '1')
      const scale = scaleFilter(resolution)
      if (scale) args.push('-vf', scale)
      if (outputFormat === 'jpg') args.push('-q:v', quality === 'small' ? '6' : '2')
      if (outputFormat === 'webp') args.push('-quality', quality === 'small' ? '72' : '88')
    } else if (outputFormat === 'gif') {
      const filters = ['fps=12']
      const scale = scaleFilter(resolution === 'original' ? '720' : resolution)
      if (scale) filters.push(scale)
      args.push('-an', '-vf', filters.join(','))
    } else if (outputFormat === 'webm') {
      const scale = scaleFilter(resolution)
      if (scale) args.push('-vf', scale)
      args.push('-c:v', 'libvpx-vp9', '-crf', quality === 'small' ? '38' : quality === 'high' ? '25' : '31', '-b:v', '0')
      if (inspection.hasAudio) args.push('-c:a', 'libopus', '-b:a', '128k')
    } else {
      const scale = scaleFilter(resolution)
      if (scale) args.push('-vf', scale)
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', quality === 'small' ? '30' : quality === 'high' ? '20' : '24', '-pix_fmt', 'yuv420p')
      if (inspection.hasAudio) args.push('-c:a', 'aac', '-b:a', '160k')
      if (outputFormat === 'mp4' || outputFormat === 'mov') args.push('-movflags', '+faststart')
    }

    args.push(outputName)
    onStatus?.('変換中…')
    await this.execWithFallback(args, outputName)
    return this.readResult(outputName, outputFormat)
  }

  async compress({ file, inspection, targetMB, resolution = 'auto', onStatus }) {
    await this.load(onStatus)
    if (!inspection.duration || inspection.kind === 'image') {
      throw new Error('目標容量圧縮は動画・音声ファイルに対応しています。')
    }

    const sourceMB = file.size / 1024 / 1024
    if (sourceMB <= targetMB) {
      return {
        blob: file,
        filename: file.name,
        size: file.size,
        format: extOf(file.name),
        passthrough: true,
      }
    }

    const outputFormat = inspection.kind === 'audio' ? 'm4a' : 'mp4'
    const outputName = `${safeBase(file.name)}_${formatTarget(targetMB)}.${outputFormat}`
    const targetBytes = Math.floor(targetMB * 1024 * 1024)
    await this.tryDelete(outputName)

    const usableBits = targetBytes * 8 * 0.94
    const initialBudgetKbps = Math.max(12, Math.floor(usableBits / inspection.duration / 1000))

    const buildArgs = (totalKbps) => {
      const args = ['-i', inspection.inputName]

      if (inspection.kind === 'audio') {
        const audioKbps = clamp(Math.floor(totalKbps - 4), 16, 320)
        args.push('-vn', '-c:a', 'aac', '-b:a', `${audioKbps}k`)
      } else {
        let audioKbps = 0
        if (inspection.hasAudio && totalKbps >= 90) {
          audioKbps = totalKbps < 180
            ? 24
            : clamp(Math.round(totalKbps * 0.12), 32, 160)
        }
        const videoKbps = Math.max(12, totalKbps - audioKbps - 6)
        const chosenResolution = resolution === 'auto' ? autoResolution(videoKbps, inspection.height) : resolution
        const scale = scaleFilter(chosenResolution)
        if (scale) args.push('-vf', scale)
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

    onStatus?.(`${targetMB}MB以内を目標に圧縮中…`)
    await this.execWithFallback(buildArgs(initialBudgetKbps), outputName)
    let data = await this.ffmpeg.readFile(outputName)

    if (data.byteLength > targetBytes) {
      const correction = clamp((targetBytes * 0.97) / data.byteLength, 0.35, 0.96)
      const correctedBudget = Math.max(12, Math.floor(initialBudgetKbps * correction))
      await this.tryDelete(outputName)
      this.onProgress?.(0)
      onStatus?.('目標容量に合わせて微調整中…')
      await this.execWithFallback(buildArgs(correctedBudget), outputName)
      data = await this.ffmpeg.readFile(outputName)
    }

    const copy = new Uint8Array(data)
    const blob = new Blob([copy], { type: mimeFor(outputFormat) })
    await this.tryDelete(outputName)
    return {
      blob,
      filename: outputName,
      size: copy.byteLength,
      format: outputFormat,
      targetMB,
      withinTarget: copy.byteLength <= targetBytes,
    }
  }

  async execWithFallback(args, outputName) {
    this.onProgress?.(0)
    let code = await this.ffmpeg.exec(args)
    if (code === 0) return

    if (args.includes('libx264')) {
      await this.tryDelete(outputName)
      const fallback = args.map((arg) => arg === 'libx264' ? 'mpeg4' : arg)
      const cleaned = []
      for (let i = 0; i < fallback.length; i += 1) {
        if (['-preset', '-crf', '-maxrate', '-bufsize'].includes(fallback[i])) {
          i += 1
          continue
        }
        cleaned.push(fallback[i])
      }
      code = await this.ffmpeg.exec(cleaned)
    }
    if (code !== 0) throw new Error('FFmpegの処理に失敗しました。この形式またはコーデックに対応していない可能性があります。')
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
    try { await this.ffmpeg.deleteFile(name) } catch { /* file may not exist */ }
  }

  cancel() {
    if (this.ffmpeg) this.ffmpeg.terminate()
    this.ffmpeg = null
    this.loaded = false
    this.loadPromise = null
  }
}

function scaleFilter(resolution) {
  if (!resolution || resolution === 'original' || resolution === 'auto') return null
  const height = Number(resolution)
  if (!Number.isFinite(height) || height <= 0) return null
  return `scale=-2:min(${height}\\,ih)`
}

function autoResolution(videoKbps, sourceHeight) {
  let cap = 1080
  if (videoKbps < 100) cap = 240
  else if (videoKbps < 220) cap = 360
  else if (videoKbps < 450) cap = 480
  else if (videoKbps < 950) cap = 720
  if (sourceHeight && sourceHeight < cap) return 'original'
  return String(cap)
}

function formatTarget(targetMB) {
  return `${String(targetMB).replace('.', '_')}MB`
}

function mimeFor(format) {
  return {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    gif: 'image/gif', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  }[format] || 'application/octet-stream'
}
