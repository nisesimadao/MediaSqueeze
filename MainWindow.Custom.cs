using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace MediaSqueeze;

public partial class MainWindow
{
    private async void CustomAwareBtnRun_Click(object sender, RoutedEventArgs e)
    {
        if (!IsCustomMode())
        {
            BtnRun_Click(sender, e);
            return;
        }

        if (!File.Exists(txtFilePath.Text))
        {
            MessageBox.Show(
                UiText.T("Please select a valid file.", "有効なファイルを選択してください。"),
                UiText.T("Error", "エラー"),
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
            return;
        }

        string extension;
        try
        {
            extension = CustomFfmpegRunner.NormalizeExtension(txtCustomExtension.Text);
        }
        catch (Exception ex)
        {
            string message = UiText.LocalizeRuntimeMessage(ex.Message);
            MessageBox.Show(message, UiText.T("Invalid extension", "無効な拡張子"), MessageBoxButton.OK, MessageBoxImage.Warning);
            txtCustomExtension.Focus();
            txtCustomExtension.SelectAll();
            return;
        }

        try
        {
            _cts = new CancellationTokenSource();
            SetProcessingState(true);
            ApplyCustomModeUi();
            progressBar.Value = 0;
            _lastOutputPath = null;
            SetStatus(UiText.T("Running custom FFmpeg arguments...", "カスタムFFmpeg引数を実行しています…"));

            var progress = new Progress<ProgressUpdate>(update =>
            {
                progressBar.Value = Math.Clamp(update.Percent, 0, 100);
                SetStatus(UiText.T(
                    $"Running custom FFmpeg arguments... {progressBar.Value:0}%",
                    $"カスタムFFmpeg引数を実行しています… {progressBar.Value:0}%"));
            });

            string outputPath = await CustomFfmpegRunner.RunAsync(
                txtFilePath.Text,
                txtCustomArguments.Text,
                extension,
                progress,
                _cts.Token);

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
            ApplyCustomModeUi();
        }
    }

    private void CustomMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!IsCustomMode())
        {
            if (customArgumentsPanel is not null) customArgumentsPanel.Visibility = Visibility.Collapsed;
            if (customExtensionBox is not null) customExtensionBox.Visibility = Visibility.Collapsed;
            if (Math.Abs(Height - 560) < 1) Height = 430;
            CmbMode_SelectionChanged(sender, e);
            return;
        }

        if (cmbQuality is null || cmbOutputFormat is null || txtFixedOutput is null ||
            cmbScaleMode is null || txtScaleValue is null || customArgumentsPanel is null ||
            customExtensionBox is null)
        {
            return;
        }

        ApplyCustomModeUi();
    }

    private void ApplyCustomModeUi()
    {
        if (!IsCustomMode()) return;

        cmbQuality.Visibility = Visibility.Collapsed;
        cmbOutputFormat.Visibility = Visibility.Collapsed;
        txtFixedOutput.Visibility = Visibility.Collapsed;
        customExtensionBox.Visibility = Visibility.Visible;
        customArgumentsPanel.Visibility = Visibility.Visible;
        txtOptionLabel.Content = UiText.T("Extension", "拡張子");

        cmbScaleMode.IsEnabled = false;
        txtScaleValue.IsEnabled = false;
        txtScaleLabel.Foreground = SystemColors.GrayTextBrush;
        txtScaleHint.Text = UiText.T("Controlled by custom FFmpeg arguments.", "カスタムFFmpeg引数で指定します。");

        if (_inputProfile is not null)
        {
            string suggested = _inputProfile.Kind switch
            {
                MediaKind.Audio => "m4a",
                MediaKind.Image => "webp",
                _ => "mp4"
            };
            if (string.IsNullOrWhiteSpace(txtCustomExtension.Text) || txtCustomExtension.Text == "mp4")
            {
                txtCustomExtension.Text = suggested;
            }
        }

        if (WindowState == WindowState.Normal && Height < 560) Height = 560;

        bool processing = _cts is not null;
        txtCustomArguments.IsEnabled = !processing;
        txtCustomExtension.IsEnabled = !processing;
        cmbScaleMode.IsEnabled = false;
        txtScaleValue.IsEnabled = false;
    }

    private bool IsCustomMode()
    {
        return cmbMode is not null && SelectedTag(cmbMode, "compress").Equals("custom", StringComparison.OrdinalIgnoreCase);
    }
}
