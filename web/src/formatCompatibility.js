const RECOMMENDED_BY_KIND = {
  video: ['mp4', 'mkv', 'webm', 'mov'],
  audio: ['mp3', 'm4a', 'flac', 'wav', 'opus'],
  image: ['webp', 'jpg', 'png', 'avif'],
}

const SPECIAL_CATEGORIES = new Set([
  'Streaming & Broadcast',
  'Raw / Elementary Streams',
  'Subtitles & Data',
  'Advanced / Other',
])

const RAW_AUDIO_MUXERS = new Set([
  'ac3', 'adts', 'aptx', 'aptx_hd', 'codec2raw', 'dfpwm', 'dts', 'eac3', 'g722',
  'g723_1', 'g726', 'g726le', 'gsm', 'ilbc', 'mlp', 'mp2', 'sbc', 'truehd',
  'alaw', 'mulaw', 's8', 'u8', 's16le', 's16be', 'u16le', 'u16be', 's24le',
  's24be', 'u24le', 'u24be', 's32le', 's32be', 'u32le', 'u32be', 'f32le',
  'f32be', 'f64le', 'f64be',
])

const RAW_VIDEO_MUXERS = new Set([
  'av1', 'cavsvideo', 'dirac', 'dnxhd', 'h261', 'h263', 'h264', 'hevc', 'm4v',
  'mjpeg', 'mpeg1video', 'mpeg2video', 'obu', 'rawvideo', 'vc1', 'vvc',
])

const ANIMATION_MUXERS = new Set(['gif', 'apng'])

const CODEC_ENCODER_CHOICES = {
  h264: ['libx264', 'h264', 'h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf'],
  hevc: ['libx265', 'hevc', 'hevc_videotoolbox', 'hevc_nvenc', 'hevc_qsv', 'hevc_amf'],
  av1: ['libaom-av1', 'libsvtav1', 'librav1e', 'av1', 'av1_nvenc', 'av1_qsv', 'av1_amf'],
  vp9: ['libvpx-vp9', 'vp9', 'vp9_qsv', 'vp9_vaapi'],
  vp8: ['libvpx', 'vp8'],
  mpeg4: ['mpeg4', 'libxvid'],
  mpeg2video: ['mpeg2video'],
  mpeg1video: ['mpeg1video'],
  wmv2: ['wmv2'],
  wmv1: ['wmv1'],
  mjpeg: ['mjpeg'],
  png: ['png'],
  webp: ['libwebp', 'webp'],
  gif: ['gif'],
  apng: ['apng'],
  tiff: ['tiff'],
  bmp: ['bmp'],
  targa: ['targa'],
  qoi: ['qoi'],
  aac: ['aac', 'libfdk_aac'],
  mp3: ['libmp3lame', 'mp3'],
  mp2: ['mp2'],
  opus: ['libopus', 'opus'],
  vorbis: ['libvorbis', 'vorbis'],
  flac: ['flac'],
  ac3: ['ac3', 'ac3_fixed'],
  eac3: ['eac3'],
  wmav2: ['wmav2'],
  wmav1: ['wmav1'],
  pcm_s16le: ['pcm_s16le'],
  pcm_s16be: ['pcm_s16be'],
  pcm_s24le: ['pcm_s24le'],
  pcm_s24be: ['pcm_s24be'],
  pcm_s32le: ['pcm_s32le'],
  pcm_s32be: ['pcm_s32be'],
  pcm_f32le: ['pcm_f32le'],
  pcm_f32be: ['pcm_f32be'],
}

const LEVEL_META = {
  recommended: { icon: '★', label: 'Recommended', canRun: true },
  compatible: { icon: '✓', label: 'Compatible', canRun: true },
  'stream-drop': { icon: '△', label: 'Drops streams', canRun: true },
  special: { icon: '⚙', label: 'Special', canRun: true },
  unsupported: { icon: '×', label: 'Unsupported', canRun: false },
}

export function decorateFormatGroups(groups, inspection) {
  if (!inspection) return groups
  return groups.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      const compatibility = assessFormatCompatibility(option, inspection)
      return {
        ...option,
        compatibility,
        label: `${compatibility.icon} ${option.label}`,
      }
    }),
  }))
}

