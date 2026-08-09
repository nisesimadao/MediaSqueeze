using System.Diagnostics;
using System.Globalization;
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

public enum ScaleMode
{
    Original,
    Percent,
    Width,
    Height
}

public enum MediaKind
{
    Video,
    Audio,
    Image,
    Unknown
}

public sealed record SqueezeRequest(
    string InputPath,
    SqueezeMode Mode,
    string Quality,
    OutputFormatOption OutputFormat,
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
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".jfif", ".png", ".webp", ".avif", ".heic", ".heif", ".bmp", ".dib",
        ".tif", ".tiff", ".tga", ".qoi", ".ppm", ".pgm", ".pbm", ".pnm", ".gif", ".apng"
    };

    private static bool _ffmpegReady;
    private static string? _ffmpegExecutablePath;

    public static IReadOnlyList<OutputFormatOption> FallbackOutputFormats => FormatCatalog.Fallback;

    public static async Task EnsureFFmpegAsync()
    {
        if (_ffmpegReady)
        {
            return;
        }

        string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        FFmpeg.SetExecutablesPath(baseDirectory);

        string ffmpegPath = Path.Combine(baseDirectory, "ffmpeg.exe");
        string ffprobePath = Path.Combine(baseDirectory, "ffprobe.exe");
        if (!File.Exists(ffmpegPath) || !File.Exists(ffprobePath))
        {
            await FFmpegDownloader.GetLatestVersion(FFmpegVersion.Official, baseDirectory);
        }

        if (!File.Exists(ffmpegPath))
        {
            throw new FileNotFoundException("ffmpeg.exe could not be found after setup.", ffmpegPath);
        }

        _ffmpegExecutablePath = ffmpegPath;
        _ffmpegReady = true;
    }

    public static async Task<IReadOnlyList<OutputFormatOption>> GetOutputFormatsAsync()
    {
        await EnsureFFmpegAsync();
        string muxers = await RunFfmpegInfoCommandAsync("-hide_banner -muxers");
        string encoders = await RunFfmpegInfoCommandAsync("-hide_banner -encoders");
        string devices = await RunFfmpegInfoCommandAsync("-hide_banner -devices");
        return FormatCatalog.Build(muxers, encoders, devices);
    }

    public static string CreateOutputPath(SqueezeRequest request, MediaKind kind)
    {
        string directory = Path.GetDirectoryName(request.InputPath) ?? AppDomain.CurrentDomain.BaseDirectory;
        string name = Path.GetFileNameWithoutExtension(request.InputPath);
        string suffix = request.Mode switch
        {
            SqueezeMode.Compress => "compressed",
            SqueezeMode.Resize => "resized",
            _ => "converted"
        };

        string extension = request.Mode switch
        {
            SqueezeMode.Convert => request.OutputFormat.Extension.TrimStart('.').ToLowerInvariant(),
            SqueezeMode.Compress when kind == MediaKind.Image => "webp",
            SqueezeMode.Compress when kind == MediaKind.Audio => "m4a",
            SqueezeMode.Compress => "mp4",
            SqueezeMode.Resize when kind == MediaKind.Image => ResizeImageExtension(request.InputPath),
            _ => "mp4"
        };

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
        IMediaInfo mediaInfo = await FFmpeg.GetMediaInfo(request.InputPath, cancellationToken);
        MediaKind kind = DetectMediaKind(mediaInfo, request.InputPath);
        bool hasVideo = mediaInfo.VideoStreams.Any();
        bool hasAudio = mediaInfo.AudioStreams.Any();

        if (kind == MediaKind.Unknown)
        {
            throw new InvalidOperationException("This file could not be recognized as video, audio, or image.");
        }
        if (request.Mode == SqueezeMode.Resize && kind == MediaKind.Audio)
        {
            throw new InvalidOperationException("Resize is not available for audio files.");
        }

        string outputPath = CreateOutputPath(request, kind);

        if (request.Mode == SqueezeMode.Compress && kind == MediaKind.Image && request.Quality == "10mb")
        {
            return await ProcessImageTargetAsync(request, outputPath, 10 * 1024 * 1024L, progress, cancellationToken);
        }

        string parameter = BuildParameter(request, kind, mediaInfo.Duration, hasVideo, hasAudio);
        await RunConversionAsync(request.InputPath, outputPath, parameter, progress, cancellationToken);
        return outputPath;
    }

    private static async Task RunConversionAsync(
        string inputPath,
        string outputPath,
        string parameter,
        IProgress<ProgressUpdate>? progress,
        CancellationToken cancellationToken)
    {
        var conversion = FFmpeg.Conversions.New()
            .AddParameter($"-i \"{inputPath}\" {parameter}".Trim())
            .SetOutput(outputPath);

        conversion.OnProgress += (_, args) =>
            progress?.Report(new ProgressUpdate(args.Percent, args.Duration));

        await conversion.Start(cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
    }

    private static async Task<string> ProcessImageTargetAsync(
        SqueezeRequest request,
        string outputPath,
        long targetBytes,
        IProgress<ProgressUpdate>? progress,
        CancellationToken cancellationToken)
    {
        int quality = 84;
        double extraScale = 1.0;

        for (int pass = 0; pass < 7; pass++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (File.Exists(outputPath))
            {
                File.Delete(outputPath);
            }

            string scaleFilter = BuildScaleFilter(request, extraScale);
            string parameter = JoinParameters(
                scaleFilter,
                $"-frames:v 1 -an -c:v libwebp -quality {quality}");

            await RunConversionAsync(request.InputPath, outputPath, parameter, progress, cancellationToken);
            long size = new FileInfo(outputPath).Length;
            if (size <= targetBytes)
            {
                return outputPath;
            }

            double ratio = targetBytes / (double)Math.Max(1, size);
            if (quality > 34)
            {
                quality = Math.Max(26, (int)Math.Round(quality * Math.Clamp(ratio, 0.58, 0.86)));
            }
            else
            {
                extraScale *= Math.Clamp(Math.Sqrt(ratio) * 0.96, 0.35, 0.88);
            }
        }

        return outputPath;
    }

    private static string BuildParameter(
        SqueezeRequest request,
        MediaKind kind,
        TimeSpan duration,
        bool hasVideo,
        bool hasAudio)
    {
        string scaleFilter = BuildScaleFilter(request);

        return request.Mode switch
        {
            SqueezeMode.Compress => BuildCompressOptions(request, kind, duration, scaleFilter, hasAudio),
            SqueezeMode.Resize => BuildResizeOptions(request, kind, scaleFilter),
            SqueezeMode.Convert => BuildConvertOptions(request.OutputFormat, kind, hasVideo, hasAudio),
            _ => string.Empty
        };
    }

    private static string BuildCompressOptions(SqueezeRequest request, MediaKind kind, TimeSpan duration, string scaleFilter, bool hasAudio)
    {
        if (kind == MediaKind.Image)
        {
            int quality = request.Quality switch
            {
                "high" => 90,
                "low" => 56,
                _ => 76
            };
            return JoinParameters(scaleFilter, $"-frames:v 1 -an -c:v libwebp -quality {quality}");
        }

        if (kind == MediaKind.Audio)
        {
            int bitrate = request.Quality switch
            {
                "high" => 192,
                "low" => 96,
                "10mb" => TargetAudioBitrate(duration, 10),
                _ => 128
            };
            return $"-vn -c:a aac -b:a {bitrate}k";
        }

        if (request.Quality == "10mb")
        {
            (int videoKbps, int audioKbps) = TargetVideoBitrates(duration, 10, hasAudio);
            string audio = hasAudio && audioKbps > 0 ? $"-b:a {audioKbps}k" : "-an";
            return JoinParameters($"-b:v {videoKbps}k", audio, scaleFilter);
        }

        string qualityOptions = request.Quality switch
        {
            "high" => "-b:v 2000k -b:a 192k",
            "low" => "-b:v 1000k -b:a 96k",
            _ => "-b:v 1500k -b:a 128k"
        };
        return JoinParameters(qualityOptions, scaleFilter);
    }

    private static string BuildResizeOptions(SqueezeRequest request, MediaKind kind, string scaleFilter)
    {
        if (string.IsNullOrWhiteSpace(scaleFilter))
        {
            throw new InvalidOperationException("Choose Percent, Width, or Height for Resize mode.");
        }

        return kind == MediaKind.Image
            ? JoinParameters(scaleFilter, "-frames:v 1 -an")
            : scaleFilter;
    }

    private static string BuildConvertOptions(OutputFormatOption format, MediaKind kind, bool hasVideo, bool hasAudio)
    {
        var parts = new List<string>();

        if (format.Media == "audio")
        {
            if (!hasAudio)
            {
                throw new InvalidOperationException($"{format.Label} requires an audio stream.");
            }
            parts.Add("-vn");
            AddAudioPreset(parts, format);
        }
        else if (format.Media is "image" or "animation")
        {
            if (!hasVideo)
            {
                throw new InvalidOperationException($"{format.Label} requires a video or image stream.");
            }
            parts.Add("-an");
            if (format.Media == "animation" && kind == MediaKind.Video)
            {
                parts.Add("-vf \"fps=12\"");
            }
            else
            {
                parts.Add("-frames:v 1");
            }
            AddImagePreset(parts, format);
        }
        else if (format.Media == "video")
        {
            if (hasVideo)
            {
                AddVideoPreset(parts, format);
            }
            if (hasAudio)
            {
                AddContainerAudio(parts, format);
            }
            else
            {
                parts.Add("-an");
            }
            if ((format.Id == "mp4" || format.Id == "mov") && hasVideo)
            {
                parts.Add("-movflags +faststart");
            }
        }

        if (!string.IsNullOrWhiteSpace(format.Muxer))
        {
            parts.Add($"-f {format.Muxer}");
        }

        return JoinParameters(parts.ToArray());
    }

    private static void AddVideoPreset(List<string> parts, OutputFormatOption format)
    {
        if (string.IsNullOrWhiteSpace(format.VideoEncoder))
        {
            return;
        }

        parts.Add($"-c:v {format.VideoEncoder}");
        switch (format.VideoEncoder)
        {
            case "libx264":
                parts.Add("-preset veryfast -crf 24 -pix_fmt yuv420p");
                break;
            case "libvpx-vp9":
            case "libvpx":
            case "vp8":
            case "vp9":
                parts.Add("-crf 31 -b:v 0");
                break;
            case "mpeg4":
                parts.Add("-q:v 5");
                break;
            case "mpeg2video":
            case "mpeg1video":
                parts.Add("-q:v 4");
                break;
        }
    }

    private static void AddContainerAudio(List<string> parts, OutputFormatOption format)
    {
        if (string.IsNullOrWhiteSpace(format.AudioEncoder))
        {
            return;
        }

        parts.Add($"-c:a {format.AudioEncoder}");
        if (format.AudioEncoder is "libvorbis" or "vorbis")
        {
            parts.Add("-q:a 5");
        }
        else if (!format.AudioEncoder.StartsWith("pcm_", StringComparison.OrdinalIgnoreCase) && format.AudioEncoder != "flac")
        {
            parts.Add(format.AudioEncoder is "libopus" or "opus" ? "-b:a 128k" : "-b:a 160k");
        }
    }

    private static void AddAudioPreset(List<string> parts, OutputFormatOption format)
    {
        if (!string.IsNullOrWhiteSpace(format.AudioEncoder))
        {
            parts.Add($"-c:a {format.AudioEncoder}");
        }

        if (format.Preset == "vorbis")
        {
            parts.Add("-q:a 5");
        }
        else if (format.Preset is not ("wav" or "pcm" or "pcm-be" or "aiff" or "flac"))
        {
            parts.Add(format.Preset == "opus" ? "-b:a 160k" : "-b:a 192k");
        }
    }

    private static void AddImagePreset(List<string> parts, OutputFormatOption format)
    {
        if (!string.IsNullOrWhiteSpace(format.ImageEncoder))
        {
            parts.Add($"-c:v {format.ImageEncoder}");
        }

        switch (format.Preset)
        {
            case "jpg":
                parts.Add("-q:v 2");
                break;
            case "webp":
                parts.Add("-quality 88");
                break;
            case "avif":
                parts.Add("-crf 28");
                break;
        }
    }

    private static int TargetAudioBitrate(TimeSpan duration, double targetMB)
    {
        if (duration.TotalSeconds <= 0)
        {
            return 96;
        }
        double usableBits = targetMB * 1024 * 1024 * 8 * 0.94;
        return Math.Clamp((int)Math.Floor(usableBits / duration.TotalSeconds / 1000) - 4, 16, 320);
    }

    private static (int VideoKbps, int AudioKbps) TargetVideoBitrates(TimeSpan duration, double targetMB, bool hasAudio)
    {
        if (duration.TotalSeconds <= 0)
        {
            return hasAudio ? (1000, 128) : (1128, 0);
        }

        double usableBits = targetMB * 1024 * 1024 * 8 * 0.94;
        int totalKbps = Math.Max(24, (int)Math.Floor(usableBits / duration.TotalSeconds / 1000));
        int audioKbps = hasAudio ? (totalKbps < 180 ? 24 : Math.Clamp((int)Math.Round(totalKbps * 0.12), 32, 160)) : 0;
        int videoKbps = Math.Max(12, totalKbps - audioKbps - 6);
        return (videoKbps, audioKbps);
    }

    private static string BuildScaleFilter(SqueezeRequest request, double extraScale = 1.0)
    {
        var filters = new List<string>();
        if (request.ScaleMode != ScaleMode.Original)
        {
            int value = Math.Max(1, request.ScaleValue);
            string scale = request.ScaleMode switch
            {
                ScaleMode.Percent => BuildPercentScale(value),
                ScaleMode.Width => $"{value}:-2",
                ScaleMode.Height => $"-2:{value}",
                _ => string.Empty
            };
            if (!string.IsNullOrWhiteSpace(scale))
            {
                filters.Add($"scale={scale}");
            }
        }

        if (extraScale < 0.999)
        {
            string factor = extraScale.ToString("0.####", CultureInfo.InvariantCulture);
            filters.Add($"scale=trunc(iw*{factor}/2)*2:trunc(ih*{factor}/2)*2");
        }

        return filters.Count == 0 ? string.Empty : $"-vf \"{string.Join(',', filters)}\"";
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

    private static MediaKind DetectMediaKind(IMediaInfo mediaInfo, string path)
    {
        string extension = Path.GetExtension(path);
        bool hasVideo = mediaInfo.VideoStreams.Any();
        bool hasAudio = mediaInfo.AudioStreams.Any();

        if (ImageExtensions.Contains(extension))
        {
            return MediaKind.Image;
        }
        if (hasVideo && !hasAudio && mediaInfo.Duration <= TimeSpan.FromMilliseconds(200))
        {
            return MediaKind.Image;
        }
        if (hasVideo)
        {
            return MediaKind.Video;
        }
        if (hasAudio)
        {
            return MediaKind.Audio;
        }
        return MediaKind.Unknown;
    }

    private static string ResizeImageExtension(string inputPath)
    {
        string extension = Path.GetExtension(inputPath).TrimStart('.').ToLowerInvariant();
        return extension switch
        {
            "jpeg" => "jpg",
            "jpg" or "png" or "webp" or "bmp" or "tif" or "tiff" => extension,
            _ => "png"
        };
    }

    private static async Task<string> RunFfmpegInfoCommandAsync(string arguments)
    {
        if (string.IsNullOrWhiteSpace(_ffmpegExecutablePath))
        {
            throw new InvalidOperationException("FFmpeg has not been initialized.");
        }

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = _ffmpegExecutablePath,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        process.Start();
        Task<string> stdoutTask = process.StandardOutput.ReadToEndAsync();
        Task<string> stderrTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        string stdout = await stdoutTask;
        string stderr = await stderrTask;
        return $"{stdout}\n{stderr}";
    }
}
