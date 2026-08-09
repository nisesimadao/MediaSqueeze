const CATEGORY_ORDER = [
  'Video',
  'Audio',
  'Images & Animation',
  'Streaming & Broadcast',
  'Raw / Elementary Streams',
  'Subtitles & Data',
  'Advanced / Other',
]

const EXTENSION_OVERRIDES = {
  matroska: 'mkv', mpeg: 'mpg', mpegts: 'ts', ipod: 'm4a', adts: 'aac',
  image2: 'img', hls: 'm3u8', dash: 'mpd', webm: 'webm', asf: 'asf',
  smoothstreaming: 'ism', stream_segment: 'segment', ssegment: 'segment',
  segment: 'segment', tee: 'txt', framecrc: 'txt', framemd5: 'txt', hash: 'txt',
  md5: 'txt', crc: 'txt', streamhash: 'txt', null: 'null',
}

const RAW_MUXERS = new Set([
  'ac3', 'adts', 'aptx', 'aptx_hd', 'av1', 'cavsvideo', 'codec2raw', 'data', 'dfpwm',
  'dirac', 'dnxhd', 'dts', 'eac3', 'g722', 'g723_1', 'g726', 'g726le', 'gsm', 'h261',
  'h263', 'h264', 'hevc', 'ilbc', 'm4v', 'mjpeg', 'mlp', 'mp2', 'mpeg1video',
  'mpeg2video', 'rawvideo', 'sbc', 'truehd', 'vc1', 'vvc',
])

const STREAMING_MUXERS = new Set([
  'dash', 'hls', 'fifo', 'fifo_test', 'flv', 'ismv', 'mpegts', 'rtp', 'rtp_mpegts',
  'rtsp', 'sap', 'segment', 'stream_segment', 'ssegment', 'smoothstreaming', 'tee',
])

const AUDIO_MUXERS = new Set([
  'ac3', 'adts', 'aiff', 'alaw', 'amr', 'apm', 'aptx', 'aptx_hd', 'au', 'caf',
  'codec2', 'dfpwm', 'dts', 'eac3', 'f64be', 'f64le', 'f32be', 'f32le', 'flac', 'g722',
  'g723_1', 'g726', 'g726le', 'gsm', 'ircam', 'latm', 'm4a', 'mlp', 'mp2', 'mp3', 'mulaw',
  'oga', 'ogg', 'oma', 'opus', 's16be', 's16le', 's24be', 's24le', 's32be', 's32le',
  's8', 'sbc', 'sox', 'spdif', 'tta', 'truehd', 'u16be', 'u16le', 'u24be', 'u24le',
  'u32be', 'u32le', 'u8', 'voc', 'w64', 'wav', 'wv',
])

const VIDEO_MUXERS = new Set([
  '3g2', '3gp', 'asf', 'asf_stream', 'avi', 'avif', 'dv', 'f4v', 'film_cpk', 'flv',
  'gxf', 'ipod', 'ismv', 'ivf', 'matroska', 'matroska_audio', 'mjpeg', 'mov', 'mp4',
  'mpeg', 'mpeg1video', 'mpeg2video', 'mpegts', 'mxf', 'mxf_d10', 'mxf_opatom', 'nut',
  'ogv', 'rm', 'roq', 'vob', 'webm', 'webm_chunk', 'webm_dash_manifest', 'wtv',
])

const IMAGE_MUXERS = new Set(['apng', 'avif', 'gif', 'image2', 'image2pipe'])

const SUBTITLE_DATA_MUXERS = new Set([
  'ass', 'data', 'ffmetadata', 'microdvd', 'srt', 'sup', 'ttml', 'webvtt',
])

