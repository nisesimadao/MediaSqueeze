import assert from 'node:assert/strict'
import { localizeCategory, setLocale, t } from './i18n.js'
import { localizeCompatibility, localizeRuntimeMessage } from './runtimeLocalization.js'

setLocale('ja')
assert.equal(t('mode.custom'), 'カスタム')
assert.equal(t('button.download'), '出力をダウンロード')
assert.equal(localizeCategory('Images & Animation'), '画像・アニメーション')
assert.equal(localizeRuntimeMessage('Preparing FFmpeg...'), 'FFmpegを準備しています…')
assert.equal(localizeRuntimeMessage('Processing... High quality'), '高品質で処理しています…')
assert.equal(localizeRuntimeMessage('Checking mp4 compatibility...'), 'mp4 の互換性を確認しています…')
assert.equal(localizeRuntimeMessage('This format requires audio input.'), 'この形式には音声の入力が必要です。')
assert.equal(localizeRuntimeMessage('video will be removed; audio will be removed.'), '動画は除外されます・音声は除外されます')
assert.equal(localizeRuntimeMessage('Unclosed double quote in custom arguments.'), 'カスタム引数内のダブル引用符が閉じられていません。')

const localized = localizeCompatibility({
  level: 'recommended', icon: '★', label: 'Recommended',
  message: 'Common, broadly compatible choice for this input.', canRun: true,
})
assert.equal(localized.label, 'おすすめ')
assert.equal(localized.message, 'この入力に適した、一般的で互換性の高い形式です。')

setLocale('en')
assert.equal(t('mode.custom'), 'Custom')
assert.equal(localizeCategory('Images & Animation'), 'Images & Animation')
assert.equal(localizeRuntimeMessage('Preparing FFmpeg...'), 'Preparing FFmpeg...')

console.log('Localization regression tests passed.')
