using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using FFMpegCore;
using FFMpegCore.Enums;

namespace MediaSqueeze
{
    public partial class MainWindow : Window
    {
        private ObservableCollection<MediaFile> mediaFiles;
        private bool isConverting = false;

        public MainWindow()
        {
            InitializeComponent();
            InitializeApplication();
        }

        private async void InitializeApplication()
        {
            mediaFiles = new ObservableCollection<MediaFile>();
            FileListView.ItemsSource = mediaFiles;
            
            // デフォルト出力フォルダを設定
            OutputFolderTextBox.Text = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "MediaSqueeze出力");
            
            // デフォルト設定
            OutputFormatCombo.SelectedIndex = 0; // MP4
            
            LogMessage("MediaSqueezeが開始されました。");
            LogMessage("FFmpegバイナリを確認中...");
            
            try
            {
                // FFMpegCoreのFFmpegバイナリパスを設定
                await Task.Run(() => FFMpegOptions.Configure(new FFMpegOptions { BinaryFolder = GetFFmpegBinaryPath() }));
                LogMessage("FFmpegバイナリが正常に設定されました。");
            }
            catch (Exception ex)
            {
                LogMessage($"FFmpeg設定エラー: {ex.Message}");
                MessageBox.Show("FFmpegの初期化に失敗しました。アプリケーションを再起動してください。", "エラー", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private string GetFFmpegBinaryPath()
        {
            // FFMpegCoreが自動的にバイナリを管理するためのパスを取得
            string appDataPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MediaSqueeze");
            Directory.CreateDirectory(appDataPath);
            return appDataPath;
        }

        #region ファイル操作

        private void AddFiles_Click(object sender, RoutedEventArgs e)
        {
            OpenFileDialog openFileDialog = new OpenFileDialog
            {
                Title = "変換するファイルを選択",
                Filter = "すべてのメディアファイル|*.mp4;*.avi;*.mov;*.mkv;*.mp3;*.wav;*.flac;*.aac;*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp|" +
                        "動画ファイル|*.mp4;*.avi;*.mov;*.mkv;*.wmv;*.flv|" +
                        "音声ファイル|*.mp3;*.wav;*.flac;*.aac;*.ogg;*.wma|" +
                        "画像ファイル|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.tiff|" +
                        "すべてのファイル|*.*",
                Multiselect = true
            };

            if (openFileDialog.ShowDialog() == true)
            {
                foreach (string fileName in openFileDialog.FileNames)
                {
                    AddMediaFile(fileName);
                }
            }
        }

        private void FileListView_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                string[] files = (string[])e.Data.GetData(DataFormats.FileDrop);
                foreach (string file in files)
                {
                    AddMediaFile(file);
                }
            }
        }

        private void FileListView_DragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.Copy;
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
        }

        private void AddMediaFile(string filePath)
        {
            if (File.Exists(filePath))
            {
                var existingFile = mediaFiles.FirstOrDefault(f => f.FilePath == filePath);
                if (existingFile == null)
                {
                    var mediaFile = new MediaFile
                    {
                        FilePath = filePath,
                        FileName = Path.GetFileName(filePath),
                        Format = Path.GetExtension(filePath).ToUpper().Replace(".", ""),
                        FileSize = FormatFileSize(new FileInfo(filePath).Length),
                        Status = "待機中"
                    };
                    mediaFiles.Add(mediaFile);
                    LogMessage($"ファイルが追加されました: {mediaFile.FileName}");
                }
            }
        }

        private void Clear_Click(object sender, RoutedEventArgs e)
        {
            if (!isConverting)
            {
                mediaFiles.Clear();
                LogMessage("ファイルリストがクリアされました。");
            }
        }

