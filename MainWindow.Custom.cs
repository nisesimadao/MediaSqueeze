using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

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
            MessageBox.Show("Please select a valid file.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        string extension;
        try
        {
            extension = CustomFfmpegRunner.NormalizeExtension(txtCustomExtension.Text);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Invalid extension", MessageBoxButton.OK, MessageBoxImage.Warning);
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
            SetStatus("Running custom FFmpeg arguments...");

            var progress = new Progress<ProgressUpdate>(update =>
            {
                progressBar.Value = Math.Clamp(update.Percent, 0, 100);
                SetStatus($"Running custom FFmpeg arguments... {progressBar.Value:0}%");
            });

            string outputPath = await CustomFfmpegRunner.RunAsync(
                txtFilePath.Text,
                txtCustomArguments.Text,
                extension,
                progress,
                _cts.Token);

            _lastOutputPath = outputPath;
            progressBar.Value = 100;
            SetStatus($"Done:\r\n{outputPath}");
            btnOpenFolder.IsEnabled = true;
        }
        catch (OperationCanceledException)
        {
            SetStatus("Canceled.");
        }
        catch (Exception ex)
        {
            SetStatus($"Error: {ex.Message}");
            MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _cts?.Dispose();
            _cts = null;
            SetProcessingState(false);
            ApplyCustomModeUi();
        }
    }

    private async void CustomMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!IsCustomMode())
        {
            customArgumentsPanel.Visibility = Visibility.Collapsed;
            customExtensionBox.Visibility = Visibility.Collapsed;
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
        await Task.CompletedTask;
    }

    private void ApplyCustomModeUi()
    {
        if (!IsCustomMode()) return;

        cmbQuality.Visibility = Visibility.Collapsed;
        cmbOutputFormat.Visibility = Visibility.Collapsed;
        txtFixedOutput.Visibility = Visibility.Collapsed;
        customExtensionBox.Visibility = Visibility.Visible;
        customArgumentsPanel.Visibility = Visibility.Visible;
        txtOptionLabel.Content = "Extension";

        cmbScaleMode.IsEnabled = false;
        txtScaleValue.IsEnabled = false;
        txtScaleLabel.Foreground = SystemColors.GrayTextBrush;
        txtScaleHint.Text = "Controlled by custom FFmpeg arguments.";

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
        return SelectedTag(cmbMode, "compress").Equals("custom", StringComparison.OrdinalIgnoreCase);
    }
}
