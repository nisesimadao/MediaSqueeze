import { MediaEngine as BaseMediaEngine } from './mediaEngine'
import { buildConvertArguments, buildOutputFormatGroups, FALLBACK_FORMAT_GROUPS } from './formatCatalog'
import {
  assessFormatCompatibility,
  buildSmartConvertArguments,
  decorateFormatGroups,
  resolveFormatFromMuxerHelp,
} from './formatCompatibility'

const safeBase = (name) => (name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'media').slice(0, 80)

export class MediaEngine extends BaseMediaEngine {
  constructor() {
    super()
    this.smartEncoderText = ''
    this.smartMuxerHelp = new Map()
    this.lastInspection = null
  }

  async inspect(file, onStatus) {
    const inspection = await super.inspect(file, onStatus)
    this.lastInspection = inspection
    return inspection
  }

  async listOutputFormats(onStatus) {
    if (!this.formatGroupsCache) {
      await this.load(onStatus)
      onStatus?.('Reading supported output formats...')

      try {
        const muxers = await this.captureCommand(['-hide_banner', '-muxers'])
        const encoders = await this.captureCommand(['-hide_banner', '-encoders'])
        const devices = await this.captureCommand(['-hide_banner', '-devices'])
        this.smartEncoderText = encoders
        this.formatGroupsCache = buildOutputFormatGroups(muxers, encoders, devices)
      } catch {
        this.formatGroupsCache = FALLBACK_FORMAT_GROUPS
      }
    }

    return decorateFormatGroups(this.formatGroupsCache, this.lastInspection)
  }

  async checkOutputFormat(outputSpec, inspection, onStatus) {
    if (!outputSpec) {
      return {
        spec: outputSpec,
        compatibility: assessFormatCompatibility(outputSpec, inspection),
      }
    }

    await this.load(onStatus)
    let resolved = outputSpec

    if (outputSpec.preset === 'auto') {
      if (!this.smartEncoderText) {
        this.smartEncoderText = await this.captureCommand(['-hide_banner', '-encoders'])
      }

      let help = this.smartMuxerHelp.get(outputSpec.muxer)
      if (help === undefined) {
        onStatus?.(`Checking ${outputSpec.muxer} compatibility...`)
        help = await this.captureCommand(['-hide_banner', '-h', `muxer=${outputSpec.muxer}`])
        this.smartMuxerHelp.set(outputSpec.muxer, help)
      }
      resolved = resolveFormatFromMuxerHelp(outputSpec, help, this.smartEncoderText, inspection)
    }

    return {
      spec: resolved,
      compatibility: assessFormatCompatibility(resolved, inspection),
    }
  }

  async convert({ file, inspection, outputSpec, onStatus }) {
    await this.load(onStatus)
    if (!outputSpec) throw new Error('Choose an output format.')

    const checked = await this.checkOutputFormat(outputSpec, inspection, onStatus)
    if (!checked.compatibility.canRun) {
      throw new Error(`${checked.compatibility.label}: ${checked.compatibility.message}`)
    }

    const resolved = checked.spec
    const outputDir = `convert_${Date.now()}`
    const baseName = `${safeBase(file.name)}_converted.${resolved.extension}`
    const outputPath = `${outputDir}/${baseName}`
    await this.ffmpeg.createDir(outputDir)

    try {
      const conversionArgs = buildSmartConvertArguments(resolved, inspection, buildConvertArguments)
      const args = ['-i', inspection.inputName, ...conversionArgs]
      if (resolved.muxer) args.push('-f', resolved.muxer)
      args.push(outputPath)

      const codecNote = [resolved.videoEncoder, resolved.audioEncoder].filter(Boolean).join(' + ')
      const warning = checked.compatibility.level === 'stream-drop'
        ? ` (${checked.compatibility.message})`
        : ''
      onStatus?.(`Converting to ${resolved.label.replace(/^[★✓△⚙×]\s*/, '')}${codecNote ? ` — ${codecNote}` : ''}${warning}`)

      await this.execWithFallback(args, outputPath)
      return await this.readOutputSet(outputDir, baseName, resolved.extension)
    } catch (error) {
      await this.cleanupDirectory(outputDir)
      throw error
    }
  }
}