const COMMON_DEFINITIONS = [
  { id: 'mp4', label: 'MP4', category: 'Video', muxers: ['mp4'], extension: 'mp4', media: 'video', preset: 'h264-aac' },
  { id: 'mov', label: 'MOV / QuickTime', category: 'Video', muxers: ['mov'], extension: 'mov', media: 'video', preset: 'h264-aac' },
  { id: 'mkv', label: 'MKV / Matroska', category: 'Video', muxers: ['matroska'], extension: 'mkv', media: 'video', preset: 'h264-aac' },
  { id: 'webm', label: 'WebM', category: 'Video', muxers: ['webm'], extension: 'webm', media: 'video', preset: 'webm' },
  { id: 'avi', label: 'AVI', category: 'Video', muxers: ['avi'], extension: 'avi', media: 'video', preset: 'avi' },
  { id: 'mpegts', label: 'MPEG-TS', category: 'Video', muxers: ['mpegts'], extension: 'ts', media: 'video', preset: 'mpegts' },
  { id: 'mpeg', label: 'MPEG-PS', category: 'Video', muxers: ['mpeg'], extension: 'mpg', media: 'video', preset: 'mpeg' },
  { id: 'flv', label: 'FLV', category: 'Video', muxers: ['flv'], extension: 'flv', media: 'video', preset: 'h264-aac' },
  { id: '3gp', label: '3GP', category: 'Video', muxers: ['3gp'], extension: '3gp', media: 'video', preset: 'h264-aac' },
  { id: '3g2', label: '3G2', category: 'Video', muxers: ['3g2'], extension: '3g2', media: 'video', preset: 'h264-aac' },
  { id: 'wmv', label: 'WMV / ASF', category: 'Video', muxers: ['asf'], extension: 'wmv', media: 'video', preset: 'asf' },
  { id: 'nut', label: 'NUT', category: 'Video', muxers: ['nut'], extension: 'nut', media: 'video', preset: 'auto' },

  { id: 'mp3', label: 'MP3', category: 'Audio', muxers: ['mp3'], extension: 'mp3', media: 'audio', preset: 'mp3' },
  { id: 'm4a', label: 'M4A / AAC', category: 'Audio', muxers: ['ipod', 'mp4'], extension: 'm4a', media: 'audio', preset: 'aac' },
  { id: 'wav', label: 'WAV', category: 'Audio', muxers: ['wav'], extension: 'wav', media: 'audio', preset: 'wav' },
  { id: 'flac', label: 'FLAC', category: 'Audio', muxers: ['flac'], extension: 'flac', media: 'audio', preset: 'flac' },
  { id: 'ogg', label: 'OGG / Vorbis', category: 'Audio', muxers: ['ogg'], extension: 'ogg', media: 'audio', preset: 'vorbis' },
  { id: 'opus', label: 'Opus', category: 'Audio', muxers: ['opus', 'ogg'], extension: 'opus', media: 'audio', preset: 'opus' },
  { id: 'aac', label: 'AAC / ADTS', category: 'Audio', muxers: ['adts'], extension: 'aac', media: 'audio', preset: 'aac' },
  { id: 'aiff', label: 'AIFF', category: 'Audio', muxers: ['aiff'], extension: 'aiff', media: 'audio', preset: 'aiff' },
  { id: 'ac3', label: 'AC-3', category: 'Audio', muxers: ['ac3'], extension: 'ac3', media: 'audio', preset: 'ac3' },
  { id: 'eac3', label: 'E-AC-3', category: 'Audio', muxers: ['eac3'], extension: 'eac3', media: 'audio', preset: 'eac3' },
  { id: 'caf', label: 'CAF', category: 'Audio', muxers: ['caf'], extension: 'caf', media: 'audio', preset: 'pcm' },
  { id: 'au', label: 'AU', category: 'Audio', muxers: ['au'], extension: 'au', media: 'audio', preset: 'pcm-be' },
  { id: 'w64', label: 'Wave64', category: 'Audio', muxers: ['w64'], extension: 'w64', media: 'audio', preset: 'pcm' },
  { id: 'mp2', label: 'MP2', category: 'Audio', muxers: ['mp2'], extension: 'mp2', media: 'audio', preset: 'mp2' },

  { id: 'jpg', label: 'JPEG / JPG', category: 'Images & Animation', muxers: ['image2'], extension: 'jpg', media: 'image', preset: 'jpg', encoders: ['mjpeg'] },
  { id: 'png', label: 'PNG', category: 'Images & Animation', muxers: ['image2'], extension: 'png', media: 'image', preset: 'png', encoders: ['png'] },
  { id: 'webp', label: 'WebP', category: 'Images & Animation', muxers: ['image2'], extension: 'webp', media: 'image', preset: 'webp', encoders: ['libwebp', 'webp'] },
  { id: 'avif', label: 'AVIF', category: 'Images & Animation', muxers: ['avif'], extension: 'avif', media: 'image', preset: 'avif', encoders: ['libaom-av1', 'librav1e', 'libsvtav1', 'av1'] },
  { id: 'gif', label: 'GIF', category: 'Images & Animation', muxers: ['gif'], extension: 'gif', media: 'animation', preset: 'gif', encoders: ['gif'] },
  { id: 'apng', label: 'Animated PNG / APNG', category: 'Images & Animation', muxers: ['apng'], extension: 'apng', media: 'animation', preset: 'apng', encoders: ['apng'] },
  { id: 'tiff', label: 'TIFF', category: 'Images & Animation', muxers: ['image2'], extension: 'tiff', media: 'image', preset: 'tiff', encoders: ['tiff'] },
  { id: 'bmp', label: 'BMP', category: 'Images & Animation', muxers: ['image2'], extension: 'bmp', media: 'image', preset: 'bmp', encoders: ['bmp'] },
  { id: 'tga', label: 'TGA', category: 'Images & Animation', muxers: ['image2'], extension: 'tga', media: 'image', preset: 'tga', encoders: ['targa'] },
  { id: 'qoi', label: 'QOI', category: 'Images & Animation', muxers: ['image2'], extension: 'qoi', media: 'image', preset: 'qoi', encoders: ['qoi'] },
  { id: 'ppm', label: 'PPM', category: 'Images & Animation', muxers: ['image2'], extension: 'ppm', media: 'image', preset: 'ppm', encoders: ['ppm'] },
  { id: 'pgm', label: 'PGM', category: 'Images & Animation', muxers: ['image2'], extension: 'pgm', media: 'image', preset: 'pgm', encoders: ['pgm'] },
  { id: 'pbm', label: 'PBM', category: 'Images & Animation', muxers: ['image2'], extension: 'pbm', media: 'image', preset: 'pbm', encoders: ['pbm'] },
]

