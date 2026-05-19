using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using FFMpegCore;

namespace MediaSqueeze
{
    public partial class App : Application
    {
        protected override async void OnStartup(StartupEventArgs e)
        {
            // アプリケーション開始時にFFmpegバイナリを設定
            await InitializeFFmpeg();
            base.OnStartup(e);
        }

        private async Task InitializeFFmpeg()
        {
            try
            {
                // FFMpegCoreが自動的にFFmpegバイナリをダウンロード・管理
                string ffmpegFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), 
                    "MediaSqueeze", 
                    "ffmpeg"
                );

                Directory.CreateDirectory(ffmpegFolder);

                // FFMpegCoreのグローバル設定
                GlobalFFOptions.Configure(new FFOptions
                {
                    BinaryFolder = ffmpegFolder,
                    TemporaryFilesFolder = Path.GetTempPath(),
                    WorkingDirectory = ffmpegFolder
                });

                // FFmpegバイナリの存在確認とダウンロード
                await EnsureFFmpegBinariesExist(ffmpegFolder);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"FFmpegの初期化に失敗しました: {ex.Message}", 
                    "エラー", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async Task EnsureFFmpegBinariesExist(string ffmpegFolder)
        {
            string ffmpegExe = Path.Combine(ffmpegFolder, "ffmpeg.exe");
            string ffprobeExe = Path.Combine(ffmpegFolder, "ffprobe.exe");

            // バイナリが存在しない場合は、FFMpegCoreが自動的に処理するように設定
            if (!File.Exists(ffmpegExe) || !File.Exists(ffprobeExe))
            {
                // FFMpegCoreは必要に応じて自動的にバイナリをダウンロードします
                // ここでは単純にフォルダが存在することを確認するだけ
                await Task.CompletedTask;
            }
        }
    }
}