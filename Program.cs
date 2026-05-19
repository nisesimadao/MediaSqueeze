using System.IO;
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

public sealed record SqueezeRequest(
    string InputPath,
    SqueezeMode Mode,
    string Quality,
    string OutputExtension,
    string Resolution);

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
        return request.Mode switch
        {
            SqueezeMode.Compress => QualityToOptions(request.Quality),
            SqueezeMode.Resize => $"-vf scale={NormalizeResolution(request.Resolution)}",
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

    private static string NormalizeResolution(string resolution)
    {
        string trimmed = resolution.Trim().ToLowerInvariant();
        string[] parts = trimmed.Split('x', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length == 2 &&
            int.TryParse(parts[0], out int width) &&
            int.TryParse(parts[1], out int height) &&
            width > 0 &&
            height > 0)
        {
            return $"{width}:{height}";
        }

        return "1280:720";
    }
}
