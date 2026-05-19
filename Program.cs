using System.IO;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Xabe.FFmpeg;
using Xabe.FFmpeg.Downloader;

namespace MediaSqueeze;

public enum SqueezeMode
{
    Compress,
    Convert,
    Resize
}

public enum ScaleMode
{
    Original,
    Percent,
    Width,
    Height
}

public sealed record SqueezeRequest(
    string InputPath,
    SqueezeMode Mode,
    string Quality,
    string OutputExtension,
    ScaleMode ScaleMode,
    int ScaleValue);

public sealed class ProgressUpdate
{
    public ProgressUpdate(double percent, TimeSpan? duration)
    {
        Percent = percent;
        Duration = duration;
    }

    public double Percent { get; }
    public TimeSpan? Duration { get; }
}

public static class MediaProcessor
{
    private static bool _ffmpegReady;

    public static async Task EnsureFFmpegAsync()
    {
        if (_ffmpegReady)
        {
            return;
        }

        string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        if (File.Exists(Path.Combine(baseDirectory, "ffmpeg.exe")) &&
            File.Exists(Path.Combine(baseDirectory, "ffprobe.exe")))
        {
            FFmpeg.SetExecutablesPath(baseDirectory);
        }
        else
        {
            await FFmpegDownloader.GetLatestVersion(FFmpegVersion.Official);
        }

        _ffmpegReady = true;
    }

    public static string CreateOutputPath(SqueezeRequest request)
    {
        string directory = Path.GetDirectoryName(request.InputPath) ?? AppDomain.CurrentDomain.BaseDirectory;
        string name = Path.GetFileNameWithoutExtension(request.InputPath);
        string suffix = request.Mode switch
        {
            SqueezeMode.Compress => "compressed",
            SqueezeMode.Resize => "resized",
            _ => "converted"
        };

        string extension = request.Mode == SqueezeMode.Compress || request.Mode == SqueezeMode.Resize
            ? "mp4"
            : request.OutputExtension.TrimStart('.').ToLowerInvariant();

        string outputPath = Path.Combine(directory, $"{name}_{suffix}.{extension}");
        for (int i = 1; File.Exists(outputPath); i++)
        {
            outputPath = Path.Combine(directory, $"{name}_{suffix}_{i}.{extension}");
        }

        return outputPath;
    }

    public static async Task<string> ProcessAsync(
        SqueezeRequest request,
        IProgress<ProgressUpdate>? progress,
        CancellationToken cancellationToken)
    {
        await EnsureFFmpegAsync();

        string outputPath = CreateOutputPath(request);
        string parameter = BuildParameter(request);
        var conversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{request.InputPath}\" {parameter}".Trim())
            .SetOutput(outputPath);

        conversion.OnProgress += (_, args) =>
            progress?.Report(new ProgressUpdate(args.Percent, args.Duration));

        await conversion.Start(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        return outputPath;
    }

    private static string BuildParameter(SqueezeRequest request)
    {
        string scaleFilter = BuildScaleFilter(request);

        return request.Mode switch
        {
            SqueezeMode.Compress => JoinParameters(QualityToOptions(request.Quality), scaleFilter),
            SqueezeMode.Resize => scaleFilter,
            _ => string.Empty
        };
    }

    private static string QualityToOptions(string quality)
    {
        return quality switch
        {
            "high" => "-b:v 2000k -b:a 192k",
            "medium" => "-b:v 1500k -b:a 128k",
            "low" => "-b:v 1000k -b:a 96k",
            "10mb" => "-b:v 1000k -b:a 128k -fs 10M",
            _ => "-b:v 1500k -b:a 128k"
        };
    }

    private static string BuildScaleFilter(SqueezeRequest request)
    {
        if (request.ScaleMode == ScaleMode.Original)
        {
            return string.Empty;
        }

        int value = Math.Max(1, request.ScaleValue);
        string scale = request.ScaleMode switch
        {
            ScaleMode.Percent => BuildPercentScale(value),
            ScaleMode.Width => $"{value}:-2",
            ScaleMode.Height => $"-2:{value}",
            _ => string.Empty
        };

        return string.IsNullOrWhiteSpace(scale) ? string.Empty : $"-vf \"scale={scale}\"";
    }

    private static string JoinParameters(params string[] parameters)
    {
        return string.Join(' ', parameters.Where(parameter => !string.IsNullOrWhiteSpace(parameter)));
    }

    private static string BuildPercentScale(int percent)
    {
        string factor = (percent / 100.0).ToString("0.###", CultureInfo.InvariantCulture);
        return $"trunc(iw*{factor}/2)*2:trunc(ih*{factor}/2)*2";
    }
}