        private void FileListView_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            // 選択されたファイルの詳細情報を表示する場合はここに実装
        }

        #endregion

        #region 変換処理

        private async void Convert_Click(object sender, RoutedEventArgs e)
        {
            if (isConverting)
            {
                MessageBox.Show("変換処理が実行中です。", "情報", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            if (mediaFiles.Count == 0)
            {
                MessageBox.Show("変換するファイルがありません。", "エラー", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            if (OutputFormatCombo.SelectedItem == null)
            {
                MessageBox.Show("出力形式を選択してください。", "エラー", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            // 出力フォルダの作成
            string outputFolder = OutputFolderTextBox.Text;
            if (!Directory.Exists(outputFolder))
            {
                try
                {
                    Directory.CreateDirectory(outputFolder);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"出力フォルダの作成に失敗しました: {ex.Message}", "エラー", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }
            }

            isConverting = true;
            ConvertBtn.Content = "変換中...";
            ConvertBtn.IsEnabled = false;

            try
            {
                await ConvertFiles();
            }
            catch (Exception ex)
            {
                LogMessage($"変換エラー: {ex.Message}");
                MessageBox.Show($"変換中にエラーが発生しました: {ex.Message}", "エラー", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                isConverting = false;
                ConvertBtn.Content = "変換開始";
                ConvertBtn.IsEnabled = true;
                ProgressBar.Value = 0;
                ProgressText.Text = "完了";
            }
        }

        private async Task ConvertFiles()
        {
            int totalFiles = mediaFiles.Count;
            int currentFile = 0;

            foreach (var mediaFile in mediaFiles)
            {
                currentFile++;
                ProgressBar.Value = (double)currentFile / totalFiles * 100;
                ProgressText.Text = $"{currentFile}/{totalFiles}";

                mediaFile.Status = "変換中";
                LogMessage($"変換開始: {mediaFile.FileName}");

                try
                {
                    string outputPath = GenerateOutputPath(mediaFile);
                    
                    LogMessage($"出力パス: {outputPath}");

                    await ConvertFileWithFFMpegCore(mediaFile.FilePath, outputPath);

                    if (File.Exists(outputPath))
                    {
                        mediaFile.Status = "完了";
                        LogMessage($"変換完了: {Path.GetFileName(outputPath)}");

                        // 元ファイルの削除オプション
                        if (DeleteOriginalCheckBox.IsChecked == true)
                        {
                            File.Delete(mediaFile.FilePath);
                            LogMessage($"元ファイルを削除: {mediaFile.FileName}");
                        }
                    }
                    else
                    {
                        mediaFile.Status = "失敗";
                        LogMessage($"変換失敗: {mediaFile.FileName}");
                    }
                }
                catch (Exception ex)
                {
                    mediaFile.Status = "エラー";
                    LogMessage($"エラー: {mediaFile.FileName} - {ex.Message}");
                }

                // UIの更新
                Application.Current.Dispatcher.Invoke(() =>
                {
                    FileListView.Items.Refresh();
                });
            }
        }

        private async Task ConvertFileWithFFMpegCore(string inputPath, string outputPath)
        {
            string outputFormat = ((ComboBoxItem)OutputFormatCombo.SelectedItem).Tag.ToString();
            string quality = ((ComboBoxItem)QualityCombo.SelectedItem).Tag.ToString();
            string resolution = ((ComboBoxItem)ResolutionCombo.SelectedItem).Tag.ToString();

            var mediaInfo = await FFProbe.AnalyseAsync(inputPath);
            LogMessage($"入力ファイル情報: {mediaInfo.Duration}, {mediaInfo.PrimaryVideoStream?.Width}x{mediaInfo.PrimaryVideoStream?.Height}");

            var conversion = FFMpegArguments.FromFileInput(inputPath);

            if (IsVideoFormat(outputFormat))
            {
                conversion = conversion.OutputToFile(outputPath, true, options => ConfigureVideoOptions(options, quality, resolution, outputFormat));
            }
            else if (IsAudioFormat(outputFormat))
            {
                conversion = conversion.OutputToFile(outputPath, true, options => ConfigureAudioOptions(options, quality, outputFormat));
            }
            else if (IsImageFormat(outputFormat))
            {
                conversion = conversion.OutputToFile(outputPath, true, options => ConfigureImageOptions(options, quality, resolution, outputFormat));
            }

            await conversion.ProcessAsynchronously();
        }

        private Action<FFMpegArgumentOptions> ConfigureVideoOptions(FFMpegArgumentOptions options, string quality, string resolution, string format)
        {
            return options =>
            {
                // 解像度設定
                if (resolution != "original")
                {
                    var parts = resolution.Split('x');
                    if (parts.Length == 2 && int.TryParse(parts[0], out int width) && int.TryParse(parts[1], out int height))
                    {
                        options.Resize(width, height);
                    }
                }

                // コーデック設定
                switch (format.ToLower())
                {
                    case "mp4":
                        options.WithVideoCodec(VideoCodec.LibX264);
                        break;
                    case "avi":
                        options.WithVideoCodec(VideoCodec.LibXvid);
                        break;
                    case "mov":
                        options.WithVideoCodec(VideoCodec.LibX264);
                        break;
                }

                // 品質設定
                switch (quality)
                {
                    case "high":
                        options.WithConstantRateFactor(18);
                        break;
                    case "medium":
                        options.WithConstantRateFactor(23);
                        break;
                    case "normal":
                        options.WithConstantRateFactor(28);
                        break;
                    case "low":
                        options.WithConstantRateFactor(32);
                        break;
                    case "custom":
                        if (int.TryParse(BitrateTextBox.Text, out int bitrate))
                        {
                            options.WithVideoBitrate(bitrate);
                        }
                        break;
                }

                // カスタムパラメータ
                if (!string.IsNullOrEmpty(CustomParamsTextBox.Text))
                {
                    options.WithCustomArgument(CustomParamsTextBox.Text);
                }
            };
        }

        private Action<FFMpegArgumentOptions> ConfigureAudioOptions(FFMpegArgumentOptions options, string quality, string format)
        {
            return options =>
            {
                // コーデック設定
                switch (format.ToLower())
                {
                    case "mp3":
                        options.WithAudioCodec(AudioCodec.LibMp3Lame);
                        break;
                    case "flac":
                        options.WithAudioCodec(AudioCodec.Flac);
                        break;
                    case "wav":
                        options.WithAudioCodec(AudioCodec.PcmS16Le);
                        break;
                }

                // 品質設定
                switch (quality)
                {
                    case "high":
                        options.WithAudioBitrate(320);
                        break;
                    case "medium":
                        options.WithAudioBitrate(192);
                        break;
                    case "normal":
                        options.WithAudioBitrate(128);
                        break;
                    case "low":
                        options.WithAudioBitrate(96);
                        break;
                    case "custom":
                        if (int.TryParse(BitrateTextBox.Text, out int bitrate))
                        {
                            options.WithAudioBitrate(bitrate);
                        }
                        break;
                }

                // カスタムパラメータ
                if (!string.IsNullOrEmpty(CustomParamsTextBox.Text))
                {
                    options.WithCustomArgument(CustomParamsTextBox.Text);
                }
            };
        }

        private Action<FFMpegArgumentOptions> ConfigureImageOptions(FFMpegArgumentOptions options, string quality, string resolution, string format)
        {
            return options =>
            {
                // 解像度設定
                if (resolution != "original")
                {
                    var parts = resolution.Split('x');
                    if (parts.Length == 2 && int.TryParse(parts[0], out int width) && int.TryParse(parts[1], out int height))
                    {
                        options.Resize(width, height);
                    }
                }

                // 品質設定
                switch (format.ToLower())
                {
                    case "jpg":
                    case "jpeg":
                        options.WithCustomArgument("-q:v 2");
                        break;
                    case "webp":
                        options.WithCustomArgument("-quality 85");
                        break;
                }

                // カスタムパラメータ
                if (!string.IsNullOrEmpty(CustomParamsTextBox.Text))
                {
                    options.WithCustomArgument(CustomParamsTextBox.Text);
                }
            };
        }

        private string GenerateOutputPath(MediaFile mediaFile)
        {
            string outputFolder = OutputFolderTextBox.Text;
            string outputFormat = ((ComboBoxItem)OutputFormatCombo.SelectedItem).Tag.ToString();
            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(mediaFile.FilePath);
            string outputFileName = $"{fileNameWithoutExt}_squeezed.{outputFormat}";
            string outputPath = Path.Combine(outputFolder, outputFileName);

            // 同名ファイルが存在する場合の処理
            if (File.Exists(outputPath) && OverwriteCheckBox.IsChecked != true)
            {
                int counter = 1;
                string baseName = Path.GetFileNameWithoutExtension(outputPath).Replace("_squeezed", "");
                string extension = Path.GetExtension(outputPath);
                do
                {
                    outputFileName = $"{baseName}_squeezed_{counter}{extension}";
                    outputPath = Path.Combine(outputFolder, outputFileName);
                    counter++;
                } while (File.Exists(outputPath));
            }

            return outputPath;
        }

        #endregion

        #region ヘルパーメソッド

        private bool IsVideoFormat(string format)
        {
            return new[] { "mp4", "avi", "mov", "mkv", "wmv", "flv" }.Contains(format.ToLower());
        }

        private bool IsAudioFormat(string format)
        {
            return new[] { "mp3", "wav", "flac", "aac", "ogg", "wma" }.Contains(format.ToLower());
        }

        private bool IsImageFormat(string format)
        {
            return new[] { "jpg", "jpeg", "png", "bmp", "gif", "webp", "tiff" }.Contains(format.ToLower());
        }

        private string FormatFileSize(long bytes)
        {
            string[] sizes = { "B", "KB", "MB", "GB", "TB" };
            double len = bytes;
            int order = 0;
            while (len >= 1024 && order < sizes.Length - 1)
            {
                order++;
                len = len / 1024;
            }
            return $"{len:0.##} {sizes[order]}";
        }

        private void LogMessage(string message)
        {
            Application.Current.Dispatcher.Invoke(() =>
            {
                string timestamp = DateTime.Now.ToString("HH:mm:ss");
                LogTextBox.AppendText($"[{timestamp}] {message}\n");
                LogTextBox.ScrollToEnd();
            });
        }

        #endregion

        #region UI イベント

        private void Browse_Click(object sender, RoutedEventArgs e)
        {
            var folderDialog = new System.Windows.Forms.FolderBrowserDialog();
            folderDialog.Description = "出力フォルダを選択してください";
            folderDialog.SelectedPath = OutputFolderTextBox.Text;

            if (folderDialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                OutputFolderTextBox.Text = folderDialog.SelectedPath;
            }
        }

        #endregion
    }

    // メディアファイル情報クラス
    public class MediaFile : INotifyPropertyChanged
    {
        private string _status;

        public string FilePath { get; set; }
        public string FileName { get; set; }
        public string Format { get; set; }
        public string FileSize { get; set; }
        
        public string Status
        {
            get { return _status; }
            set
            {
                _status = value;
                OnPropertyChanged(nameof(Status));
            }
        }

        public event PropertyChangedEventHandler PropertyChanged;

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }
}