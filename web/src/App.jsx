import { useEffect, useRef, useState } from 'react'
import { MediaEngine } from './mediaEngine'
import { FALLBACK_FORMAT_GROUPS, flattenFormats, preferredFormatId } from './formatCatalog'

const qualityOptions = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: '10mb', label: '10MB' },
  { value: '25mb', label: '25MB' },
  { value: '50mb', label: '50MB' },
  { value: '100mb', label: '100MB' },
  { value: 'custom', label: 'Custom MB…' },
]

const scaleOptions = [
  { value: 'original', label: 'Original' },
  { value: 'percent', label: 'Percent' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
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
  const [phase, setPhase] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Select a file, or drop one here.')
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
  const scaleDisabled = mode === 'convert' || inspection?.kind === 'audio'
  const scaleValueDisabled = scaleDisabled || scaleMode === 'original'
  const optionLabel = mode === 'compress' ? 'Quality' : mode === 'convert' ? 'Format' : 'Output'

  function scaleHint() {
    if (mode === 'convert') return 'Not used for Convert.'
    if (inspection?.kind === 'audio') return 'Not available for audio.'
    if (scaleMode === 'percent') return 'Example: 50 means half size.'
    if (scaleMode === 'width') return 'Height is calculated automatically.'
    if (scaleMode === 'height') return 'Width is calculated automatically.'
    return 'Keeps original size.'
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
    if (nextMode === 'resize' && scaleMode === 'original') {
      setScaleMode('percent')
      setScaleValue('50')
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
      setError('ffmpeg.wasm cannot process input files of 2GB or larger.')
      setStatus('Error: Input file is too large.\nThe browser version supports files smaller than 2GB.')
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
    setStatus(`Selected:\n${nextFile.name}\n\nPreparing FFmpeg...`)

    try {
      const info = await engine.inspect(nextFile, (message) => setStatus(`${message}\n${nextFile.name}`))
      if (info.kind === 'unknown') throw new Error('This file could not be recognized as video, audio, or image.')

      const groups = await engine.listOutputFormats((message) => setStatus(`${message}\n${nextFile.name}`))
      setFormatGroups(groups)
      setInspection(info)

      if (info.kind === 'audio') {
        if (mode === 'resize') changeMode('compress')
        setScaleMode('original')
      }
      setOutputFormat(preferredFormatId(info.kind, groups))
      setStatus(`Selected:\n${nextFile.name}\n\n${describeMedia(info, nextFile.size)}\n${flattenFormats(groups).length} output formats available`)
      setPhase('ready')
    } catch (err) {
      setError(err.message || 'Could not read the selected file.')
      setStatus(`Error: ${err.message || 'Could not read the selected file.'}`)
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
    if (mode === 'convert' || inspection?.kind === 'audio' || scaleMode === 'original') return true
    const value = Number(scaleValue)
    if (!Number.isInteger(value) || value <= 0) {
      setError('Enter a positive whole number for Size.')
      return false
    }
    if (scaleMode === 'percent' && value > 400) {
      setError('Percent must be 400 or lower.')
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
      setError('Resize is not available for audio files.')
      return
    }
    if (mode === 'convert' && formatCompatibility?.canRun === false) {
      const message = `${formatCompatibility.label}: ${formatCompatibility.message}`
      setError(message)
      setStatus(`Error: ${message}`)
      return
    }

    const targetMB = targetFromQuality()
    if (mode === 'compress' && targetMB !== null && (!Number.isFinite(targetMB) || targetMB <= 0)) {
      setError('Enter a valid target size in MB.')
      return
    }

    const scale = {
      mode: scaleMode,
      value: scaleMode === 'original' ? 0 : Number(scaleValue),
    }

    clearResult()
    setError('')
    setProgress(0)
    setPhase('processing')
    setStatus('Preparing FFmpeg...')

    try {
      let data
      if (mode === 'compress') {
        data = targetMB !== null
          ? await engine.compress({ file, inspection, targetMB, scale, onStatus: setStatus })
          : await engine.compressQuality({ file, inspection, quality, scale, onStatus: setStatus })
      } else if (mode === 'convert') {
        data = await engine.convert({ file, inspection, outputSpec, onStatus: setStatus })
      } else {
        data = await engine.resize({ file, inspection, scale, onStatus: setStatus })
      }

      const url = URL.createObjectURL(data.blob)
      setResult({ ...data, url })
      setProgress(1)
      const targetNote = data.targetMB
        ? `\nTarget: ${formatCompactNumber(data.targetMB)} MB${data.withinTarget === false ? ' (slightly exceeded)' : ''}`
        : ''
      const bundleNote = data.bundledFiles ? `\nBundled files: ${data.bundledFiles}` : ''
      setStatus(`Done:\n${data.filename}\n\n${formatBytes(file.size)} → ${formatBytes(data.size)}${targetNote}${bundleNote}`)
      setPhase('done')
    } catch (err) {
      setError(err.message || 'FFmpeg processing failed.')
      setStatus(`Error: ${err.message || 'FFmpeg processing failed.'}`)
      setPhase('error')
    }
  }

  async function cancel() {
    engine.cancel()
    setProgress(0)
    setInspection(null)
    setStatus('Canceled.\nReloading FFmpeg...')
    setPhase('analyzing')

    if (!file) {
      setPhase('idle')
      setStatus('Select a file, or drop one here.')
      return
    }

    try {
      const info = await engine.inspect(file, setStatus)
      setInspection(info)
      setStatus(`Selected:\n${file.name}\n\n${describeMedia(info, file.size)}`)
      setPhase('ready')
    } catch (err) {
      setError(err.message || 'Could not reload FFmpeg.')
      setStatus(`Error: ${err.message || 'Could not reload FFmpeg.'}`)
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
      <main className="desktop-window" aria-label="MediaSqueeze Web">
        <div className="window-content">
          <h1 className="rainbow-title">MediaSqueeze</h1>

          <div className="file-picker-row">
            <button className="control-button select-button" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
              Select File…
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
              <span className="field-label">Mode</span>
              <select value={mode} onChange={(event) => changeMode(event.target.value)} disabled={isBusy}>
                <option value="compress">Compress</option>
                <option value="convert">Convert</option>
                <option value="resize" disabled={inspection?.kind === 'audio'}>Resize</option>
              </select>
            </label>

            <label className="field-group">
              <span className="field-label">{optionLabel}</span>
              {mode === 'compress' && (
                <div className="option-inline">
                  <select value={quality} onChange={(event) => setQuality(event.target.value)} disabled={isBusy}>
                    {qualityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                      <optgroup key={group.label} label={group.label}>
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
                <div className="fixed-output">{inspection?.kind === 'image' ? 'Same image type' : 'MP4 output'}</div>
              )}
            </label>

            <div className={`field-group ${scaleDisabled ? 'disabled-field' : ''}`}>
              <span className="field-label">Size</span>
              <div className="size-controls">
                <select value={scaleMode} onChange={(event) => changeScaleMode(event.target.value)} disabled={isBusy || scaleDisabled}>
                  {scaleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input
                  className="size-value"
                  value={scaleValue}
                  onChange={(event) => setScaleValue(event.target.value)}
                  inputMode="numeric"
                  disabled={isBusy || scaleValueDisabled}
                  aria-label="Size value"
                />
              </div>
              <span className="field-hint">{scaleHint()}</span>
            </div>
          </div>

          <div className="action-row">
            <button className="control-button action-button" onClick={run} disabled={!inspection || isBusy || convertBlocked}>Start</button>
            <button className="control-button action-button" onClick={cancel} disabled={phase !== 'processing'}>Cancel</button>
            {result ? (
              <a className="control-button action-button download-action" href={result.url} download={result.filename}>Download Output</a>
            ) : (
              <button className="control-button action-button" disabled>Download Output</button>
            )}
          </div>

          <div className="progress-bar" aria-label="Progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <textarea className={`status-box ${error ? 'has-error' : ''}`} readOnly value={status} />
        </div>
      </main>

      <div className="web-note">Web版 — ffmpeg.wasmでブラウザ内処理。ファイルはサーバーへ送信されません。</div>
      {dragging && <div className="drop-overlay">Drop a media file here</div>}
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