const FALLBACK_MUXERS = new Map(COMMON_DEFINITIONS.flatMap((item) => item.muxers.map((muxer) => [muxer, item.label])))
const FALLBACK_ENCODERS = new Set([
  'libx264', 'mpeg4', 'aac', 'libvpx-vp9', 'libopus', 'libmp3lame', 'pcm_s16le', 'pcm_s16be',
  'flac', 'libvorbis', 'ac3', 'eac3', 'mp2', 'mjpeg', 'png', 'libwebp', 'gif', 'apng',
  'tiff', 'bmp', 'targa', 'qoi', 'ppm', 'pgm', 'pbm',
])

export const FALLBACK_FORMAT_GROUPS = buildCatalog(FALLBACK_MUXERS, FALLBACK_ENCODERS, new Set(), true)

export function flattenFormats(groups) {
  return groups.flatMap((group) => group.options)
}

export function preferredFormatId(kind, groups) {
  const ids = new Set(flattenFormats(groups).map((option) => option.id))
  const preferred = kind === 'audio' ? ['mp3', 'm4a', 'wav'] : kind === 'image' ? ['webp', 'jpg', 'png'] : ['mp4', 'mkv', 'webm']
  return preferred.find((id) => ids.has(id)) || flattenFormats(groups)[0]?.id || 'mp4'
}

export function buildOutputFormatGroups(muxerText, encoderText, deviceText = '') {
  const muxers = parseMuxers(muxerText)
  const encoders = parseEncoders(encoderText)
  const devices = new Set(parseMuxers(deviceText).keys())
  const groups = buildCatalog(muxers, encoders, devices, false)
  return groups.length ? groups : FALLBACK_FORMAT_GROUPS
}

function parseMuxers(text) {
  const result = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*E\s+([^\s]+)\s+(.*)$/)
    if (!match) continue
    for (const alias of match[1].split(',').map((value) => value.trim()).filter(Boolean)) {
      if (!result.has(alias)) result.set(alias, match[2].trim())
    }
  }
  return result
}

