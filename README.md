# MediaSqueeze

MediaSqueeze は、FFmpeg を使って動画、音声、画像を圧縮、変換、リサイズするアプリです。
Windows 向けデスクトップ版と Web 版があります。

- **Windows 版**：.NET 9 / WPF で実装しています。
  ドラッグ＆ドロップ、「プログラムから開く」、進捗表示、キャンセル、出力表示に対応します。
- **Web 版**：React + Vite + ffmpeg.wasm で実装しています。
  処理はブラウザ内で完結し、PWA のオフライン利用にも対応します。

## 特徴

- **動画、音声、画像の圧縮**
  - 動画：MP4
  - 音声：AAC / M4A
  - 静止画：WebP
  - High / Medium / Low のプリセットと、目標容量を指定できます。
- **実行中の FFmpeg が対応する出力形式を列挙**
  - 起動中の FFmpeg に `-muxers` / `-encoders` / `-devices` を問い合わせるため、固定した形式一覧には依存しません。
  - 一般的な形式を先に表示し、その後をカテゴリ別に整理します。
- **一般的な形式を優先して表示**
  - Video：MP4 → MOV → MKV → WebM → AVI → MPEG-TS …
  - Audio：MP3 → M4A/AAC → WAV → FLAC → OGG/Opus …
  - Images：JPEG → PNG → WebP → AVIF → GIF/APNG → TIFF/BMP …
- **カテゴリ分け**
  - Video
  - Audio
  - Images & Animation
  - Streaming & Broadcast
  - Raw / Elementary Streams
  - Subtitles & Data
  - Advanced / Other
- **Resize**：Percent / Width / Height を指定できます。
  音声では無効です。
- **ブラウザの複数ファイル出力**：HLS や DASH など、複数ファイルを生成する形式は ZIP にまとめてダウンロードします。
- **実ランタイムへの追従**：使用中の FFmpeg ビルドに存在しない muxer や encoder は、通常の候補として表示しません。

> Advanced に含まれる muxer は、入力ストリーム、codec、追加オプションの組み合わせによって変換できない場合があります。
> MediaSqueeze は利用可能な muxer を列挙しますが、成立しない組み合わせは FFmpeg 自身が拒否します。

## プロジェクト構成

```text
MediaSqueeze/
├── App.xaml
├── App.xaml.cs
├── MainWindow.xaml
├── MainWindow.xaml.cs
├── Program.cs             # Desktop FFmpeg処理
├── FormatCatalog.cs       # Desktopの動的出力形式カタログ
├── MediaSqueeze.csproj
├── MediaSqueeze.sln
├── web/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── mediaEngine.js
│   │   └── formatCatalog.js
│   └── public/
│       └── service-worker.js
└── README.md
```

## Windows 版

### 要件

- Windows 10 / 11
- .NET 9 Runtime
- FFmpeg / ffprobe

アプリフォルダに FFmpeg がない場合は、Xabe.FFmpeg Downloader を使ってセットアップします。

### ビルド

```powershell
git clone https://github.com/nisesimadao/MediaSqueeze.git
cd MediaSqueeze
dotnet build MediaSqueeze.sln
```

### Publish

```powershell
dotnet publish MediaSqueeze.csproj -c Release
```

## Web 版

```bash
cd web
npm install
npm run dev
```

本番用ビルドは次のコマンドで作成します。

```bash
npm run build
```

Web 版は ffmpeg.wasm の single-thread core を使用します。
入力ファイルはサーバーへアップロードせず、ブラウザの仮想ファイルシステム内で処理します。

## Compress

### 動画

High / Medium / Low ではビットレートプリセットを使用します。
目標容量を指定した場合は、動画の長さと音声ストリームの有無からビットレート予算を計算します。

### 音声

AAC / M4A へ圧縮します。
目標容量を指定した場合は、再生時間から音声ビットレートを計算します。

### 静止画

WebP へ圧縮します。
High / Medium / Low では品質値を変更します。
目標容量を指定した場合は品質を段階的に下げ、それでも容量を超える場合は解像度も縮小します。

## Convert

MediaSqueeze は、実行中の FFmpeg から次の情報を取得して出力候補を構築します。

```text
ffmpeg -hide_banner -muxers
ffmpeg -hide_banner -encoders
ffmpeg -hide_banner -devices
```

そのため、一般的な FFmpeg の対応形式を固定リストとして持つのではなく、その環境で実際に使用している FFmpeg ビルドの出力 muxer を基準にします。

MP4、MP3、JPEG などの一般的な形式には MediaSqueeze 側で encoder 設定を用意します。
それ以外の高度な muxer では、FFmpeg の既定選択を利用します。

## Resize

- **Original**：元のサイズを維持します。
- **Percent**：元サイズに対する倍率を指定します。
- **Width**：幅を指定し、高さは自動計算します。
- **Height**：高さを指定し、幅は自動計算します。

動画と画像で利用できます。
音声では利用できません。

## CI

GitHub Actions でデスクトップ版と Web 版を検証します。

- Windows runner：`.NET 9 / WPF` の Release ビルド。
- Ubuntu runner：実際の FFmpeg の muxer / encoder / device 一覧を使った形式カタログの検証。
- Web：Vite の production build。

形式カタログの検証では、MP4、MOV、MKV、WebM、MP3、M4A、WAV、FLAC、JPEG、PNG、WebP などの主要形式が存在し、指定した優先順が保たれていることを確認します。

## 注意

FFmpeg で muxer が利用できることと、任意の入力をその形式へ自動変換できることは別です。
ストリーミング、raw stream、字幕やデータ、特殊コンテナでは、codec や追加オプションに制約があります。
MediaSqueeze はこれらを Advanced 用途として表示しますが、成立しない組み合わせでは FFmpeg のエラーをそのまま返します。
