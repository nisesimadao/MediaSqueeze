using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using Xabe.FFmpeg;

namespace MediaSqueeze;

public static class CustomFfmpegRunner
{
    private static readonly Regex SafeExtension = new("^[a-z0-9]{1,16}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TimeRegex = new(@"\btime=(\d+):(\d+):(\d+(?:\.\d+)?)", RegexOptions.Compiled);

    public static async Task<string> RunAsync(
        string inputPath,
        string argumentsText,
        string outputExtension,
        IProgress<ProgressUpdate>? progress,
        CancellationToken cancellationToken)
    {
        if (!File.Exists(inputPath))
        {
            throw new FileNotFoundException("Input file was not found.", inputPath);
        }

        string extension = NormalizeExtension(outputExtension);
        await MediaProcessor.EnsureFFmpegAsync();

        string ffmpegPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ffmpeg.exe");
        if (!File.Exists(ffmpegPath))
        {
            throw new FileNotFoundException("ffmpeg.exe could not be found after setup.", ffmpegPath);
        }

        string directory = Path.GetDirectoryName(inputPath) ?? AppDomain.CurrentDomain.BaseDirectory;
        string stem = Path.GetFileNameWithoutExtension(inputPath);
        string outputPath = UniqueOutputPath(directory, $"{stem}_custom", extension);
        List<string> args = BuildArguments(argumentsText, inputPath, outputPath);

        TimeSpan duration = TimeSpan.Zero;
        try
        {
            IMediaInfo mediaInfo = await FFmpeg.GetMediaInfo(inputPath, cancellationToken);
            duration = mediaInfo.Duration;
        }
        catch when (!cancellationToken.IsCancellationRequested)
        {
            // Custom execution should still be allowed when duration probing is unavailable.
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = ffmpegPath,
            UseShellExecute = false,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            CreateNoWindow = true,
            WorkingDirectory = directory
        };
        foreach (string arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        if (!process.Start())
        {
            throw new InvalidOperationException("Could not start FFmpeg.");
        }

        using CancellationTokenRegistration registration = cancellationToken.Register(() =>
        {
            try
            {
                if (!process.HasExited) process.Kill(entireProcessTree: true);
            }
            catch
            {
                // Best effort cancellation.
            }
        });

        var recentErrors = new Queue<string>();
        Task stdoutTask = DrainAsync(process.StandardOutput, null, cancellationToken);
        Task stderrTask = DrainAsync(process.StandardError, line =>
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                recentErrors.Enqueue(line);
                while (recentErrors.Count > 18) recentErrors.Dequeue();
            }

            if (duration.TotalSeconds > 0 && TryReadTimestamp(line, out TimeSpan position))
            {
                double percent = Math.Clamp(position.TotalSeconds / duration.TotalSeconds * 100.0, 0, 99.5);
                progress?.Report(new ProgressUpdate(percent, duration));
            }
        }, cancellationToken);

        await process.WaitForExitAsync(cancellationToken);
        await Task.WhenAll(stdoutTask, stderrTask);
        cancellationToken.ThrowIfCancellationRequested();

        if (process.ExitCode != 0)
        {
            string detail = string.Join(Environment.NewLine, recentErrors);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(detail)
                ? $"FFmpeg exited with code {process.ExitCode}."
                : $"FFmpeg exited with code {process.ExitCode}.{Environment.NewLine}{Environment.NewLine}{detail}");
        }

        if (!File.Exists(outputPath))
        {
            throw new InvalidOperationException("FFmpeg completed without creating the expected output. Use {output} for the output path when supplying a full command layout.");
        }

        progress?.Report(new ProgressUpdate(100, duration == TimeSpan.Zero ? null : duration));
        return outputPath;
    }

    public static List<string> ParseArguments(string text)
    {
        var result = new List<string>();
        var current = new System.Text.StringBuilder();
        char? quote = null;
        bool escaped = false;
        bool started = false;

        foreach (char ch in text ?? string.Empty)
        {
            if (escaped)
            {
                current.Append(ch);
                escaped = false;
                started = true;
                continue;
            }

            if (ch == '\\' && quote != '\'')
            {
                escaped = true;
                started = true;
                continue;
            }

            if (quote is not null)
            {
                if (ch == quote) quote = null;
                else current.Append(ch);
                started = true;
                continue;
            }

            if (ch is '"' or '\'')
            {
                quote = ch;
                started = true;
                continue;
            }

            if (char.IsWhiteSpace(ch))
            {
                if (started)
                {
                    result.Add(current.ToString());
                    current.Clear();
                    started = false;
                }
                continue;
            }

            current.Append(ch);
            started = true;
        }

        if (escaped) current.Append('\\');
        if (quote is not null)
        {
            throw new InvalidOperationException($"Unclosed {(quote == '"' ? "double" : "single")} quote in custom arguments.");
        }
        if (started) result.Add(current.ToString());
        if (result.Count > 0 && (result[0].Equals("ffmpeg", StringComparison.OrdinalIgnoreCase) || result[0].Equals("ffmpeg.exe", StringComparison.OrdinalIgnoreCase)))
        {
            result.RemoveAt(0);
        }
        return result;
    }

    public static List<string> BuildArguments(string text, string inputPath, string outputPath)
    {
        List<string> parsed = ParseArguments(text);
        var args = new List<string>();
        bool hasInput = false;
        bool hasOutput = false;

        foreach (string token in parsed)
        {
            if (token == "{input}")
            {
                args.Add("-i");
                args.Add(inputPath);
                hasInput = true;
                continue;
            }
            if (token == "{output}")
            {
                args.Add(outputPath);
                hasOutput = true;
                continue;
            }

            if (token.Contains("{input}", StringComparison.Ordinal)) hasInput = true;
            if (token.Contains("{output}", StringComparison.Ordinal)) hasOutput = true;
            args.Add(token.Replace("{input}", inputPath, StringComparison.Ordinal)
                .Replace("{output}", outputPath, StringComparison.Ordinal));
        }

        if (!hasInput)
        {
            args.Insert(0, inputPath);
            args.Insert(0, "-i");
        }
        if (!hasOutput) args.Add(outputPath);
        return args;
    }

    public static string NormalizeExtension(string value)
    {
        string extension = (value ?? string.Empty).Trim().TrimStart('.').ToLowerInvariant();
        if (!SafeExtension.IsMatch(extension))
        {
            throw new InvalidOperationException("Output extension must be 1–16 letters or numbers, for example mp4, mkv, webm, m4a, or png.");
        }
        return extension;
    }

    private static string UniqueOutputPath(string directory, string stem, string extension)
    {
        string path = Path.Combine(directory, $"{stem}.{extension}");
        for (int index = 1; File.Exists(path); index++)
        {
            path = Path.Combine(directory, $"{stem}_{index}.{extension}");
        }
        return path;
    }

    private static async Task DrainAsync(StreamReader reader, Action<string>? onLine, CancellationToken cancellationToken)
    {
        while (true)
        {
            string? line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            onLine?.Invoke(line);
        }
    }

    private static bool TryReadTimestamp(string line, out TimeSpan value)
    {
        value = default;
        Match match = TimeRegex.Match(line ?? string.Empty);
        if (!match.Success) return false;

        int hours = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
        int minutes = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture);
        double seconds = double.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        value = TimeSpan.FromHours(hours) + TimeSpan.FromMinutes(minutes) + TimeSpan.FromSeconds(seconds);
        return true;
    }
}