function parseEncoders(text) {
  const result = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*[VAS]\S*\s+([^\s]+)\s+/)
    if (match) result.add(match[1])
  }
  return result
}

function buildCatalog(muxers, encoders, devices, fallbackOnly) {
  const byCategory = new Map(CATEGORY_ORDER.map((category) => [category, []]))
  const represented = new Set()

  for (let rank = 0; rank < COMMON_DEFINITIONS.length; rank += 1) {
    const definition = COMMON_DEFINITIONS[rank]
    const muxer = definition.muxers.find((name) => muxers.has(name))
    if (!muxer) continue
    if (definition.encoders?.length && !definition.encoders.some((name) => encoders.has(name))) continue

    const option = {
      ...definition,
      muxer,
      description: muxers.get(muxer) || definition.label,
      rank,
      videoEncoder: chooseEncoder(encoders, videoEncoderChoices(definition.preset)),
      audioEncoder: chooseEncoder(encoders, audioEncoderChoices(definition.preset)),
      imageEncoder: chooseEncoder(encoders, definition.encoders || []),
    }
    byCategory.get(definition.category).push(option)
    represented.add(muxer)
  }

  if (!fallbackOnly) {
    for (const [muxer, description] of muxers) {
      if (devices.has(muxer) || represented.has(muxer)) continue
      const category = classifyMuxer(muxer, description)
      const extension = inferExtension(muxer)
      byCategory.get(category).push({
        id: `muxer:${muxer}`,
        label: `${friendlyName(muxer, description)} (.${extension})`,
        category,
        muxer,
        extension,
        media: 'auto',
        preset: 'auto',
        description,
        rank: 10000,
        videoEncoder: null,
        audioEncoder: null,
        imageEncoder: null,
      })
    }
  }

  return CATEGORY_ORDER
    .map((category) => ({
      label: category,
      options: byCategory.get(category)
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label)),
    }))
    .filter((group) => group.options.length)
}

function chooseEncoder(encoders, choices) {
  return choices.find((name) => encoders.has(name)) || null
}

function videoEncoderChoices(preset) {
  if (preset === 'webm') return ['libvpx-vp9', 'libvpx', 'vp9', 'vp8']
  if (preset === 'avi') return ['mpeg4', 'libxvid']
  if (preset === 'mpeg' || preset === 'mpegts') return ['mpeg2video', 'mpeg1video']
  if (preset === 'asf') return ['wmv2', 'wmv1', 'mpeg4']
  if (preset === 'h264-aac') return ['libx264', 'h264', 'mpeg4']
  return []
}

function audioEncoderChoices(preset) {
  if (preset === 'webm' || preset === 'opus') return ['libopus', 'opus', 'libvorbis']
  if (preset === 'avi') return ['libmp3lame', 'mp3', 'mp2']
  if (preset === 'mpeg') return ['mp2', 'aac']
  if (preset === 'mpegts' || preset === 'h264-aac' || preset === 'aac') return ['aac']
  if (preset === 'asf') return ['wmav2', 'wmav1', 'aac']
  if (preset === 'mp3') return ['libmp3lame', 'mp3']
  if (preset === 'wav' || preset === 'pcm') return ['pcm_s16le']
  if (preset === 'pcm-be' || preset === 'aiff') return ['pcm_s16be']
  if (preset === 'flac') return ['flac']
  if (preset === 'vorbis') return ['libvorbis', 'vorbis']
  if (preset === 'ac3') return ['ac3', 'ac3_fixed']
  if (preset === 'eac3') return ['eac3']
  if (preset === 'mp2') return ['mp2']
  return []
}

