# MediaSqueeze Web

`ffmpeg.wasm` を使い、動画・音声・画像をブラウザ内だけで変換・圧縮する Web UI です。

## 主な機能

- ドラッグ&ドロップ / ファイル選択
- 動画・音声・画像を自動判定
- 10MB / 25MB / 50MB / 100MB / 任意MBを目標に圧縮
- 動画の長さから目標ビットレートを逆算し、コンテナのオーバーヘッドも見込んで圧縮
- 初回出力が指定容量を超えた場合は実測サイズからビットレートを補正して1回だけ自動再圧縮
- MP4 / WebM / MOV / MKV / MP3 / M4A / WAV / OGG / FLAC / GIF などへ変換
- JPG / PNG / WebP の画像変換
- 解像度・品質の詳細設定
- 進捗表示 / キャンセル / ダウンロード
- ファイルはサーバーへアップロードせず、処理はブラウザ内で完結
- COOP / COEP が使える環境では `@ffmpeg/core-mt` を使用し、使えない環境では single-thread core にフォールバック
- ffmpeg.wasm の制限に合わせて 2GB 以上の入力は事前に拒否

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

Vercel Project の Root Directory を `web` に設定します。`vercel.json` で `SharedArrayBuffer` を使うマルチスレッド版に必要な COOP / COEP ヘッダーを設定しています。
