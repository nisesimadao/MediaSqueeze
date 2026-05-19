# MediaSqueeze

Windowsでメディアファイルを手軽に圧縮・変換・リサイズするツール。

動画や音声ファイルを、FFmpegを使ってシンプルなGUIから処理できます。ファイルを選択するだけでなく、Windowsの「プログラムから開く」やドラッグ&ドロップにも対応しているため、エクスプローラーからそのまま素早く変換できます。

小さな操作画面に、WPFのFluentテーマを適用した軽量なデスクトップアプリです。

> 注意: ビルド設定や実行環境によっては、FFmpeg / ffprobe が必要です。Release publishには同梱して使う想定です。

## プロジェクト構成

```text
MediaSqueeze/
├── App.xaml                # アプリ全体のWPF設定・Fluentテーマ
├── App.xaml.cs             # WPFアプリケーションエントリ
├── MainWindow.xaml         # メインGUI
├── MainWindow.xaml.cs      # ファイル受け取り・UI制御
├── Program.cs              # FFmpeg処理ロジック
├── MediaSqueeze.csproj     # .NET / WPFプロジェクト
├── MediaSqueeze.sln        # Visual Studioソリューション
├── Ver2.0/                 # 旧WPF試作版
└── README.md               # このファイル
```

## 特徴

- **「プログラムから開く」対応**: 起動引数で渡されたファイルパスを自動で読み込み
- **ドラッグ&ドロップ対応**: ウィンドウへファイルを落とすだけで選択
- **動画圧縮**: 高品質・中品質・低品質・10MBモードを選択可能
- **形式変換**: MP4 / MOV / MKV / MP3 / M4A / WAV へ変換
- **サイズ変更**: 倍率・幅・高さ指定でアスペクト比を保ったままリサイズ
- **Fluent UI**: `PresentationFramework.Fluent` を使ったWindowsらしい見た目
- **進捗表示**: FFmpeg処理の進行状況をプログレスバーで表示
- **キャンセル対応**: 処理中でもキャンセル可能
- **保存先を開く**: 完了後に出力ファイルをエクスプローラーで選択表示
- **軽量構成**: WPF + FFmpegだけのシンプルな構成

## システム要件

- Windows 10 / Windows 11
- .NET 9 Runtime
- FFmpeg / ffprobe

## インストール

### ビルド済みアプリ

1. [Releases](https://github.com/nisesimadao/MediaSqueeze/releases) から最新版をダウンロード
2. ZIPを展開
3. `MediaSqueeze.exe` を起動

### ソースからビルド

```powershell
# リポジトリを取得
git clone https://github.com/nisesimadao/MediaSqueeze.git
cd MediaSqueeze

# ビルド
dotnet build MediaSqueeze.sln
```

### 配布用にpublish

```powershell
dotnet publish MediaSqueeze.csproj -c Release
```

出力先:

```text
bin/Release/net9.0-windows/publish/
```

## 使い方

### 通常使用

1. `MediaSqueeze.exe` を起動
2. `Select...` からメディアファイルを選択
3. `Mode` で処理内容を選択
4. 必要に応じて品質・形式・サイズ指定を選択
5. `Start` を押して処理開始
6. 完了後、`Show Output` で保存先を開く

### 「プログラムから開く」で使う

1. メディアファイルを右クリック
2. 「プログラムから開く」を選択
3. `MediaSqueeze.exe` を指定
4. 起動時にファイルパスが自動入力されます

### ドラッグ&ドロップ

- ウィンドウへファイルをドラッグ&ドロップすると、そのファイルが処理対象になります

## 設定オプション

### モード

- **Compress**: 動画をMP4として圧縮
- **Convert**: 指定した形式へ変換
- **Resize**: 指定した解像度へリサイズ

### 圧縮品質

- **High**: 高品質
- **Medium**: 標準設定
- **Low**: 容量優先
- **10MB**: 10MB以内を目指すモード

### 変換形式

- **動画**: MP4 / MOV / MKV
- **音声**: MP3 / M4A / WAV

### サイズ指定

- **Original**: 元のサイズを維持
- **Percent**: 元動画に対する倍率で指定
- **Width**: 幅だけを指定し、高さは自動計算
- **Height**: 高さだけを指定し、幅は自動計算

## 技術仕様

### コア技術

- **C# / .NET 9**: アプリケーション本体
- **WPF**: WindowsネイティブGUI
- **PresentationFramework.Fluent**: Fluentテーマ
- **Xabe.FFmpeg**: FFmpeg操作ラッパー
- **FFmpeg / ffprobe**: メディア処理エンジン

### 処理仕様

- 出力ファイルは入力ファイルと同じフォルダに生成
- 既存ファイルがある場合は `_1`, `_2` のように連番を付与
- 圧縮とリサイズの出力形式はMP4
- 幅指定・高さ指定ではFFmpegの `-2` 指定によりアスペクト比を維持
- 倍率指定では幅・高さに同じ倍率を適用し、偶数ピクセルへ丸め
- 変換モードでは選択した拡張子で出力

## トラブルシューティング

### よくある問題

**Q: 起動してもファイルが読み込まれない**

A: 「プログラムから開く」で渡されるパスが実在するファイルか確認してください。フォルダではなくファイルを指定する必要があります。

**Q: 変換に失敗する**

A: `ffmpeg.exe` と `ffprobe.exe` がアプリと同じフォルダにあるか確認してください。

**Q: 10MBモードでも10MBを超える**

A: FFmpegの `-fs 10M` による制限を使っていますが、入力ファイルやコンテナ形式によっては期待通りにならない場合があります。

**Q: 保存先が分からない**

A: 完了後に表示されるパスを確認するか、`Show Output` を押してください。

## 開発メモ

このプロジェクトは、もともとのコンソール版MediaSqueezeをWPF GUI化したものです。`Ver2.0/` には旧WPF試作版が残っていますが、ルートの `MediaSqueeze.csproj` ではビルド対象から除外しています。