function classifyMuxer(name, description) {
  const lower = `${name} ${description}`.toLowerCase()
  if (STREAMING_MUXERS.has(name) || /(stream|playlist|segment|rtp|rtsp|dash|hls|broadcast)/.test(lower)) return 'Streaming & Broadcast'
  if (IMAGE_MUXERS.has(name) || /(image|picture|animated png|gif)/.test(lower)) return 'Images & Animation'
  if (SUBTITLE_DATA_MUXERS.has(name) || /(subtitle|metadata|timed text|caption)/.test(lower)) return 'Subtitles & Data'
  if (RAW_MUXERS.has(name) || /(raw |raw$|elementary stream|checksum|hash|crc)/.test(lower)) return 'Raw / Elementary Streams'
  if (AUDIO_MUXERS.has(name) || /(audio|sound|voice|pcm)/.test(lower)) return 'Audio'
  if (VIDEO_MUXERS.has(name) || /(video|movie|multimedia|container|transport stream)/.test(lower)) return 'Video'
  return 'Advanced / Other'
}

function inferExtension(muxer) {
  const mapped = EXTENSION_OVERRIDES[muxer]
  if (mapped) return mapped
  const cleaned = muxer.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return cleaned || 'bin'
}

function friendlyName(muxer, description) {
  const compact = String(description || '').replace(/\s+/g, ' ').trim()
  return compact ? `${muxer.toUpperCase()} — ${compact}` : muxer.toUpperCase()
}

export function buildConvertArguments(spec, inspection) {
  if (!spec) throw new Error('Choose an output format.')
  const args = []
  const hasVideo = Boolean(inspection?.hasVideo || inspection?.kind === 'video' || inspection?.kind === 'image')
  const hasAudio = Boolean(inspection?.hasAudio || inspection?.kind === 'audio')

  if (spec.media === 'audio') {
    if (!hasAudio) throw new Error(`${spec.label} requires an audio stream.`)
    args.push('-vn')
    addAudioPreset(args, spec)
    return args
  }

  if (spec.media === 'image' || spec.media === 'animation') {
    if (!hasVideo) throw new Error(`${spec.label} requires a video or image stream.`)
    args.push('-an')
    if (spec.media === 'animation' && inspection?.kind === 'video') {
      args.push('-vf', 'fps=12')
    } else {
      args.push('-frames:v', '1')
    }
    addImagePreset(args, spec)
    return args
  }

  if (spec.media === 'video') {
    if (hasVideo) addVideoPreset(args, spec)
    if (hasAudio) addContainerAudio(args, spec)
    else args.push('-an')
    if ((spec.id === 'mp4' || spec.id === 'mov') && hasVideo) args.push('-movflags', '+faststart')
    return args
  }

  return args
}

function addVideoPreset(args, spec) {
  const encoder = spec.videoEncoder
  if (!encoder) return
  args.push('-c:v', encoder)
  if (encoder === 'libx264') args.push('-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p')
  else if (encoder.startsWith('libvpx') || encoder === 'vp8' || encoder === 'vp9') args.push('-crf', '31', '-b:v', '0')
  else if (encoder === 'mpeg4') args.push('-q:v', '5')
  else if (encoder === 'mpeg2video' || encoder === 'mpeg1video') args.push('-q:v', '4')
}

function addContainerAudio(args, spec) {
  const encoder = spec.audioEncoder
  if (!encoder) return
  args.push('-c:a', encoder)
  if (encoder === 'libvorbis' || encoder === 'vorbis') args.push('-q:a', '5')
  else if (encoder.startsWith('pcm_') || encoder === 'flac') return
  else args.push('-b:a', encoder === 'libopus' || encoder === 'opus' ? '128k' : '160k')
}

function addAudioPreset(args, spec) {
  const encoder = spec.audioEncoder
  if (encoder) args.push('-c:a', encoder)
  if (spec.preset === 'vorbis') args.push('-q:a', '5')
  else if (['wav', 'pcm', 'pcm-be', 'aiff', 'flac'].includes(spec.preset)) return
  else if (spec.preset === 'opus') args.push('-b:a', '160k')
  else args.push('-b:a', '192k')
}

function addImagePreset(args, spec) {
  const encoder = spec.imageEncoder
  if (encoder) args.push('-c:v', encoder)
  if (spec.preset === 'jpg') args.push('-q:v', '2')
  else if (spec.preset === 'webp') args.push('-quality', '88')
  else if (spec.preset === 'avif') args.push('-crf', '28')
}
