const SAFE_EXTENSION = /^[a-z0-9]{1,16}$/i

export function parseCustomArguments(text) {
  const source = String(text || '')
  const args = []
  let current = ''
  let quote = null
  let started = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (char === '\\' && quote !== "'") {
      const next = source[index + 1]
      const escapesNext = next !== undefined && (
        /\s/.test(next)
        || next === '\\'
        || next === quote
        || (!quote && (next === '"' || next === "'"))
      )
      if (escapesNext) {
        current += next
        index += 1
      } else {
        current += '\\'
      }
      started = true
      continue
    }

    if (quote) {
      if (char === quote) quote = null
      else current += char
      started = true
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }

    if (/\s/.test(char)) {
      if (started) {
        args.push(current)
        current = ''
        started = false
      }
      continue
    }

    current += char
    started = true
  }

  if (quote) throw new Error(`Unclosed ${quote === '"' ? 'double' : 'single'} quote in custom arguments.`)
  if (started) args.push(current)

  if (args[0] === 'ffmpeg' || args[0] === 'ffmpeg.exe') args.shift()
  return args
}

export function normalizeCustomExtension(value) {
  const extension = String(value || '').trim().replace(/^\.+/, '').toLowerCase()
  if (!SAFE_EXTENSION.test(extension)) {
    throw new Error('Output extension must be 1–16 letters or numbers, for example mp4, mkv, webm, m4a, or png.')
  }
  return extension
}

export function buildCustomArguments(text, inputPath, outputPath) {
  const parsed = parseCustomArguments(text)
  const args = []
  let hasInputPlaceholder = false
  let hasOutputPlaceholder = false

  for (const token of parsed) {
    if (token === '{input}') {
      args.push('-i', inputPath)
      hasInputPlaceholder = true
      continue
    }
    if (token === '{output}') {
      args.push(outputPath)
      hasOutputPlaceholder = true
      continue
    }

    const replaced = token
      .replaceAll('{input}', inputPath)
      .replaceAll('{output}', outputPath)
    if (token.includes('{input}')) hasInputPlaceholder = true
    if (token.includes('{output}')) hasOutputPlaceholder = true
    args.push(replaced)
  }

  if (!hasInputPlaceholder) args.unshift('-i', inputPath)
  if (!hasOutputPlaceholder) args.push(outputPath)
  return args
}

export async function runCustomFfmpeg({ engine, file, inspection, argsText, outputExtension, onStatus }) {
  if (!engine || !inspection?.inputName) throw new Error('Select and analyze an input file first.')
  const extension = normalizeCustomExtension(outputExtension)
  await engine.load(onStatus)

  const outputDir = `custom_${Date.now()}`
  const baseName = `${safeBase(file?.name || 'media')}_custom.${extension}`
  const outputPath = `${outputDir}/${baseName}`
  await engine.ffmpeg.createDir(outputDir)

  const args = buildCustomArguments(argsText, inspection.inputName, outputPath)
  const previousCapture = engine.logCapture
  const capture = []
  engine.logCapture = capture

  try {
    onStatus?.(`Running custom FFmpeg arguments...\nffmpeg ${previewArgs(args)}`)
    const code = await engine.ffmpeg.exec(args)
    if (code !== 0) {
      const detail = capture.filter(Boolean).slice(-16).join('\n')
      throw new Error(detail ? `FFmpeg exited with code ${code}.\n\n${detail}` : `FFmpeg exited with code ${code}.`)
    }
    return await engine.readOutputSet(outputDir, baseName, extension)
  } catch (error) {
    await engine.cleanupDirectory(outputDir)
    throw error
  } finally {
    engine.logCapture = previousCapture
  }
}

export function defaultCustomExtension(kind) {
  if (kind === 'audio') return 'm4a'
  if (kind === 'image') return 'webp'
  return 'mp4'
}

function previewArgs(args) {
  return args.map((arg) => /\s/.test(arg) ? JSON.stringify(arg) : arg).join(' ')
}

function safeBase(name) {
  return (String(name).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_') || 'media').slice(0, 80)
}
