import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { zipSync } from 'fflate'
import { buildConvertArguments, buildOutputFormatGroups, FALLBACK_FORMAT_GROUPS } from './formatCatalog'

const CORE_VERSION = '0.12.10'
const CORE_ST_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

const textDecoder = new TextDecoder()
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const safeBase = (name) => (name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'media').slice(0, 80)
const extOf = (name) => name.includes('.') ? name.split('.').pop().toLowerCase() : 'bin'

export class MediaEngine {
  constructor() {
    this.ffmpeg = null
    this.loaded = false
    this.loadPromise = null
    this.onProgress = null
    this.onLog = null
    this.logCapture = null
    this.formatGroupsCache = null
  }

  createFFmpeg() {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => this.onProgress?.(clamp(progress, 0, 1)))
    ffmpeg.on('log', ({ message }) => {
      this.logCapture?.push(message)
      this.onLog?.(message)
    })
    return ffmpeg
  }

  async load(onStatus) {
    if (this.loaded && this.ffmpeg) return
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = (async () => {
      onStatus?.('Preparing FFmpeg...')
      this.ffmpeg = this.createFFmpeg()
      const config = {
        coreURL: await toBlobURL(`${CORE_ST_URL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${CORE_ST_URL}/ffmpeg-core.wasm`, 'application/wasm'),
      }
      await this.ffmpeg.load(config)
      this.loaded = true
      onStatus?.('FFmpeg ready (single-threaded).')
    })().finally(() => {
      this.loadPromise = null
    })

    return this.loadPromise
  }

  async listOutputFormats(onStatus) {
    if (this.formatGroupsCache) return this.formatGroupsCache
    await this.load(onStatus)
    onStatus?.('Reading supported output formats...')

    try {
      const muxers = await this.captureCommand(['-hide_banner', '-muxers'])
      const encoders = await this.captureCommand(['-hide_banner', '-encoders'])
      const devices = await this.captureCommand(['-hide_banner', '-devices'])
      this.formatGroupsCache = buildOutputFormatGroups(muxers, encoders, devices)
    } catch {
      this.formatGroupsCache = FALLBACK_FORMAT_GROUPS
    }

    return this.formatGroupsCache
  }

  async captureCommand(args) {
    const previousCapture = this.logCapture
    const capture = []
    this.logCapture = capture
    try {
      const code = await this.ffmpeg.exec(args)
      if (code !== 0) return ''
      return capture.join('\n')
    } finally {
      this.logCapture = previousCapture
    }
  }

  async inspect(file, onStatus) {
    await this.load(onStatus)
    const inputName = `input_${Date.now()}.${extOf(file.name)}`
    const probeName = `probe_${Date.now()}.json`
    onStatus?.('Reading media information...')
    await this.ffmpeg.writeFile(inputName, await fetchFile(file))

    this.logCapture = []
    let code = -1
    let probe

    try {
      code = await this.ffmpeg.ffprobe([
        '-v', 'error',
        '-show_error',
        '-show_entries', 'format=duration,bit_rate:stream=codec_type,codec_name,width,height,duration',
        '-of', 'json',
        inputName,
        '-o', probeName,
      ])

      const data = await this.ffmpeg.readFile(probeName)
      const raw = textDecoder.decode(data).trim()
      if (!raw) throw new Error('ffprobe returned an empty result.')

      probe = JSON.parse(raw)
      if (probe.error) {
        throw new Error(probe.error.string || `ffprobe failed with code ${probe.error.code ?? code}.`)
      }
      if (!probe.format && !(probe.streams?.length)) {
        throw new Error(`ffprobe returned no media information (exit ${code}).`)
      }
    } catch (error) {
      const detail = (this.logCapture || []).filter(Boolean).slice(-12).join('\n')
      const message = error?.message || `ffprobe failed with exit code ${code}.`
      throw new Error(detail ? `${message}\n\nffprobe:\n${detail}` : message)
    } finally {
      this.logCapture = null
      await this.tryDelete(probeName)
    }

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
      hasVideo: Boolean(videoStream),
      hasAudio: Boolean(audioStream),
      bitrateKbps: Math.round(Number(probe.format?.bit_rate || 0) / 1000) || null,
    }
  }

  async compressQuality({ file, inspection, quality = 'medium', scale, onStatus }) {
    await this.load(onStatus)
    if (inspection.kind === 'image') {
      return this.compressImageQuality({ file, inspection, quality, scale, onStatus })
    }

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

  async compressImageQuality({ file, inspection, quality, scale, onStatus }) {
    const outputName = `${safeBase(file.name)}_compressed.webp`
    const qualityValue = { high: 90, medium: 76, low: 56 }[quality] || 76
    await this.tryDelete(outputName)

    const args = ['-i', inspection.inputName]
    const filter = scaleFilter(scale)
    if (filter) args.push('-vf', filter)
    args.push('-frames:v', '1', '-an', '-c:v', 'libwebp', '-quality', String(qualityValue), outputName)

    onStatus?.(`Compressing image... ${quality[0].toUpperCase()}${quality.slice(1)} quality`)
    await this.execWithFallback(args, outputName)
    return this.readResult(outputName, 'webp')
  }

  async compress({ file, inspection, targetMB, scale, onStatus }) {
    await this.load(onStatus)
    if (inspection.kind === 'image') {
      return this.compressImageToTarget({ file, inspection, targetMB, scale, onStatus })
    }
    if (!inspection.duration) {
      throw new Error('Target-size compression requires readable media duration.')
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

  async compressImageToTarget({ file, inspection, targetMB, scale, onStatus }) {
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

    const targetBytes = Math.floor(targetMB * 1024 * 1024)
    const outputName = `${safeBase(file.name)}_${formatTarget(targetMB)}.webp`
    let quality = 84
    let extraScale = 1
    let data = null

    for (let pass = 0; pass < 7; pass += 1) {
      await this.tryDelete(outputName)
      const filters = []
      const requestedScale = scaleFilter(scale)
      if (requestedScale) filters.push(requestedScale)
      if (extraScale < 0.999) {
        filters.push(`scale=trunc(iw*${extraScale.toFixed(4)}/2)*2:trunc(ih*${extraScale.toFixed(4)}/2)*2`)
      }

      const args = ['-i', inspection.inputName]
      if (filters.length) args.push('-vf', filters.join(','))
      args.push('-frames:v', '1', '-an', '-c:v', 'libwebp', '-quality', String(quality), outputName)
      onStatus?.(`Compressing image... pass ${pass + 1}`)
      await this.execWithFallback(args, outputName)
      data = await this.ffmpeg.readFile(outputName)
      if (data.byteLength <= targetBytes) break

      const ratio = targetBytes / data.byteLength
      if (quality > 34) {
        quality = Math.max(26, Math.round(quality * clamp(ratio, 0.58, 0.86)))
      } else {
        extraScale *= clamp(Math.sqrt(ratio) * 0.96, 0.35, 0.88)
      }
    }

    const copy = new Uint8Array(data || new Uint8Array())
    const blob = new Blob([copy], { type: 'image/webp' })
    await this.tryDelete(outputName)
    return {
      blob,
      filename: outputName,
      size: copy.byteLength,
      format: 'webp',
      targetMB,
      withinTarget: copy.byteLength <= targetBytes,
    }
  }

  async convert({ file, inspection, outputSpec, onStatus }) {
    await this.load(onStatus)
    if (!outputSpec) throw new Error('Choose an output format.')

    const outputDir = `convert_${Date.now()}`
    const baseName = `${safeBase(file.name)}_converted.${outputSpec.extension}`
    const outputPath = `${outputDir}/${baseName}`
    await this.ffmpeg.createDir(outputDir)

    try {
      const args = ['-i', inspection.inputName, ...buildConvertArguments(outputSpec, inspection)]
      if (outputSpec.muxer) args.push('-f', outputSpec.muxer)
      args.push(outputPath)
      onStatus?.(`Converting to ${outputSpec.label}...`)
      await this.execWithFallback(args, outputPath)
      return await this.readOutputSet(outputDir, baseName, outputSpec.extension)
    } catch (error) {
      await this.cleanupDirectory(outputDir)
      throw error
    }
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
    } else if (args.includes('libwebp')) {
      await this.tryDelete(outputName)
      code = await this.ffmpeg.exec(args.map((arg) => arg === 'libwebp' ? 'webp' : arg))
    }

    if (code !== 0) {
      throw new Error('FFmpeg processing failed. This codec, muxer, or format may need additional options in this build.')
    }
  }

  async readResult(outputName, format) {
    const data = await this.ffmpeg.readFile(outputName)
    const copy = new Uint8Array(data)
    const blob = new Blob([copy], { type: mimeFor(format) })
    await this.tryDelete(outputName)
    return { blob, filename: outputName, size: copy.byteLength, format }
  }

  async readOutputSet(directory, mainName, format) {
    const files = await this.collectFiles(directory)
    if (!files.length) throw new Error('FFmpeg finished without creating an output file.')

    if (files.length === 1) {
      const only = files[0]
      const copy = new Uint8Array(only.data)
      const blob = new Blob([copy], { type: mimeFor(format) })
      await this.cleanupDirectory(directory)
      return { blob, filename: mainName, size: copy.byteLength, format }
    }

    const archive = {}
    let totalSize = 0
    for (const file of files) {
      archive[file.relativePath] = new Uint8Array(file.data)
      totalSize += file.data.byteLength
    }
    const zipped = zipSync(archive, { level: 0 })
    await this.cleanupDirectory(directory)
    return {
      blob: new Blob([zipped], { type: 'application/zip' }),
      filename: `${mainName.replace(/\.[^.]+$/, '')}_bundle.zip`,
      size: zipped.byteLength,
      format: 'zip',
      bundledFiles: files.length,
      uncompressedSize: totalSize,
    }
  }

  async collectFiles(directory, relative = '') {
    const path = relative ? `${directory}/${relative}` : directory
    const entries = await this.ffmpeg.listDir(path)
    const files = []
    for (const entry of entries) {
      if (!entry?.name || entry.name === '.' || entry.name === '..') continue
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name
      const childPath = `${directory}/${childRelative}`
      if (entry.isDir || entry.isFolder) files.push(...await this.collectFiles(directory, childRelative))
      else files.push({ relativePath: childRelative, data: await this.ffmpeg.readFile(childPath) })
    }
    return files
  }

  async cleanupDirectory(directory) {
    if (!this.ffmpeg || !directory) return
    try {
      await this.deleteDirectoryRecursive(directory)
    } catch {
      // Best-effort cleanup after conversion failures.
    }
  }

  async deleteDirectoryRecursive(path) {
    const entries = await this.ffmpeg.listDir(path)
    for (const entry of entries) {
      if (!entry?.name || entry.name === '.' || entry.name === '..') continue
      const child = `${path}/${entry.name}`
      if (entry.isDir || entry.isFolder) await this.deleteDirectoryRecursive(child)
      else await this.tryDelete(child)
    }
    await this.ffmpeg.deleteDir(path)
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
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', flv: 'video/x-flv', '3gp': 'video/3gpp', '3g2': 'video/3gpp2',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg',
    flac: 'audio/flac', aiff: 'audio/aiff', ac3: 'audio/ac3', eac3: 'audio/eac3',
    gif: 'image/gif', apng: 'image/apng', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    avif: 'image/avif', bmp: 'image/bmp', tiff: 'image/tiff', tif: 'image/tiff', zip: 'application/zip',
    m3u8: 'application/vnd.apple.mpegurl', mpd: 'application/dash+xml',
  }[format] || 'application/octet-stream'
}
