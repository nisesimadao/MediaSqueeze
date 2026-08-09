# MediaSqueeze

FFmpegを使って、動画・音声・画像を圧縮・変換・リサイズするMediaSqueezeのデスクトップ/W​​eb実装です。

- **Windows版**: .NET 9 / WPF。ドラッグ&ドロップ、「プログラムから開く」、進捗・キャンセル・出力表示に対応。
- **Web版**: React + Vite + ffmpeg.wasm。処理はブラウザ内で完結し、PWAのオフライン利用にも対応。

## 特徴

- **動画・音声・画像をCompress**
  - 動画: MP4
  - 音声: AAC / M4A
  - 静止画: WebP
  - High / Medium / Low と容量ターゲットを利用可能
- **FFmpegが実際に対応している出力形式を列挙**
  - 起動中のFFmpegへ `-muxers` / `-encoders` / `-devices` を問い合わせるため、固定された小さな形式リストではありません。
  - 一般によく使う形式を先頭に置き、その後をカテゴリ別に整理します。
- **常識的な優先順**
  - Video: MP4 → MOV → MKV → WebM → AVI → MPEG-TS …
  - Audio: MP3 → M4A/AAC → WAV → FLAC → OGG/Opus …
  - Images: JPEG → PNG → WebP → AVIF → GIF/APNG → TIFF/BMP …
- **カテゴリ分け**
  - Video
  - Audio
  - Images & Animation
  - Streaming & Broadcast
  - Raw / Elementary Streams
  - Subtitles & Data
  - Advanced / Other
- **Resize**: Percent / Width / Height指定。音声では無効。
- **ブラウザの複数ファイル出力**: HLS/DASHなど複数ファイルを生成する形式はZIPにまとめてダウンロード。
- **実ランタイム追従**: FFmpegビルドに存在しないmuxer/encoderは通常の候補として出しません。

> AdvancedのmuxerはFFmpeg側の仕様上、入力ストリーム・codec・追加オプションの組み合わせによっては変換できないものがあります。MediaSqueezeはmuxerを列挙しますが、FFmpeg自身が成立しない組み合わせを拒否する場合があります。

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

## Windows版

### 要件

- Windows 10 / 11
- .NET 9 Runtime
- FFmpeg / ffprobe

アプリフォルダにFFmpegが無い場合、Xabe.FFmpeg Downloaderを使ってセットアップします。

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

## Web版

```bash
cd web
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Web版はffmpeg.wasmのsingle-thread coreを使用します。入力ファイルはサーバーへアップロードせず、ブラウザの仮想ファイルシステム内で処理します。

## Compress

### 動画

High / Medium / Lowではビットレートプリセットを使います。容量指定では動画長からビットレート予算を計算し、音声ストリームの有無も考慮します。

### 音声

AAC / M4Aへ圧縮します。容量指定時は再生時間から音声ビットレートを計算します。

### 静止画

WebPへ圧縮します。High / Medium / Lowでは品質値を変更します。容量指定では品質を段階的に下げ、それでも大きい場合は解像度も縮小してターゲット容量へ寄せます。

## Convert

MediaSqueezeは、実行中FFmpegの以下の情報から候補を構築します。

```text
ffmpeg -hide_banner -muxers
ffmpeg -hide_banner -encoders
ffmpeg -hide_banner -devices
```

そのため「FFmpeg一般が対応しているらしい形式」を決め打ちするのではなく、**その端末/ブラウザで実際に使っているFFmpegビルドが持つ出力muxer**が基準になります。

MP4、MP3、JPEGなど一般的な形式には適切なencoder設定をMediaSqueeze側で用意し、それ以外の高度なmuxerはFFmpegの既定選択を利用します。

## Resize

- **Original**: 元サイズ
- **Percent**: 元サイズに対する倍率
- **Width**: 幅指定、高さ自動
- **Height**: 高さ指定、幅自動

動画/画像で利用できます。音声では利用できません。

## CI

GitHub Actionsで両実装を検証します。

- Windows runner: `.NET 9 / WPF` Release build
- Ubuntu runner: 実FFmpegのmuxer/encoder/device一覧を使った形式カタログ検証
- Web: Vite production build

形式カタログ検証では、MP4・MOV・MKV・WebM・MP3・M4A・WAV・FLAC・JPEG・PNG・WebPなどの主要形式が存在し、一般的な優先順が保たれていることをチェックします。

## 注意

FFmpegの「muxerが存在する」ことと、「どんな入力でもその形式へ自動変換できる」ことは同義ではありません。特にストリーミング、raw stream、字幕/data、特殊コンテナはcodecや追加オプションに制約があります。MediaSqueezeではそれらもAdvanced用途として表示しますが、成立しない組み合わせではFFmpegのエラーを返します。
