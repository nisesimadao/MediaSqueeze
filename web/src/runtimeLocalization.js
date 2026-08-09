import { getLocale, t } from './i18n.js'

const exactJapanese = new Map([
  ['Preparing FFmpeg...', () => t('status.preparing')],
  ['FFmpeg ready (single-threaded).', () => t('status.ready')],
  ['Reading supported output formats...', () => t('status.readingFormats')],
  ['Reading media information...', () => t('status.readingMedia')],
  ['Fine-tuning to target size...', () => t('status.fineTuning')],
  ['Resizing...', () => t('status.resizing')],
  ['Running custom FFmpeg arguments...', () => t('status.customRunning')],
  ['Target-size compression requires readable media duration.', () => t('error.durationRequired')],
  ['Choose an output format.', () => t('error.chooseOutput')],
  ['Choose Percent, Width, or Height for Resize mode.', () => t('error.chooseResizeSize')],
  ['Resize is not available for audio files.', () => t('error.resizeAudio')],
  ['FFmpeg processing failed. This codec, muxer, or format may need additional options in this build.', () => t('error.codecOptions')],
  ['FFmpeg finished without creating an output file.', () => t('error.noOutput')],
  ['Output extension must be 1–16 letters or numbers, for example mp4, mkv, webm, m4a, or png.', () => t('error.invalidExtension')],
  ['Select and analyze an input file first.', () => t('error.selectBeforeCustom')],
  ['No usable audio/video stream was detected.', () => t('compat.noStream')],
  ['This FFmpeg output is a control/data/special-purpose muxer and may require extra parameters.', () => t('compat.specialMuxer')],
  ['This output does not accept the detected media streams.', () => t('compat.rejectStreams')],
  ['FFmpeg supports this muxer, but MediaSqueeze will inspect its default codecs before conversion.', () => t('compat.inspectBeforeConvert')],
  ['Common, broadly compatible choice for this input.', () => t('compat.recommendedMessage')],
  ['Special-purpose FFmpeg output. Review the muxer description before using it.', () => t('compat.specialMessage')],
  ['The detected media streams can be converted to this output.', () => t('compat.convertible')],
])

const compatibilityLabelKeys = {
  recommended: 'compat.recommended',
  compatible: 'compat.compatible',
  'stream-drop': 'compat.streamDrop',
  special: 'compat.special',
  unsupported: 'compat.unsupported',
}

const compatibilityEnglishToLevel = {
  Recommended: 'recommended',
  Compatible: 'compatible',
  'Drops streams': 'stream-drop',
  Special: 'special',
  Unsupported: 'unsupported',
}

export function localizeCompatibility(compatibility) {
  if (!compatibility || getLocale() !== 'ja') return compatibility
  return {
    ...compatibility,
    label: t(compatibilityLabelKeys[compatibility.level] || compatibility.label),
    message: localizeRuntimeMessage(compatibility.message),
  }
}

