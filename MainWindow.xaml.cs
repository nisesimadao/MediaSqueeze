using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media.Animation;
using Microsoft.Win32;

namespace MediaSqueeze;

public partial class MainWindow : Window
{
    private CancellationTokenSource? _cts;
    private string? _lastOutputPath;
    private bool _formatsLoaded;
    private bool _formatsLoading;
    private IReadOnlyList<OutputFormatOption> _outputFormats = MediaProcessor.FallbackOutputFormats;
    private MediaInputProfile? _inputProfile;

    public MainWindow()
    {
        InitializeComponent();
        ApplyLocalization();
        PopulateOutputFormats(_outputFormats);
        CmbMode_SelectionChanged(this, null!);

        if (SystemParameters.ClientAreaAnimation)
        {
            Storyboard titleAnimation = (Storyboard)FindResource("TitleColorAnimation");
            titleAnimation.Begin();
        }
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        string? argumentPath = Environment.GetCommandLineArgs()
            .Skip(1)
            .Select(arg => arg.Trim('"'))
            .FirstOrDefault(File.Exists);

        if (argumentPath is not null)
        {
            await SetInputPathAsync(argumentPath);
        }
    }

    private async void BtnSelect_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = UiText.T("Select media file", "メディアファイルを選択"),
            Filter = UiText.T(
                "Media files|*.mp4;*.mov;*.mkv;*.avi;*.webm;*.mpg;*.mpeg;*.ts;*.mp3;*.m4a;*.aac;*.wav;*.flac;*.ogg;*.opus;*.aiff;*.jpg;*.jpeg;*.png;*.webp;*.avif;*.heic;*.heif;*.bmp;*.tif;*.tiff;*.gif;*.apng|All files|*.*",
                "メディアファイル|*.mp4;*.mov;*.mkv;*.avi;*.webm;*.mpg;*.mpeg;*.ts;*.mp3;*.m4a;*.aac;*.wav;*.flac;*.ogg;*.opus;*.aiff;*.jpg;*.jpeg;*.png;*.webp;*.avif;*.heic;*.heif;*.bmp;*.tif;*.tiff;*.gif;*.apng|すべてのファイル|*.*")
        };

        if (dialog.ShowDialog() == true)
        {
            await SetInputPathAsync(dialog.FileName);
        }
    }

    private async void BtnRun_Click(object sender, RoutedEventArgs e)
    {
        if (!File.Exists(txtFilePath.Text))
        {
            MessageBox.Show(
                UiText.T("Please select a valid file.", "有効なファイルを選択してください。"),
                UiText.T("Error", "エラー"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        if (SelectedMode() == SqueezeMode.Convert)
        {
            await EnsureOutputFormatsLoadedAsync();
        }

        if (!TryBuildRequest(out SqueezeRequest? request))
        {
            return;
        }

        try
        {
            if (request!.Mode == SqueezeMode.Convert)
            {
                _inputProfile ??= await FormatCompatibility.InspectAsync(request.InputPath);
                FormatCompatibilityResult coarse = FormatCompatibility.Assess(request.OutputFormat, _inputProfile);
                if (!coarse.CanRun)
                {
                    string label = UiText.CompatibilityLabel(coarse.Level);
                    string message = UiText.LocalizeCompatibilityMessage(coarse.Message);
                    MessageBox.Show(message, label, MessageBoxButton.OK, MessageBoxImage.Warning);
                    SetStatus($"{label}: {message}");
                    return;
                }

                SetStatus(UiText.T(
                    $"Checking {request.OutputFormat.Muxer} compatibility...",
                    $"{request.OutputFormat.Muxer} の互換性を確認しています…"));
                OutputFormatOption resolved = await FormatCompatibility.ResolveWithFfmpegAsync(request.OutputFormat, _inputProfile);
                FormatCompatibilityResult refined = FormatCompatibility.Assess(resolved, _inputProfile);
                if (!refined.CanRun)
                {
                    string label = UiText.CompatibilityLabel(refined.Level);
                    string message = UiText.LocalizeCompatibilityMessage(refined.Message);
                    MessageBox.Show(message, label, MessageBoxButton.OK, MessageBoxImage.Warning);
                    SetStatus($"{label}: {message}");
                    return;
                }

                request = request with { OutputFormat = resolved };
                string refinedLabel = UiText.CompatibilityLabel(refined.Level);
                string refinedMessage = UiText.LocalizeCompatibilityMessage(refined.Message);
                SetStatus($"{refined.Icon} {refinedLabel}: {refinedMessage}\r\n{UiText.T("Preparing FFmpeg...", "FFmpegを準備しています…")}");
            }

            _cts = new CancellationTokenSource();
            SetProcessingState(true);
            progressBar.Value = 0;
            _lastOutputPath = null;

            var progress = new Progress<ProgressUpdate>(update =>
            {
                progressBar.Value = Math.Clamp(update.Percent, 0, 100);
                SetStatus(UiText.T(
                    $"Processing... {progressBar.Value:0}%",
                    $"処理しています… {progressBar.Value:0}%"));
            });

            string outputPath = await MediaProcessor.ProcessAsync(request!, progress, _cts.Token);
            _lastOutputPath = outputPath;
            progressBar.Value = 100;
            SetStatus($"{UiText.T("Done:", "完了:")}\r\n{outputPath}");
            btnOpenFolder.IsEnabled = true;
        }
        catch (OperationCanceledException)
        {
            SetStatus(UiText.T("Canceled.", "キャンセルしました。"));
        }
        catch (Exception ex)
        {
            string message = UiText.LocalizeRuntimeMessage(ex.Message);
            SetStatus($"{UiText.T("Error:", "エラー:")} {message}");
            MessageBox.Show(message, UiText.T("Error", "エラー"), MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _cts?.Dispose();
            _cts = null;
            SetProcessingState(false);
        }
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        _cts?.Cancel();
    }

    private void BtnOpenFolder_Click(object sender, RoutedEventArgs e)
    {
        if (_lastOutputPath is null || !File.Exists(_lastOutputPath))
        {
            return;
        }

        Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{_lastOutputPath}\"")
        {
            UseShellExecute = true
        });
    }

    private async void Window_Drop(object sender, DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            return;
        }

        string[] files = (string[])e.Data.GetData(DataFormats.FileDrop)!;
        if (files.FirstOrDefault(File.Exists) is { } path)
        {
            await SetInputPathAsync(path);
        }
    }

    private async void CmbMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (cmbQuality is null || cmbOutputFormat is null || txtFixedOutput is null ||
            cmbScaleMode is null || txtScaleValue is null)
        {
            return;
        }

        SqueezeMode mode = SelectedMode();
        cmbQuality.Visibility = mode == SqueezeMode.Compress ? Visibility.Visible : Visibility.Collapsed;
        cmbOutputFormat.Visibility = mode == SqueezeMode.Convert ? Visibility.Visible : Visibility.Collapsed;
        txtFixedOutput.Visibility = mode == SqueezeMode.Resize ? Visibility.Visible : Visibility.Collapsed;
        txtOptionLabel.Content = mode switch
        {
            SqueezeMode.Compress => UiText.T("Quality", "品質"),
            SqueezeMode.Convert => UiText.T("Format", "形式"),
            _ => UiText.T("Output", "出力")
        };
        cmbScaleMode.IsEnabled = mode != SqueezeMode.Convert;
        txtScaleValue.IsEnabled = mode != SqueezeMode.Convert && SelectedScaleMode() != ScaleMode.Original;
        txtScaleLabel.Foreground = mode == SqueezeMode.Convert ? SystemColors.GrayTextBrush : SystemColors.ControlTextBrush;
        txtScaleHint.Text = mode == SqueezeMode.Convert
            ? UiText.T("Not used for Convert.", "変換モードでは使用しません。")
            : UiText.T("Keeps aspect ratio.", "縦横比を維持します。");

        if (mode == SqueezeMode.Resize && SelectedScaleMode() == ScaleMode.Original)
        {
            SelectScaleMode(ScaleMode.Percent);
            txtScaleValue.Text = "50";
        }

        if (mode == SqueezeMode.Convert)
        {
            await EnsureOutputFormatsLoadedAsync();
            PopulateOutputFormats(_outputFormats);
        }
    }

    private void CmbScaleMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (txtScaleValue is null || txtScaleHint is null)
        {
            return;
        }

        ScaleMode scaleMode = SelectedScaleMode();
        txtScaleValue.IsEnabled = SelectedMode() != SqueezeMode.Convert && scaleMode != ScaleMode.Original;
        txtScaleValue.Text = scaleMode switch
        {
            ScaleMode.Percent when !int.TryParse(txtScaleValue.Text, out _) => "50",
            ScaleMode.Width when !int.TryParse(txtScaleValue.Text, out _) => "1280",
            ScaleMode.Height when !int.TryParse(txtScaleValue.Text, out _) => "720",
            _ => txtScaleValue.Text
        };
        txtScaleHint.Text = scaleMode switch
        {
            ScaleMode.Percent => UiText.T("Example: 50 means half size.", "例: 50 で縦横を半分にします。"),
            ScaleMode.Width => UiText.T("Height is calculated automatically.", "高さは縦横比を保って自動計算します。"),
            ScaleMode.Height => UiText.T("Width is calculated automatically.", "幅は縦横比を保って自動計算します。"),
            _ => UiText.T("Keeps original size.", "元のサイズを維持します。")
        };
    }

    private async Task EnsureOutputFormatsLoadedAsync()
    {
        if (_formatsLoaded || _formatsLoading)
        {
            return;
        }

        _formatsLoading = true;
        bool wasEnabled = cmbOutputFormat.IsEnabled;
        cmbOutputFormat.IsEnabled = false;
        try
        {
            _outputFormats = await MediaProcessor.GetOutputFormatsAsync();
            PopulateOutputFormats(_outputFormats);
            _formatsLoaded = true;
        }
        catch (Exception ex)
        {
            _outputFormats = MediaProcessor.FallbackOutputFormats;
            PopulateOutputFormats(_outputFormats);
            Debug.WriteLine($"Could not enumerate FFmpeg output formats: {ex}");
        }
        finally
        {
            _formatsLoading = false;
            cmbOutputFormat.IsEnabled = wasEnabled;
        }
    }

    private void PopulateOutputFormats(IReadOnlyList<OutputFormatOption> formats)
    {
        if (cmbOutputFormat is null)
        {
            return;
        }

        string? previousId = SelectedOutputFormat()?.Id;
        cmbOutputFormat.Items.Clear();

        foreach (IGrouping<string, OutputFormatOption> group in formats.GroupBy(format => format.Category))
        {
            cmbOutputFormat.Items.Add(new ComboBoxItem
            {
                Content = UiText.Category(group.Key),
                IsEnabled = false,
                Focusable = false,
                FontWeight = FontWeights.Bold,
                Foreground = SystemColors.GrayTextBrush
            });

            foreach (OutputFormatOption format in group)
            {
                FormatCompatibilityResult? compatibility = _inputProfile is null
                    ? null
                    : FormatCompatibility.Assess(format, _inputProfile);

                string description = string.IsNullOrWhiteSpace(format.Description)
                    ? $"FFmpeg muxer: {format.Muxer}"
                    : $"{format.Description}\nFFmpeg muxer: {format.Muxer}";
                string tooltip = compatibility is null
                    ? description
                    : $"{compatibility.Icon} {UiText.CompatibilityLabel(compatibility.Level)}: {UiText.LocalizeCompatibilityMessage(compatibility.Message)}\n{description}";

                cmbOutputFormat.Items.Add(new ComboBoxItem
                {
                    Content = FormatCompatibility.DecoratedLabel(format, _inputProfile),
                    Tag = format,
                    IsEnabled = compatibility?.CanRun ?? true,
                    ToolTip = tooltip
                });
            }
        }

        string preferredId = previousId is not null && formats.Any(format => format.Id == previousId && (_inputProfile is null || FormatCompatibility.Assess(format, _inputProfile).CanRun))
            ? previousId
            : FormatCompatibility.PreferredFormatId(_inputProfile, formats);

        ComboBoxItem? selected = cmbOutputFormat.Items
            .OfType<ComboBoxItem>()
            .FirstOrDefault(item => item.IsEnabled && item.Tag is OutputFormatOption format && format.Id == preferredId)
            ?? cmbOutputFormat.Items
                .OfType<ComboBoxItem>()
                .FirstOrDefault(item => item.IsEnabled && item.Tag is OutputFormatOption);

        if (selected is not null)
        {
            cmbOutputFormat.SelectedItem = selected;
        }
    }

    private bool TryBuildRequest(out SqueezeRequest? request)
    {
        SqueezeMode mode = SelectedMode();
        string quality = SelectedTag(cmbQuality, "medium");
        OutputFormatOption outputFormat = SelectedOutputFormat()
            ?? MediaProcessor.FallbackOutputFormats.First(format => format.Id == "mp4");
        ScaleMode scaleMode = SelectedScaleMode();
        int scaleValue = 0;

        if (mode == SqueezeMode.Resize && scaleMode == ScaleMode.Original)
        {
            MessageBox.Show(
                UiText.T("Choose Percent, Width, or Height for Resize mode.", "リサイズでは「倍率」「幅」「高さ」のいずれかを選択してください。"),
                UiText.T("Size required", "サイズ指定が必要です"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            cmbScaleMode.Focus();
            cmbScaleMode.IsDropDownOpen = true;
            request = null;
            return false;
        }

        if (scaleMode != ScaleMode.Original &&
            (!int.TryParse(txtScaleValue.Text.Trim(), out scaleValue) || scaleValue <= 0))
        {
            MessageBox.Show(
                UiText.T("Enter a positive number for Size.", "サイズには正の数値を入力してください。"),
                UiText.T("Invalid size", "無効なサイズ"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            txtScaleValue.Focus();
            txtScaleValue.SelectAll();
            request = null;
            return false;
        }

        if (scaleMode == ScaleMode.Percent && scaleValue > 400)
        {
            MessageBox.Show(
                UiText.T("Percent must be 400 or lower.", "倍率は400%以下にしてください。"),
                UiText.T("Invalid percent", "無効な倍率"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            txtScaleValue.Focus();
            txtScaleValue.SelectAll();
            request = null;
            return false;
        }

        request = new SqueezeRequest(txtFilePath.Text, mode, quality, outputFormat, scaleMode, scaleValue);
        return true;
    }

    private SqueezeMode SelectedMode()
    {
        return SelectedTag(cmbMode, "compress") switch
        {
            "convert" => SqueezeMode.Convert,
            "resize" => SqueezeMode.Resize,
            _ => SqueezeMode.Compress
        };
    }

    private static string SelectedTag(ComboBox comboBox, string fallback)
    {
        return (comboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? fallback;
    }

    private OutputFormatOption? SelectedOutputFormat()
    {
        return (cmbOutputFormat.SelectedItem as ComboBoxItem)?.Tag as OutputFormatOption;
    }

    private ScaleMode SelectedScaleMode()
    {
        return SelectedTag(cmbScaleMode, "original") switch
        {
            "percent" => ScaleMode.Percent,
            "width" => ScaleMode.Width,
            "height" => ScaleMode.Height,
            _ => ScaleMode.Original
        };
    }

    private void SelectScaleMode(ScaleMode scaleMode)
    {
        string tag = scaleMode switch
        {
            ScaleMode.Percent => "percent",
            ScaleMode.Width => "width",
            ScaleMode.Height => "height",
            _ => "original"
        };

        foreach (ComboBoxItem item in cmbScaleMode.Items)
        {
            if (item.Tag?.ToString() == tag)
            {
                cmbScaleMode.SelectedItem = item;
                return;
            }
        }
    }

    private async Task SetInputPathAsync(string path)
    {
        txtFilePath.Text = path;
        btnOpenFolder.IsEnabled = false;
        _lastOutputPath = null;
        _inputProfile = null;
        SetStatus($"{UiText.T("Selected:", "選択済み:")}\r\n{path}\r\n\r\n{UiText.T("Analyzing media...", "メディアを解析しています…")}");

        try
        {
            _inputProfile = await FormatCompatibility.InspectAsync(path);
            PopulateOutputFormats(_outputFormats);
            string streams = DescribeInputProfile(_inputProfile);
            string legend = UiText.T(
                "★ recommended  ✓ compatible  △ drops streams  ⚙ special  × unsupported",
                "★ おすすめ  ✓ 互換  △ 一部除外  ⚙ 特殊  × 非対応");
            SetStatus($"{UiText.T("Selected:", "選択済み:")}\r\n{path}\r\n\r\n{streams}\r\n{legend}");
        }
        catch (Exception ex)
        {
            PopulateOutputFormats(_outputFormats);
            string message = UiText.LocalizeRuntimeMessage(ex.Message);
            SetStatus($"{UiText.T("Selected:", "選択済み:")}\r\n{path}\r\n\r\n{UiText.T("Could not pre-check formats:", "形式の事前確認に失敗しました:")} {message}");
        }
    }

    private static string DescribeInputProfile(MediaInputProfile profile)
    {
        var parts = new List<string> { UiText.Kind(profile.Kind) };
        if (!string.IsNullOrWhiteSpace(profile.VideoCodec)) parts.Add($"{UiText.T("video", "動画")} {profile.VideoCodec}");
        if (!string.IsNullOrWhiteSpace(profile.AudioCodec)) parts.Add($"{UiText.T("audio", "音声")} {profile.AudioCodec}");
        return string.Join("  •  ", parts);
    }

    private void SetStatus(string message)
    {
        txtStatus.Text = UiText.LocalizeRuntimeMessage(message);
    }

    private void SetProcessingState(bool isProcessing)
    {
        btnRun.IsEnabled = !isProcessing;
        btnSelect.IsEnabled = !isProcessing;
        btnCancel.IsEnabled = isProcessing;
        btnOpenFolder.IsEnabled = !isProcessing && _lastOutputPath is not null && File.Exists(_lastOutputPath);
        cmbMode.IsEnabled = !isProcessing;
        cmbQuality.IsEnabled = !isProcessing;
        cmbOutputFormat.IsEnabled = !isProcessing && !_formatsLoading;
        cmbScaleMode.IsEnabled = !isProcessing && SelectedMode() != SqueezeMode.Convert;
        txtScaleValue.IsEnabled = !isProcessing && SelectedMode() != SqueezeMode.Convert && SelectedScaleMode() != ScaleMode.Original;
    }
}
