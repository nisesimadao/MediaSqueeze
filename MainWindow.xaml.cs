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
        Storyboard titleAnimation = (Storyboard)FindResource("TitleColorAnimation");
        titleAnimation.Begin();
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

        _cts = new CancellationTokenSource();
        btnRun.IsEnabled = false;
        btnCancel.IsEnabled = true;
        btnOpenFolder.IsEnabled = false;
        progressBar.Value = 0;
        _lastOutputPath = null;

        try
        {
            SqueezeRequest request = BuildRequest();
            SetStatus("Preparing FFmpeg...");

            var progress = new Progress<ProgressUpdate>(update =>
            {
                progressBar.Value = Math.Clamp(update.Percent, 0, 100);
                SetStatus($"Processing... {progressBar.Value:0}%");
            });

            string outputPath = await MediaProcessor.ProcessAsync(request, progress, _cts.Token);
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
            btnRun.IsEnabled = true;
            btnCancel.IsEnabled = false;
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
        if (cmbQuality is null || cmbOutputFormat is null || cmbResolution is null)
        {
            return;
        }

        SqueezeMode mode = SelectedMode();
        cmbQuality.Visibility = mode == SqueezeMode.Compress ? Visibility.Visible : Visibility.Collapsed;
        cmbOutputFormat.Visibility = mode == SqueezeMode.Convert ? Visibility.Visible : Visibility.Collapsed;
        cmbResolution.IsEnabled = mode == SqueezeMode.Resize;
    }

    private SqueezeRequest BuildRequest()
    {
        SqueezeMode mode = SelectedMode();
        string quality = SelectedTag(cmbQuality, "medium");
        string outputExtension = SelectedTag(cmbOutputFormat, "mp4");
        string resolution = SelectedTag(cmbResolution, "1280x720");

        return new SqueezeRequest(txtFilePath.Text, mode, quality, outputExtension, resolution);
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
}