export function localizeRuntimeMessage(message) {
  const source = String(message ?? '')
  if (!source || getLocale() !== 'ja') return source

  const exact = exactJapanese.get(source)
  if (exact) return exact()

  let match = source.match(/^Processing\.\.\. (High|Medium|Low) quality$/)
  if (match) return t('status.processingQuality', { quality: qualityName(match[1]) })

  match = source.match(/^Compressing image\.\.\. (High|Medium|Low) quality$/)
  if (match) return t('status.compressingImageQuality', { quality: qualityName(match[1]) })

  match = source.match(/^Processing\.\.\. target ([0-9.]+) MB$/)
  if (match) return t('status.processingTarget', { size: match[1] })

  match = source.match(/^Compressing image\.\.\. pass (\d+)$/)
  if (match) return t('status.compressingImagePass', { pass: match[1] })

  match = source.match(/^Converting to (.+?)(?:\.\.\.)?(?: \((.+)\))?$/)
  if (match) {
    const warning = match[2] ? `（${localizeRuntimeMessage(match[2])}）` : ''
    return `${t('status.converting', { format: match[1] })}${warning}`
  }

  match = source.match(/^Checking (.+) compatibility\.\.\.$/)
  if (match) return t('status.checkCompatibility', { muxer: match[1] })

  match = source.match(/^Running custom FFmpeg arguments\.\.\.\n([\s\S]+)$/)
  if (match) return `${t('status.customRunning')}\n${match[1]}`

  match = source.match(/^FFmpeg exited with code (-?\d+)\.([\s\S]*)$/)
  if (match) return `${t('error.ffmpegExit', { code: match[1] })}${match[2]}`

  match = source.match(/^Unclosed (double|single) quote in custom arguments\.$/)
  if (match) return t('error.unclosedQuote', { quote: t(match[1] === 'double' ? 'quote.double' : 'quote.single') })

  match = source.match(/^(Recommended|Compatible|Drops streams|Special|Unsupported): ([\s\S]+)$/)
  if (match) {
    const level = compatibilityEnglishToLevel[match[1]]
    return `${t(compatibilityLabelKeys[level])}: ${localizeRuntimeMessage(match[2])}`
  }

  match = source.match(/^This format requires (video\/image|audio|compatible media) input\.$/)
  if (match) {
    const key = match[1] === 'video/image'
      ? 'compat.required.videoImage'
      : match[1] === 'audio'
        ? 'compat.required.audio'
        : 'compat.required.media'
    return t('compat.requires', { type: t(key) })
  }

  const dropParts = source.replace(/\.$/, '').split('; ').filter(Boolean)
  if (dropParts.length && dropParts.every((part) => ['video will be removed', 'audio will be removed', 'only one frame will be kept'].includes(part))) {
    return dropParts.map((part) => ({
      'video will be removed': t('compat.dropVideo'),
      'audio will be removed': t('compat.dropAudio'),
      'only one frame will be kept': t('compat.keepOneFrame'),
    })[part]).join('・')
  }

  match = source.match(/^(.+) requires an audio stream\.$/)
  if (match) return t('compat.requiresAudioStream', { format: stripCompatibilityIcon(match[1]) })

  match = source.match(/^(.+) requires a video or image stream\.$/)
  if (match) return t('compat.requiresVideoStream', { format: stripCompatibilityIcon(match[1]) })

  if (source.startsWith('FFmpeg preset: ')) {
    const body = source.slice('FFmpeg preset: '.length).replace(/\.$/, '')
    const localizedParts = body.split(', ').map((part) => {
      let partMatch = part.match(/^video: (.+)$/)
      if (partMatch) return t('compat.video', { codec: partMatch[1] })
      partMatch = part.match(/^video codec: (.+)$/)
      if (partMatch) return t('compat.videoCodec', { codec: partMatch[1] })
      partMatch = part.match(/^audio: (.+)$/)
      if (partMatch) return t('compat.audio', { codec: partMatch[1] })
      partMatch = part.match(/^audio codec: (.+)$/)
      if (partMatch) return t('compat.audioCodec', { codec: partMatch[1] })
      return part
    })
    return t('compat.preset', { parts: localizedParts.join('、') })
  }

  match = source.match(/^ffprobe returned an empty result\.$/)
  if (match) return 'ffprobeから解析結果が返されませんでした。'

  match = source.match(/^ffprobe failed with code (-?\d+)\.$/)
  if (match) return `ffprobeが終了コード ${match[1]} で失敗しました。`

  match = source.match(/^ffprobe returned no media information \(exit (-?\d+)\)\.$/)
  if (match) return `ffprobeからメディア情報を取得できませんでした（終了コード ${match[1]}）。`

  match = source.match(/^ffprobe failed with exit code (-?\d+)\.$/)
  if (match) return `ffprobeが終了コード ${match[1]} で失敗しました。`

  return source
}

function qualityName(english) {
  return t(english === 'High' ? 'quality.high' : english === 'Low' ? 'quality.low' : 'quality.medium')
}

function stripCompatibilityIcon(label) {
  return String(label || '').replace(/^[★✓△⚙×]\s*/, '')
}
