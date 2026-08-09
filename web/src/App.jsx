import { useEffect, useRef, useState } from 'react'
import { MediaEngine } from './mediaEngine'
import { FALLBACK_FORMAT_GROUPS, flattenFormats, preferredFormatId } from './formatCatalog'
import { defaultCustomExtension, normalizeCustomExtension, runCustomFfmpeg } from './customArguments'
import { localizeCategory, t } from './i18n'

const qualityOptions = [
  { value: 'high', labelKey: 'quality.high' },
  { value: 'medium', labelKey: 'quality.medium' },
  { value: 'low', labelKey: 'quality.low' },
  { value: '10mb', label: '10MB' },
  { value: '25mb', label: '25MB' },
  { value: '50mb', label: '50MB' },
  { value: '100mb', label: '100MB' },
  { value: 'custom', labelKey: 'quality.customMb' },
]

const scaleOptions = [
  { value: 'original', labelKey: 'scale.original' },
  { value: 'percent', labelKey: 'scale.percent' },
  { value: 'width', labelKey: 'scale.width' },
  { value: 'height', labelKey: 'scale.height' },
]

export default function App() {
  const engineRef = useRef(null)
  const fileInputRef = useRef(null)
  if (!engineRef.current) engineRef.current = new MediaEngine()

  const engine = engineRef.current
  const [file, setFile] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [mode, setMode] = useState('compress')
  const [quality, setQuality] = useState('medium')
  const [customTarget, setCustomTarget] = useState('10')
  const [formatGroups, setFormatGroups] = useState(FALLBACK_FORMAT_GROUPS)
  const [outputFormat, setOutputFormat] = useState('mp4')
  const [scaleMode, setScaleMode] = useState('original')
  const [scaleValue, setScaleValue] = useState('50')
  const [customArgs, setCustomArgs] = useState('')
  const [customExtension, setCustomExtension] = useState('mp4')
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState(t('status.selectFile'))
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)

  engine.onProgress = (value) => setProgress(Math.max(0, Math.min(1, value)))

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url)
  }, [result])

  const isBusy = phase === 'analyzing' || phase === 'processing'
  const outputOptions = flattenFormats(formatGroups)
  const outputSpec = outputOptions.find((option) => option.id === outputFormat) || outputOptions[0] || null
  const formatCompatibility = outputSpec?.compatibility || null
  const convertBlocked = mode === 'convert' && formatCompatibility?.canRun === false
  const scaleDisabled = mode === 'convert' || mode === 'custom' || inspection?.kind === 'audio'
  const scaleValueDisabled = scaleDisabled || scaleMode === 'original'
  const optionLabel = mode === 'compress'
    ? t('label.quality')
    : mode === 'convert'
      ? t('label.format')
      : mode === 'custom'
        ? t('label.extension')
        : t('label.output')

  function scaleHint() {
    if (mode === 'convert') return t('hint.convertNoSize')
    if (mode === 'custom') return t('hint.customNoSize')
    if (inspection?.kind === 'audio') return t('hint.audioNoSize')
    if (scaleMode === 'percent') return t('hint.percent')
    if (scaleMode === 'width') return t('hint.width')
    if (scaleMode === 'height') return t('hint.height')
    return t('hint.original')
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
    if (nextMode === 'resize' && scaleMode === 'original') {
      setScaleMode('percent')
      setScaleValue('50')
    }
    if (nextMode === 'custom' && inspection) {
      setCustomExtension(defaultCustomExtension(inspection.kind))
    }
  }

  function changeScaleMode(nextMode) {
    setScaleMode(nextMode)
    if (nextMode === 'percent' && !positiveInteger(scaleValue)) setScaleValue('50')
    if (nextMode === 'width' && !positiveInteger(scaleValue)) setScaleValue('1280')
    if (nextMode === 'height' && !positiveInteger(scaleValue)) setScaleValue('720')
  }

  async function selectFile(nextFile) {
    if (!nextFile || isBusy) return
    if (nextFile.size >= 2 * 1024 * 1024 * 1024) {
      setFile(null)
      setInspection(null)
      setResult(null)
      setError(t('error.inputTooLarge'))
      setStatus(t('error.inputTooLargeStatus'))
      setPhase('error')
      return
    }

    setError('')
    setProgress(0)
    setResult((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url)
      return null
    })
    if (inspection) await engine.cleanupInput(inspection)

    setFile(nextFile)
    setInspection(null)
    setPhase('analyzing')
    setStatus(`${t('status.selected')}\n${nextFile.name}\n\n${t('status.preparing')}`)

    try {
      const info = await engine.inspect(nextFile, (message) => setStatus(`${message}\n${nextFile.name}`))
      if (info.kind === 'unknown') throw new Error(t('error.unrecognizedMedia'))

      const groups = await engine.listOutputFormats((message) => setStatus(`${message}\n${nextFile.name}`))
      setFormatGroups(groups)
      setInspection(info)
      setCustomExtension(defaultCustomExtension(info.kind))

      if (info.kind === 'audio') {
        if (mode === 'resize') changeMode('compress')
        setScaleMode('original')
      }
      setOutputFormat(preferredFormatId(info.kind, groups))
      setStatus(`${t('status.selected')}\n${nextFile.name}\n\n${describeMedia(info, nextFile.size)}\n${t('status.formatCount', { count: flattenFormats(groups).length })}`)
      setPhase('ready')
    } catch (err) {
      const message = err.message || t('error.readSelected')
      setError(message)
      setStatus(t('error.prefix', { message }))
      setPhase('error')
    }
  }

  function clearResult() {
    setResult((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url)
      return null
    })
  }

  function validateScale() {
    if (mode === 'convert' || mode === 'custom' || inspection?.kind === 'audio' || scaleMode === 'original') return true
    const value = Number(scaleValue)
    if (!Number.isInteger(value) || value <= 0) {
      setError(t('error.positiveSize'))
      return false
    }
    if (scaleMode === 'percent' && value > 400) {
      setError(t('error.percentMax'))
      return false
    }
    return true
  }

  function targetFromQuality() {
    if (quality === 'custom') return Number(customTarget)
    if (quality.endsWith('mb')) return Number(quality.replace('mb', ''))
    return null
  }

  async function run() {
    if (!file || !inspection || isBusy) return
    if (!validateScale()) return
    if (mode === 'resize' && inspection.kind === 'audio') {
      setError(t('error.resizeAudio'))
      return
    }
    if (mode === 'convert' && formatCompatibility?.canRun === false) {
      const message = `${formatCompatibility.label}: ${formatCompatibility.message}`
      setError(message)
      setStatus(t('error.prefix', { message }))
      return
    }

    const targetMB = targetFromQuality()
    if (mode === 'compress' && targetMB !== null && (!Number.isFinite(targetMB) || targetMB <= 0)) {
      setError(t('error.targetSize'))
      return
    }
    if (mode === 'custom') {
      try {
        normalizeCustomExtension(customExtension)
      } catch (err) {
        setError(err.message)
        setStatus(t('error.prefix', { message: err.message }))
        return
      }
    }

    const scale = {
      mode: scaleMode,
      value: scaleMode === 'original' ? 0 : Number(scaleValue),
    }

    clearResult()
    setError('')
    setProgress(0)
    setPhase('processing')
    setStatus(t('status.preparing'))

    try {
      let data
      if (mode === 'compress') {
        data = targetMB !== null
          ? await engine.compress({ file, inspection, targetMB, scale, onStatus: setStatus })
          : await engine.compressQuality({ file, inspection, quality, scale, onStatus: setStatus })
      } else if (mode === 'convert') {
        data = await engine.convert({ file, inspection, outputSpec, onStatus: setStatus })
      } else if (mode === 'custom') {
        data = await runCustomFfmpeg({
          engine,
          file,
          inspection,
          argsText: customArgs,
          outputExtension: customExtension,
          onStatus: setStatus,
        })
      } else {
        data = await engine.resize({ file, inspection, scale, onStatus: setStatus })
      }

      const url = URL.createObjectURL(data.blob)
      setResult({ ...data, url })
      setProgress(1)
      const targetNote = data.targetMB
        ? `\n${t('status.target', { size: formatCompactNumber(data.targetMB) })}${data.withinTarget === false ? t('status.slightlyExceeded') : ''}`
        : ''
      const bundleNote = data.bundledFiles ? `\n${t('status.bundledFiles', { count: data.bundledFiles })}` : ''
      setStatus(`${t('status.done')}\n${data.filename}\n\n${formatBytes(file.size)} → ${formatBytes(data.size)}${targetNote}${bundleNote}`)
      setPhase('done')
    } catch (err) {
      const message = err.message || t('error.processing')
      setError(message)
      setStatus(t('error.prefix', { message }))
      setPhase('error')
    }
  }

  async function cancel() {
    engine.cancel()
    setProgress(0)
    setInspection(null)
    setStatus(t('status.canceledReloading'))
    setPhase('analyzing')

    if (!file) {
      setPhase('idle')
      setStatus(t('status.selectFile'))
      return
    }

    try {
      const info = await engine.inspect(file, setStatus)
      setInspection(info)
      setCustomExtension(defaultCustomExtension(info.kind))
      setStatus(`${t('status.selected')}\n${file.name}\n\n${describeMedia(info, file.size)}`)
      setPhase('ready')
    } catch (err) {
      const message = err.message || t('error.reload')
      setError(message)
      setStatus(t('error.prefix', { message }))
      setPhase('error')
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) selectFile(dropped)
  }

  return (
    <div
      className={`page ${dragging ? 'dragging' : ''}`}
      onDragEnter={(event) => { event.preventDefault(); if (!isBusy) setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); if (!isBusy) setDragging(true) }}
      onDragLeave={(event) => {
        event.preventDefault()
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
      }}
      onDrop={handleDrop}
    >
      <main className={`desktop-window ${mode === 'custom' ? 'custom-mode' : ''}`} aria-label="MediaSqueeze Web">
        <div className="window-content">
          <h1 className="rainbow-title">MediaSqueeze</h1>

          <div className="file-picker-row">
            <button className="control-button select-button" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              {t('app.selectFile')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="video/*,audio/*,image/*,.mkv,.mov,.avi,.webm,.flac,.m4a,.aac,.ogg,.opus,.aiff,.avif,.heic,.tif,.tiff"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <div className="path-box" title={file?.name || ''}>{file?.name || ''}</div>
          </div>

          <div className="options-grid">
            <label className="field-group">
              <span className="field-label">{t('app.mode')}</span>
              <select value={mode} onChange={(event) => changeMode(event.target.value)} disabled={isBusy}>
                <option value="compress">{t('mode.compress')}</option>
                <option value="convert">{t('mode.convert')}</option>
                <option value="resize" disabled={inspection?.kind === 'audio'}>{t('mode.resize')}</option>
                <option value="custom">{t('mode.custom')}</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">{optionLabel}</span>
              {mode === 'compress' && (
                <div className="option-inline">
                  <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={isBusy}>
                    {qualityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.labelKey ? t(option.labelKey) : option.label}</option>
                    ))}
                  </select>
                  {quality === 'custom' && (
                    <div className="compact-value">
                      <input value={customTarget} onChange={(event) => setCustomTarget(event.target.value)} inputMode="decimal" disabled={isBusy} />
                      <span>MB</span>
                    </div>
                  )}
                </div>
              )}
              {mode === 'convert' && (
                <>
                  <select value={outputSpec?.id || ''} onChange={(event) => setOutputFormat(event.target.value)} disabled={isBusy || !outputOptions.length}>
                    {formatGroups.map((group) => (
                      <optgroup key={group.label} label={localizeCategory(group.label)}>
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id} disabled={option.compatibility?.canRun === false}>{option.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {formatCompatibility && (
                    <span
                      className="field-hint"
                      title={`${formatCompatibility.label}: ${formatCompatibility.message}`}
                    >
                      {formatCompatibility.icon} {formatCompatibility.label} — {formatCompatibility.message}
                    </span>
                  )}
                </>
              )}
              {mode === 'resize' && (
                <div className="fixed-output">{inspection?.kind === 'image' ? t('output.sameImageType') : t('output.mp4')}</div>
              )}
              {mode === 'custom' && (
                <div className="custom-extension">
                  <span>.</span>
                  <input
                    value={customExtension}
                    onChange={(event) => setCustomExtension(event.target.value.replace(/^\.+/, ''))}
                    spellCheck="false"
                    disabled={isBusy}
                    aria-label={t('aria.customExtension')}
                  />
                </div>
              )}
            </label>

            <div className={`field-group ${scaleDisabled ? 'disabled-field' : ''}`}>
              <span className="field-label">{t('label.size')}</span>
              <div className="size-controls">
                <select value={scaleMode} onChange={(event) => changeScaleMode(event.target.value)} disabled={isBusy || scaleDisabled}>
                  {scaleOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}
                </select>
                <input
                  className="size-value"
                  value={scaleValue}
                  onChange={(event) => setScaleValue(event.target.value)}
                  inputMode="numeric"
                  disabled={isBusy || scaleValueDisabled}
                  aria-label={t('aria.sizeValue')}
                />
              </div>
              <span className="field-hint">{scaleHint()}</span>
            </div>
          </div>

          {mode === 'custom' && (
            <label className="custom-arguments-panel">
              <span className="field-label">{t('custom.arguments')}</span>
              <textarea
                value={customArgs}
                onChange={(event) => setCustomArgs(event.target.value)}
                disabled={isBusy}
                spellCheck="false"
                placeholder={t('custom.placeholder')}
              />
              <span className="field-hint custom-hint">{t('custom.hint')}</span>
            </label>
          )}

          <div className="action-row">
            <button className="control-button action-button" onClick={run} disabled={!inspection || isBusy || convertBlocked}>{t('button.start')}</button>
            <button className="control-button action-button" onClick={cancel} disabled={phase !== 'processing'}>{t('button.cancel')}</button>
            {result ? (
              <a className="control-button action-button download-action" href={result.url} download={result.filename}>{t('button.download')}</a>
            ) : (
              <button className="control-button action-button" disabled>{t('button.download')}</button>
            )}
          </div>

          <div className="progress-bar" aria-label={t('aria.progress')} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <textarea className={`status-box ${error ? 'has-error' : ''}`} readOnly value={status} />
        </div>
      </main>

      <div className="web-note">{t('web.note')}</div>
      {dragging && <div className="drop-overlay">{t('drop.here')}</div>}
    </div>
  )
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0
}

function describeMedia(info, size) {
  const lines = [formatBytes(size)]
  if (info.duration > 0) lines.push(formatDuration(info.duration))
  if (info.width > 0 && info.height > 0) lines.push(`${info.width} × ${info.height}`)
  if (info.videoCodec) lines.push(info.videoCodec.toUpperCase())
  else if (info.audioCodec) lines.push(info.audioCodec.toUpperCase())
  return lines.join('  •  ')
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / (1024 ** index)
  return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatCompactNumber(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1).replace(/\.0$/, '')
}
