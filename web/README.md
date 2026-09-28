# MediaSqueeze Web

`ffmpeg.wasm` を使い、動画、音声、画像をブラウザ内で変換または圧縮する Web UI です。
入力ファイルはサーバーへアップロードせず、処理はブラウザ内で完結します。

## 主な機能

- ドラッグ＆ドロップとファイル選択に対応します。
- 動画、音声、画像を自動判定します。
- 10 MB / 25 MB / 50 MB / 100 MB または任意の容量を目標として圧縮できます。
- 動画の長さから目標ビットレートを計算し、コンテナのオーバーヘッドも見込んで圧縮します。
- 初回出力が指定容量を超えた場合は、実測サイズを基にビットレートを補正し、1 回だけ自動で再圧縮します。
- MP4 / WebM / MOV / MKV / MP3 / M4A / WAV / OGG / FLAC / GIF などへ変換できます。
- JPG / PNG / WebP の画像変換に対応します。
- 解像度と品質を個別に設定できます。
- 進捗表示、キャンセル、ダウンロードに対応します。
- COOP / COEP が利用できる環境では `@ffmpeg/core-mt` を使用し、利用できない場合は single-thread core へフォールバックします。
- ffmpeg.wasm の制限に合わせ、2 GB 以上の入力ファイルは処理前に拒否します。

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## Vercel

Vercel Project の Root Directory を `web` に設定します。
`vercel.json` では、`SharedArrayBuffer` を使うマルチスレッド版に必要な COOP / COEP ヘッダーを設定しています。
