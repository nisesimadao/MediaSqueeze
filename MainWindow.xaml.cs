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

    public MainWindow()
    {
        InitializeComponent();
        CmbMode_SelectionChanged(this, null!);

        if (SystemParameters.ClientAreaAnimation)
        {
            Storyboard titleAnimation = (Storyboard)FindResource("TitleColorAnimation");
            titleAnimation.Begin();
        }
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        string? argumentPath = Environment.GetCommandLineArgs()
            .Skip(1)
            .Select(arg => arg.Trim('"'))
            .FirstOrDefault(File.Exists);

        if (argumentPath is not null)
        {
            SetInputPath(argumentPath);
            SetStatus($"Received from command line:\r\n{argumentPath}");
        }
    }

    private void BtnSelect_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "Select media file",
            Filter = "Media files|*.mp4;*.mov;*.mkv;*.avi;*.mp3;*.m4a;*.wav;*.flac;*.aac;*.webm|All files|*.*"
        };

        if (dialog.ShowDialog() == true)
        {
            SetInputPath(dialog.FileName);
        }
    }

    private async void BtnRun_Click(object sender, RoutedEventArgs e)
    {
        if (!File.Exists(txtFilePath.Text))
        {
            MessageBox.Show("Please select a valid file.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (!TryBuildRequest(out SqueezeRequest? request))
        {
            return;
        }

        _cts = new CancellationTokenSource();
        SetProcessingState(true);
        progressBar.Value = 0;
        _lastOutputPath = null;

        try
        {
            SetStatus("Preparing FFmpeg...");

            var progress = new Progress<ProgressUpdate>(update =>
            {
                progressBar.Value = Math.Clamp(update.Percent, 0, 100);
                SetStatus($"Processing... {progressBar.Value:0}%");
            });

            string outputPath = await MediaProcessor.ProcessAsync(request!, progress, _cts.Token);
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

    private void Window_Drop(object sender, DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            return;
        }

        string[] files = (string[])e.Data.GetData(DataFormats.FileDrop)!;
        if (files.FirstOrDefault(File.Exists) is { } path)
        {
            SetInputPath(path);
        }
    }

    private void CmbMode_SelectionChanged(object sender, SelectionChangedEventArgs e)
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
            SqueezeMode.Compress => "Quality",
            SqueezeMode.Convert => "Format",
            _ => "Output"
        };
        cmbScaleMode.IsEnabled = mode != SqueezeMode.Convert;
        txtScaleValue.IsEnabled = mode != SqueezeMode.Convert && SelectedScaleMode() != ScaleMode.Original;
        txtScaleLabel.Foreground = mode == SqueezeMode.Convert ? SystemColors.GrayTextBrush : SystemColors.ControlTextBrush;
        txtScaleHint.Text = mode == SqueezeMode.Convert
            ? "Not used for Convert."
            : "Keeps aspect ratio.";

        if (mode == SqueezeMode.Resize && SelectedScaleMode() == ScaleMode.Original)
        {
            SelectScaleMode(ScaleMode.Percent);
            txtScaleValue.Text = "50";
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
            ScaleMode.Percent => "Example: 50 means half size.",
            ScaleMode.Width => "Height is calculated automatically.",
            ScaleMode.Height => "Width is calculated automatically.",
            _ => "Keeps original size."
        };
    }

    private bool TryBuildRequest(out SqueezeRequest? request)
    {
        SqueezeMode mode = SelectedMode();
        string quality = SelectedTag(cmbQuality, "medium");
        string outputExtension = SelectedTag(cmbOutputFormat, "mp4");
        ScaleMode scaleMode = SelectedScaleMode();
        int scaleValue = 0;

        if (mode == SqueezeMode.Resize && scaleMode == ScaleMode.Original)
        {
            MessageBox.Show("Choose Percent, Width, or Height for Resize mode.", "Size required", MessageBoxButton.OK, MessageBoxImage.Warning);
            cmbScaleMode.Focus();
            cmbScaleMode.IsDropDownOpen = true;
            request = null;
            return false;
        }

        if (scaleMode != ScaleMode.Original &&
            (!int.TryParse(txtScaleValue.Text.Trim(), out scaleValue) || scaleValue <= 0))
        {
            MessageBox.Show("Enter a positive number for Size.", "Invalid size", MessageBoxButton.OK, MessageBoxImage.Warning);
            txtScaleValue.Focus();
            txtScaleValue.SelectAll();
            request = null;
            return false;
        }

        if (scaleMode == ScaleMode.Percent && scaleValue > 400)
        {
            MessageBox.Show("Percent must be 400 or lower.", "Invalid percent", MessageBoxButton.OK, MessageBoxImage.Warning);
            txtScaleValue.Focus();
            txtScaleValue.SelectAll();
            request = null;
            return false;
        }

        request = new SqueezeRequest(txtFilePath.Text, mode, quality, outputExtension, scaleMode, scaleValue);
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

    private void SetInputPath(string path)
    {
        txtFilePath.Text = path;
        btnOpenFolder.IsEnabled = false;
        _lastOutputPath = null;
        SetStatus($"Selected:\r\n{path}");
    }

    private void SetStatus(string message)
    {
        txtStatus.Text = message;
    }

    private void SetProcessingState(bool isProcessing)
    {
        btnRun.IsEnabled = !isProcessing;
        btnSelect.IsEnabled = !isProcessing;
        btnCancel.IsEnabled = isProcessing;
        btnOpenFolder.IsEnabled = !isProcessing && _lastOutputPath is not null && File.Exists(_lastOutputPath);
        cmbMode.IsEnabled = !isProcessing;
        cmbQuality.IsEnabled = !isProcessing;
        cmbOutputFormat.IsEnabled = !isProcessing;
        cmbScaleMode.IsEnabled = !isProcessing && SelectedMode() != SqueezeMode.Convert;
        txtScaleValue.IsEnabled = !isProcessing && SelectedMode() != SqueezeMode.Convert && SelectedScaleMode() != ScaleMode.Original;
    }
}
