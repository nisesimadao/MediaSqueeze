import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleX,
  FileAudio2,
  FileImage,
  FileVideo2,
  Gauge,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Settings2,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { MediaEngine, OUTPUTS } from './mediaEngine'

const targetPresets = [10, 25, 50, 100]
const resolutions = [
  { value: 'original', label: '元の解像度' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
]

export default function App() {
  const engineRef = useRef(null)
  if (!engineRef.current) engineRef.current = new MediaEngine()

  const [file, setFile] = useState(null)
  const [inspection, setInspection] = useState(null)
  const [mode, setMode] = useState('compress')
  const [targetMB, setTargetMB] = useState(10)
  const [customTarget, setCustomTarget] = useState('')
  const [outputFormat, setOutputFormat] = useState('mp4')
  const [resolution, setResolution] = useState('original')
  const [quality, setQuality] = useState('balanced')
  const [advanced, setAdvanced] = useState(false)
  const [status, setStatus] = useState('ファイルを選んでください')
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)

  const engine = engineRef.current
  engine.onProgress = (value) => setProgress(value)

  useEffect(() => () => {
    if (result?.url) URL.revokeObjectURL(result.url)
  }, [result])

  const outputs = inspection?.kind && OUTPUTS[inspection.kind] ? OUTPUTS[inspection.kind] : OUTPUTS.video
  const sourceMB = file ? file.size / 1024 / 1024 : 0
  const activeTarget = customTarget.trim() ? Number(customTarget) : targetMB
  const isBusy = phase === 'analyzing' || phase === 'processing'

  const reduction = result && file
    ? Math.max(0, Math.round((1 - result.size / file.size) * 100))
    : null

  async function selectFile(nextFile) {
    if (!nextFile || isBusy) return
    if (nextFile.size >= 2 * 1024 * 1024 * 1024) {
      setFile(null)
      setInspection(null)
      setError('ffmpeg.wasm の制限により、2GB以上の入力ファイルは処理できません。')
      setStatus('ファイルが大きすぎます')
      setPhase('error')
      return
    }
    setError('')
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
    if (inspection) await engine.cleanupInput(inspection)
    setFile(nextFile)
    setInspection(null)
    setProgress(0)
    setPhase('analyzing')
    try {
      const info = await engine.inspect(nextFile, setStatus)
      if (info.kind === 'unknown') throw new Error('このファイルは動画・音声・画像として認識できませんでした。')
      setInspection(info)
      setMode(info.kind === 'image' ? 'convert' : 'compress')
      setOutputFormat(info.kind === 'audio' ? 'mp3' : info.kind === 'image' ? 'webp' : 'mp4')
      setStatus('準備完了')
      setPhase('ready')
    } catch (err) {
      setError(err.message || 'ファイルを読み込めませんでした。')
      setStatus('読み込みに失敗しました')
      setPhase('error')
    }
  }

  function clearFile() {
    if (isBusy) return
    if (inspection) engine.cleanupInput(inspection)
    setFile(null)
    setInspection(null)
    setResult((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
    setError('')
    setProgress(0)
    setStatus('ファイルを選んでください')
    setPhase('idle')
  }

  async function run() {
    if (!file || !inspection || isBusy) return
    if (mode === 'compress' && (!Number.isFinite(activeTarget) || activeTarget <= 0)) {
      setError('目標容量を正しい数値で入力してください。')
      return
    }

    setError('')
    setProgress(0)
    setPhase('processing')
    try {
      const data = mode === 'compress'
        ? await engine.compress({
            file,
            inspection,
            targetMB: activeTarget,
            resolution: resolution === 'original' ? 'auto' : resolution,
            onStatus: setStatus,
          })
        : await engine.convert({ file, inspection, outputFormat, resolution, quality, onStatus: setStatus })
      const url = URL.createObjectURL(data.blob)
      setResult((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url)
        return { ...data, url }
      })
      setProgress(1)
      setStatus(
        data.passthrough
          ? 'すでに目標容量以内です'
          : data.withinTarget === false
            ? '完了しました（指定容量を少し超えています）'
            : '完了しました',
      )
      setPhase('done')
    } catch (err) {
      setError(err.message || '処理に失敗しました。')
      setStatus('処理に失敗しました')
      setPhase('error')
    }
  }

  async function cancel() {
    engine.cancel()
    setProgress(0)
    setInspection(null)
    setPhase('analyzing')
    setStatus('キャンセルしました。FFmpegを再準備中…')
    if (!file) {
      setPhase('idle')
      return
    }
    try {
      const info = await engine.inspect(file, setStatus)
      setInspection(info)
      setStatus('準備完了')
      setPhase('ready')
    } catch (err) {
      setError(err.message || 'FFmpegの再読み込みに失敗しました。')
      setStatus('再読み込みに失敗しました')
      setPhase('error')
    }
  }

  const fileIcon = inspection?.kind === 'audio' ? FileAudio2 : inspection?.kind === 'image' ? FileImage : FileVideo2
  const FileIcon = fileIcon

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="MediaSqueeze Web ホーム">
          <span className="brand-mark"><Gauge size={19} strokeWidth={2.2} /></span>
          <span>MediaSqueeze</span>
          <span className="brand-web">Web</span>
        </a>
        <div className="privacy-chip"><LockKeyhole size={14} /> ファイルは端末から出ません</div>
      </header>

      <main className="workspace">
        <section className="intro">
          <h1>メディア変換を、<br className="mobile-break" />ブラウザだけで。</h1>
          <p>動画・音声・画像を変換。動画は 10MB、25MB、任意サイズまで狙って圧縮できます。</p>
        </section>

        <section className="converter" aria-label="メディア変換ツール">
          {!file ? (
            <DropZone dragging={dragging} setDragging={setDragging} onFile={selectFile} />
          ) : (
            <>
              <div className="file-row">
                <div className="file-icon"><FileIcon size={23} /></div>
                <div className="file-copy">
                  <div className="file-name" title={file.name}>{file.name}</div>
                  <div className="file-meta">
                    <span>{formatBytes(file.size)}</span>
                    {inspection?.duration > 0 && <><i /> <span>{formatDuration(inspection.duration)}</span></>}
                    {inspection?.width > 0 && inspection?.height > 0 && <><i /> <span>{inspection.width}×{inspection.height}</span></>}
                    {inspection?.videoCodec && <><i /> <span>{inspection.videoCodec.toUpperCase()}</span></>}
                  </div>
                </div>
                <button className="icon-button" onClick={clearFile} aria-label="ファイルを外す" disabled={isBusy}><X size={18} /></button>
              </div>

              <div className="mode-switch" role="tablist" aria-label="処理モード">
                {inspection?.kind !== 'image' && (
                  <button className={mode === 'compress' ? 'active' : ''} onClick={() => setMode('compress')} disabled={isBusy}>
                    <Sparkles size={17} /> 圧縮
                  </button>
                )}
                <button className={mode === 'convert' ? 'active' : ''} onClick={() => setMode('convert')} disabled={isBusy}>
                  <RefreshCw size={16} /> 変換
                </button>
              </div>

              <div className="settings-area">
                {phase === 'analyzing' ? (
                  <div className="analyzing"><LoaderCircle className="spin" size={22} /><span>{status}</span></div>
                ) : mode === 'compress' ? (
                  <CompressionPanel
                    targetMB={targetMB}
                    setTargetMB={(value) => { setTargetMB(value); setCustomTarget('') }}
                    customTarget={customTarget}
                    setCustomTarget={setCustomTarget}
                    sourceMB={sourceMB}
                    disabled={isBusy}
                  />
                ) : (
                  <ConversionPanel outputs={outputs} outputFormat={outputFormat} setOutputFormat={setOutputFormat} disabled={isBusy} />
                )}

                {inspection && phase !== 'analyzing' && (
                  <div className="advanced-wrap">
                    <button className="advanced-toggle" onClick={() => setAdvanced((v) => !v)} disabled={isBusy} aria-expanded={advanced}>
                      <span><Settings2 size={16} /> 詳細設定</span>
                      <ChevronDown size={17} className={advanced ? 'rotated' : ''} />
                    </button>
                    {advanced && (
                      <div className="advanced-panel">
                        {inspection.kind !== 'audio' && (
                          <Field label="解像度">
                            <Select value={resolution} onChange={setResolution} options={resolutions} disabled={isBusy} />
                          </Field>
                        )}
                        {mode === 'convert' && (
                          <Field label="品質">
                            <Select
                              value={quality}
                              onChange={setQuality}
                              disabled={isBusy}
                              options={[
                                { value: 'high', label: '高品質' },
                                { value: 'balanced', label: '標準' },
                                { value: 'small', label: '容量優先' },
                              ]}
                            />
                          </Field>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && <div className="error-banner"><CircleX size={17} /><span>{error}</span></div>}

              {(phase === 'processing' || phase === 'done') && (
                <div className="progress-block">
                  <div className="progress-head"><span>{status}</span><b>{Math.round(progress * 100)}%</b></div>
                  <div className="progress-track"><div style={{ width: `${Math.max(2, progress * 100)}%` }} /></div>
                </div>
              )}

              {result && phase === 'done' ? (
                <ResultPanel result={result} originalSize={file.size} reduction={reduction} onAgain={() => {
                  setResult((prev) => { if (prev?.url) URL.revokeObjectURL(prev.url); return null })
                  setProgress(0)
                  setPhase('ready')
                  setStatus('準備完了')
                }} />
              ) : (
                <div className="action-row">
                  <button className="primary-action" onClick={run} disabled={!inspection || phase === 'analyzing' || isBusy}>
                    {phase === 'processing' ? <><LoaderCircle className="spin" size={18} /> 処理中…</> : <><WandSparkles size={18} /> {mode === 'compress' ? `${formatTargetLabel(activeTarget)}に圧縮` : `${outputFormat.toUpperCase()}に変換`}</>}
                  </button>
                  {phase === 'processing' && <button className="cancel-button" onClick={cancel}>キャンセル</button>}
                </div>
              )}
            </>
          )}
        </section>

        <div className="under-note">
          <LockKeyhole size={15} />
          <span>処理は ffmpeg.wasm を使ってこのブラウザ内で完結します。メディアファイルをサーバーへ送信しません。</span>
        </div>
      </main>

      <footer>
        <span>MediaSqueeze Web</span>
        <span>Powered by ffmpeg.wasm</span>
      </footer>
    </div>
  )
}

function DropZone({ dragging, setDragging, onFile }) {
  const inputRef = useRef(null)
  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={(e) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false)
        const dropped = e.dataTransfer.files?.[0]
        if (dropped) onFile(dropped)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
    >
      <input ref={inputRef} type="file" hidden accept="video/*,audio/*,image/*,.mkv,.mov,.webm,.flac,.m4a,.ogg" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="upload-orb"><UploadCloud size={27} /></div>
      <h2>{dragging ? 'ここにドロップ' : 'ファイルをドロップ'}</h2>
      <p>またはクリックして動画・音声・画像を選択</p>
      <span className="drop-hint">ファイルはアップロードされません</span>
    </div>
  )
}

function CompressionPanel({ targetMB, setTargetMB, customTarget, setCustomTarget, sourceMB, disabled }) {
  return (
    <div className="panel-section">
      <div className="setting-heading">
        <div>
          <span className="setting-label">目標ファイルサイズ</span>
          <p>コンテナ分の余白を見込んでビットレートを自動計算します。</p>
        </div>
      </div>
      <div className="target-grid">
        {targetPresets.map((size) => (
          <button key={size} disabled={disabled} className={!customTarget && targetMB === size ? 'selected' : ''} onClick={() => setTargetMB(size)}>
            <strong>{size}</strong><span>MB</span>{!customTarget && targetMB === size && <Check size={14} />}
          </button>
        ))}
        <label className={`custom-target ${customTarget ? 'selected' : ''}`}>
          <input disabled={disabled} value={customTarget} inputMode="decimal" placeholder="自由" onChange={(e) => setCustomTarget(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span>MB</span>
        </label>
      </div>
      {sourceMB > 0 && sourceMB <= (customTarget ? Number(customTarget) : targetMB) && (
        <div className="already-small"><Check size={15} /> 元ファイルはすでに目標容量以内です。再圧縮せずそのまま出力します。</div>
      )}
    </div>
  )
}

function ConversionPanel({ outputs, outputFormat, setOutputFormat, disabled }) {
  return (
    <div className="panel-section">
      <div className="setting-heading">
        <div>
          <span className="setting-label">出力形式</span>
          <p>入力メディアに合う形式だけを表示しています。</p>
        </div>
      </div>
      <div className="format-grid">
        {outputs.map((item) => (
          <button key={item.value} disabled={disabled} className={outputFormat === item.value ? 'selected' : ''} onClick={() => setOutputFormat(item.value)}>
            <strong>{item.label}</strong>
            {item.note && <span>{item.note}</span>}
            {outputFormat === item.value && <Check size={14} />}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>
}

function Select({ value, onChange, options, disabled }) {
  return (
    <div className="select-wrap">
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} />
    </div>
  )
}

function ResultPanel({ result, originalSize, reduction, onAgain }) {
  return (
    <div className="result-panel">
      <div className="result-top">
        <div className="success-icon"><Check size={20} /></div>
        <div><strong>できました</strong><span>{formatBytes(originalSize)} → {formatBytes(result.size)}{reduction > 0 ? ` · ${reduction}% 小さく` : ''}</span></div>
      </div>
      {result.withinTarget === false && (
        <div className="result-warning">この素材では指定容量を完全には下回れませんでした。より低い解像度でもう一度試せます。</div>
      )}
      <div className="result-actions">
        <a className="download-button" href={result.url} download={result.filename}><ArrowDownToLine size={18} /> ダウンロード</a>
        <button onClick={onAgain}>設定を変えてもう一度</button>
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—'
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

function formatTargetLabel(value) {
  return Number.isFinite(Number(value)) ? `${Number(value)}MB` : '指定容量'
}