export function assessFormatCompatibility(spec, inspection) {
  const hasVideo = Boolean(inspection?.hasVideo || inspection?.kind === 'video' || inspection?.kind === 'image')
  const hasAudio = Boolean(inspection?.hasAudio || inspection?.kind === 'audio')
  const kind = inspection?.kind || 'unknown'

  if (!spec || (!hasVideo && !hasAudio)) {
    return result('unsupported', 'No usable audio/video stream was detected.')
  }

  const support = streamSupport(spec)
  const supportsVideo = support.video
  const supportsAudio = support.audio

  if (supportsVideo === false && supportsAudio === false) {
    return SPECIAL_CATEGORIES.has(spec.category)
      ? result('special', 'This FFmpeg output is a control/data/special-purpose muxer and may require extra parameters.')
      : result('unsupported', 'This output does not accept the detected media streams.')
  }

  const usableVideo = hasVideo && supportsVideo !== false
  const usableAudio = hasAudio && supportsAudio !== false
  if (!usableVideo && !usableAudio) {
    const required = supportsVideo && !supportsAudio ? 'video/image' : supportsAudio && !supportsVideo ? 'audio' : 'compatible media'
    return result('unsupported', `This format requires ${required} input.`)
  }

  const dropsVideo = hasVideo && supportsVideo === false
  const dropsAudio = hasAudio && supportsAudio === false
  const losesMotion = spec.media === 'image' && kind === 'video'
  const recommended = (RECOMMENDED_BY_KIND[kind] || []).includes(spec.id)

  if (SPECIAL_CATEGORIES.has(spec.category) && spec.preset === 'auto' && !spec.resolved) {
    return result('special', 'FFmpeg supports this muxer, but MediaSqueeze will inspect its default codecs before conversion.', dropsVideo, dropsAudio)
  }

  if (dropsVideo || dropsAudio || losesMotion) {
    const details = []
    if (dropsVideo) details.push('video will be removed')
    if (dropsAudio) details.push('audio will be removed')
    if (losesMotion) details.push('only one frame will be kept')
    return result('stream-drop', details.join('; ') + '.', dropsVideo, dropsAudio)
  }

  if (recommended) {
    return result('recommended', 'Common, broadly compatible choice for this input.')
  }

  if (SPECIAL_CATEGORIES.has(spec.category)) {
    return result('special', resolvedCodecMessage(spec) || 'Special-purpose FFmpeg output. Review the muxer description before using it.')
  }

  return result('compatible', resolvedCodecMessage(spec) || 'The detected media streams can be converted to this output.')
}

export function resolveFormatFromMuxerHelp(spec, muxerHelpText, encoderText, inspection) {
  if (!spec || spec.preset !== 'auto') return spec

  const encoders = parseEncoderNames(encoderText)
  const defaultVideoCodec = parseDefaultCodec(muxerHelpText, 'video')
  const defaultAudioCodec = parseDefaultCodec(muxerHelpText, 'audio')
  let supportsVideo = Boolean(defaultVideoCodec)
  let supportsAudio = Boolean(defaultAudioCodec)

  if (RAW_VIDEO_MUXERS.has(spec.muxer)) {
    supportsVideo = true
    supportsAudio = false
  } else if (RAW_AUDIO_MUXERS.has(spec.muxer)) {
    supportsVideo = false
    supportsAudio = true
  } else if (spec.category === 'Audio') {
    supportsVideo = false
    supportsAudio = true
  } else if (spec.category === 'Images & Animation') {
    supportsVideo = true
    supportsAudio = false
  }

  const videoCodec = defaultVideoCodec || (RAW_VIDEO_MUXERS.has(spec.muxer) ? spec.muxer : null)
  const audioCodec = defaultAudioCodec || (RAW_AUDIO_MUXERS.has(spec.muxer) ? spec.muxer : null)
  const videoEncoder = chooseEncoderForCodec(videoCodec, encoders)
  const audioEncoder = chooseEncoderForCodec(audioCodec, encoders)

  let media = spec.media
  if (spec.category === 'Images & Animation') media = ANIMATION_MUXERS.has(spec.muxer) ? 'animation' : 'image'
  else if (supportsVideo) media = 'video'
  else if (supportsAudio) media = 'audio'

  return {
    ...spec,
    media,
    resolved: true,
    supportsVideo,
    supportsAudio,
    defaultVideoCodec: videoCodec,
    defaultAudioCodec: audioCodec,
    videoEncoder: videoEncoder || spec.videoEncoder || null,
    audioEncoder: audioEncoder || spec.audioEncoder || null,
  }
}

export function buildSmartConvertArguments(spec, inspection, baseBuilder) {
  if (!spec?.resolved || spec.preset !== 'auto') return baseBuilder(spec, inspection)

  const args = []
  const hasVideo = Boolean(inspection?.hasVideo || inspection?.kind === 'video' || inspection?.kind === 'image')
  const hasAudio = Boolean(inspection?.hasAudio || inspection?.kind === 'audio')

  if (spec.media === 'audio') {
    if (!hasAudio) throw new Error(`${spec.label} requires an audio stream.`)
    args.push('-vn')
    addAudioEncoder(args, spec.audioEncoder)
    return args
  }

  if (spec.media === 'image' || spec.media === 'animation') {
    if (!hasVideo) throw new Error(`${spec.label} requires a video or image stream.`)
    args.push('-an')
    if (spec.media === 'animation' && inspection?.kind === 'video') args.push('-vf', 'fps=12')
    else args.push('-frames:v', '1')
    addVideoEncoder(args, spec.videoEncoder, true)
    return args
  }

  if (hasVideo) {
    if (spec.supportsVideo === false) args.push('-vn')
    else addVideoEncoder(args, spec.videoEncoder, false)
  }

  if (hasAudio) {
    if (spec.supportsAudio === false) args.push('-an')
    else addAudioEncoder(args, spec.audioEncoder)
  }

  return args
}

export function parseEncoderNames(text) {
  const result = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*[VAS]\S*\s+([^\s]+)\s+/)
    if (match) result.add(match[1])
  }
  return result
}

function streamSupport(spec) {
  if (typeof spec.supportsVideo === 'boolean' || typeof spec.supportsAudio === 'boolean') {
    return {
      video: spec.supportsVideo ?? null,
      audio: spec.supportsAudio ?? null,
    }
  }

  if (spec.media === 'audio' || spec.category === 'Audio' || RAW_AUDIO_MUXERS.has(spec.muxer)) {
    return { video: false, audio: true }
  }
  if (spec.media === 'image' || spec.media === 'animation' || spec.category === 'Images & Animation') {
    return { video: true, audio: false }
  }
  if (RAW_VIDEO_MUXERS.has(spec.muxer)) {
    return { video: true, audio: false }
  }
  if (spec.media === 'video') {
    return { video: true, audio: true }
  }
  if (spec.category === 'Subtitles & Data') {
    return { video: false, audio: false }
  }
  return { video: null, audio: null }
}

function parseDefaultCodec(text, type) {
  const match = String(text || '').match(new RegExp(`Default ${type} codec:\\s*([^\\s.]+)`, 'i'))
  if (!match) return null
  const codec = match[1].trim().toLowerCase()
  return ['none', 'unknown', 'n/a'].includes(codec) ? null : codec
}

function chooseEncoderForCodec(codec, encoders) {
  if (!codec) return null
  const choices = CODEC_ENCODER_CHOICES[codec] || [codec]
  return choices.find((encoder) => encoders.has(encoder)) || null
}

function addVideoEncoder(args, encoder, stillImage) {
  if (!encoder) return
  args.push('-c:v', encoder)
  if (encoder === 'libx264') args.push('-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p')
  else if (encoder === 'libx265') args.push('-preset', 'fast', '-crf', '27', '-pix_fmt', 'yuv420p')
  else if (encoder.startsWith('libvpx') || encoder === 'vp8' || encoder === 'vp9') args.push('-crf', '31', '-b:v', '0')
  else if (encoder === 'libaom-av1' || encoder === 'libsvtav1' || encoder === 'librav1e') args.push('-crf', stillImage ? '28' : '32')
  else if (encoder === 'mpeg4') args.push('-q:v', '5')
  else if (encoder === 'mpeg2video' || encoder === 'mpeg1video') args.push('-q:v', '4')
  else if (encoder === 'mjpeg') args.push('-q:v', '2')
  else if (encoder === 'libwebp' || encoder === 'webp') args.push('-quality', '88')
}

function addAudioEncoder(args, encoder) {
  if (!encoder) return
  args.push('-c:a', encoder)
  if (encoder === 'libvorbis' || encoder === 'vorbis') args.push('-q:a', '5')
  else if (encoder.startsWith('pcm_') || encoder === 'flac') return
  else if (encoder === 'libopus' || encoder === 'opus') args.push('-b:a', '160k')
  else args.push('-b:a', '192k')
}

function resolvedCodecMessage(spec) {
  const parts = []
  if (spec.videoEncoder) parts.push(`video: ${spec.videoEncoder}`)
  else if (spec.defaultVideoCodec) parts.push(`video codec: ${spec.defaultVideoCodec}`)
  if (spec.audioEncoder) parts.push(`audio: ${spec.audioEncoder}`)
  else if (spec.defaultAudioCodec) parts.push(`audio codec: ${spec.defaultAudioCodec}`)
  return parts.length ? `FFmpeg preset: ${parts.join(', ')}.` : ''
}

function result(level, message, dropsVideo = false, dropsAudio = false) {
  const meta = LEVEL_META[level]
  return {
    level,
    icon: meta.icon,
    label: meta.label,
    message,
    canRun: meta.canRun,
    dropsVideo,
    dropsAudio,
  }
}
