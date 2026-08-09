using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using Xabe.FFmpeg;

namespace MediaSqueeze;

public enum FormatCompatibilityLevel
{
    Recommended,
    Compatible,
    StreamDrop,
    Special,
    Unsupported
}

public sealed record MediaInputProfile(
    MediaKind Kind,
    bool HasVideo,
    bool HasAudio,
    string? VideoCodec,
    string? AudioCodec);

public sealed record FormatCompatibilityResult(
    FormatCompatibilityLevel Level,
    string Icon,
    string Label,
    string Message,
    bool CanRun,
    bool DropsVideo = false,
    bool DropsAudio = false);

public static class FormatCompatibility
{
    private static readonly Dictionary<MediaKind, string[]> RecommendedByKind = new()
    {
        [MediaKind.Video] = ["mp4", "mkv", "webm", "mov"],
        [MediaKind.Audio] = ["mp3", "m4a", "flac", "wav", "opus"],
        [MediaKind.Image] = ["webp", "jpg", "png", "avif"]
    };

    private static readonly HashSet<string> SpecialCategories = new(StringComparer.Ordinal)
    {
        "Streaming & Broadcast",
        "Raw / Elementary Streams",
        "Subtitles & Data",
        "Advanced / Other"
    };

    private static readonly HashSet<string> RawAudioMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "ac3", "adts", "aptx", "aptx_hd", "codec2raw", "dfpwm", "dts", "eac3", "g722",
        "g723_1", "g726", "g726le", "gsm", "ilbc", "mlp", "mp2", "sbc", "truehd",
        "alaw", "mulaw", "s8", "u8", "s16le", "s16be", "u16le", "u16be", "s24le",
        "s24be", "u24le", "u24be", "s32le", "s32be", "u32le", "u32be", "f32le",
        "f32be", "f64le", "f64be"
    };

    private static readonly HashSet<string> RawVideoMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "av1", "cavsvideo", "dirac", "dnxhd", "h261", "h263", "h264", "hevc", "m4v",
        "mjpeg", "mpeg1video", "mpeg2video", "obu", "rawvideo", "vc1", "vvc"
    };

    private static readonly HashSet<string> AnimationMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "gif", "apng"
    };

    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".jfif", ".png", ".webp", ".avif", ".heic", ".heif", ".bmp", ".dib",
        ".tif", ".tiff", ".tga", ".qoi", ".ppm", ".pgm", ".pbm", ".pnm", ".gif", ".apng"
    };

    private static readonly Dictionary<string, string[]> CodecEncoderChoices = new(StringComparer.OrdinalIgnoreCase)
    {
        ["h264"] = ["libx264", "h264", "h264_nvenc", "h264_qsv", "h264_amf"],
        ["hevc"] = ["libx265", "hevc", "hevc_nvenc", "hevc_qsv", "hevc_amf"],
        ["av1"] = ["libaom-av1", "libsvtav1", "librav1e", "av1", "av1_nvenc", "av1_qsv", "av1_amf"],
        ["vp9"] = ["libvpx-vp9", "vp9", "vp9_qsv"],
        ["vp8"] = ["libvpx", "vp8"],
        ["mpeg4"] = ["mpeg4", "libxvid"],
        ["mpeg2video"] = ["mpeg2video"],
        ["mpeg1video"] = ["mpeg1video"],
        ["wmv2"] = ["wmv2"],
        ["wmv1"] = ["wmv1"],
        ["mjpeg"] = ["mjpeg"],
        ["png"] = ["png"],
        ["webp"] = ["libwebp", "webp"],
        ["gif"] = ["gif"],
        ["apng"] = ["apng"],
        ["tiff"] = ["tiff"],
        ["bmp"] = ["bmp"],
        ["targa"] = ["targa"],
        ["qoi"] = ["qoi"],
        ["aac"] = ["aac", "libfdk_aac"],
        ["mp3"] = ["libmp3lame", "mp3"],
        ["mp2"] = ["mp2"],
        ["opus"] = ["libopus", "opus"],
        ["vorbis"] = ["libvorbis", "vorbis"],
        ["flac"] = ["flac"],
        ["ac3"] = ["ac3", "ac3_fixed"],
        ["eac3"] = ["eac3"],
        ["wmav2"] = ["wmav2"],
        ["wmav1"] = ["wmav1"],
        ["pcm_s16le"] = ["pcm_s16le"],
        ["pcm_s16be"] = ["pcm_s16be"],
        ["pcm_s24le"] = ["pcm_s24le"],
        ["pcm_s24be"] = ["pcm_s24be"],
        ["pcm_s32le"] = ["pcm_s32le"],
        ["pcm_s32be"] = ["pcm_s32be"],
        ["pcm_f32le"] = ["pcm_f32le"],
        ["pcm_f32be"] = ["pcm_f32be"]
    };

    private static readonly Dictionary<string, string> MuxerHelpCache = new(StringComparer.OrdinalIgnoreCase);
    private static HashSet<string>? _encoderCache;

    public static async Task<MediaInputProfile> InspectAsync(string path, CancellationToken cancellationToken = default)
    {
        await MediaProcessor.EnsureFFmpegAsync();
        IMediaInfo info = await FFmpeg.GetMediaInfo(path, cancellationToken);
        bool hasVideo = info.VideoStreams.Any();
        bool hasAudio = info.AudioStreams.Any();
        MediaKind kind = DetectKind(info, path, hasVideo, hasAudio);
        string? videoCodec = info.VideoStreams.FirstOrDefault()?.Codec;
        string? audioCodec = info.AudioStreams.FirstOrDefault()?.Codec;
        return new MediaInputProfile(kind, hasVideo, hasAudio, videoCodec, audioCodec);
    }

    public static FormatCompatibilityResult Assess(OutputFormatOption? format, MediaInputProfile? input)
    {
        if (format is null || input is null || (!input.HasVideo && !input.HasAudio))
        {
            return Result(FormatCompatibilityLevel.Unsupported, "No usable audio/video stream was detected.");
        }

        (bool? supportsVideo, bool? supportsAudio) = StreamSupport(format);
        if (supportsVideo == false && supportsAudio == false)
        {
            return SpecialCategories.Contains(format.Category)
                ? Result(FormatCompatibilityLevel.Special, "This FFmpeg output is a control/data/special-purpose muxer and may require extra parameters.")
                : Result(FormatCompatibilityLevel.Unsupported, "This output does not accept the detected media streams.");
        }

        bool usableVideo = input.HasVideo && supportsVideo != false;
        bool usableAudio = input.HasAudio && supportsAudio != false;
        if (!usableVideo && !usableAudio)
        {
            string required = supportsVideo == true && supportsAudio == false
                ? "video/image"
                : supportsAudio == true && supportsVideo == false ? "audio" : "compatible media";
            return Result(FormatCompatibilityLevel.Unsupported, $"This format requires {required} input.");
        }

        bool dropsVideo = input.HasVideo && supportsVideo == false;
        bool dropsAudio = input.HasAudio && supportsAudio == false;
        bool losesMotion = format.Media == "image" && input.Kind == MediaKind.Video;
        bool recommended = RecommendedByKind.TryGetValue(input.Kind, out string[]? ids) && ids.Contains(format.Id, StringComparer.OrdinalIgnoreCase);

        if (SpecialCategories.Contains(format.Category) && format.Preset == "auto")
        {
            return Result(FormatCompatibilityLevel.Special,
                "FFmpeg supports this muxer; MediaSqueeze will inspect its default codecs before conversion.", dropsVideo, dropsAudio);
        }

        if (dropsVideo || dropsAudio || losesMotion)
        {
            var details = new List<string>();
            if (dropsVideo) details.Add("video will be removed");
            if (dropsAudio) details.Add("audio will be removed");
            if (losesMotion) details.Add("only one frame will be kept");
            return Result(FormatCompatibilityLevel.StreamDrop, string.Join("; ", details) + ".", dropsVideo, dropsAudio);
        }

        if (recommended)
        {
            return Result(FormatCompatibilityLevel.Recommended, "Common, broadly compatible choice for this input.");
        }

        if (SpecialCategories.Contains(format.Category))
        {
            return Result(FormatCompatibilityLevel.Special, ResolvedCodecMessage(format) ?? "Special-purpose FFmpeg output. Review the muxer description before using it.");
        }

        return Result(FormatCompatibilityLevel.Compatible, ResolvedCodecMessage(format) ?? "The detected media streams can be converted to this output.");
    }

    public static string DecoratedLabel(OutputFormatOption format, MediaInputProfile? input)
    {
        FormatCompatibilityResult compatibility = Assess(format, input);
        return input is null ? format.DisplayLabel : $"{compatibility.Icon} {format.DisplayLabel}";
    }

    public static string PreferredFormatId(MediaInputProfile? input, IReadOnlyList<OutputFormatOption> formats)
    {
        if (input is not null && RecommendedByKind.TryGetValue(input.Kind, out string[]? preferred))
        {
            foreach (string id in preferred)
            {
                if (formats.Any(format => string.Equals(format.Id, id, StringComparison.OrdinalIgnoreCase) && Assess(format, input).CanRun))
                {
                    return id;
                }
            }
        }
        return formats.FirstOrDefault(format => Assess(format, input).CanRun)?.Id ?? formats.FirstOrDefault()?.Id ?? "mp4";
    }

    public static async Task<OutputFormatOption> ResolveWithFfmpegAsync(OutputFormatOption format, MediaInputProfile input)
    {
        if (format.Preset != "auto" || string.IsNullOrWhiteSpace(format.Muxer))
        {
            return format;
        }

        await MediaProcessor.EnsureFFmpegAsync();
        _encoderCache ??= ParseEncoderNames(await RunFfmpegAsync("-hide_banner -encoders"));

        if (!MuxerHelpCache.TryGetValue(format.Muxer, out string? help))
        {
            help = await RunFfmpegAsync($"-hide_banner -h muxer={format.Muxer}");
            MuxerHelpCache[format.Muxer] = help;
        }

        string? defaultVideoCodec = ParseDefaultCodec(help, "video");
        string? defaultAudioCodec = ParseDefaultCodec(help, "audio");
        bool supportsVideo = !string.IsNullOrWhiteSpace(defaultVideoCodec);
        bool supportsAudio = !string.IsNullOrWhiteSpace(defaultAudioCodec);

        if (RawVideoMuxers.Contains(format.Muxer))
        {
            supportsVideo = true;
            supportsAudio = false;
            defaultVideoCodec ??= format.Muxer;
        }
        else if (RawAudioMuxers.Contains(format.Muxer))
        {
            supportsVideo = false;
            supportsAudio = true;
            defaultAudioCodec ??= format.Muxer;
        }
        else if (format.Category == "Audio")
        {
            supportsVideo = false;
            supportsAudio = true;
        }
        else if (format.Category == "Images & Animation")
        {
            supportsVideo = true;
            supportsAudio = false;
        }

        string? videoEncoder = ChooseEncoderForCodec(defaultVideoCodec, _encoderCache);
        string? audioEncoder = ChooseEncoderForCodec(defaultAudioCodec, _encoderCache);

        string media = format.Media;
        if (format.Category == "Images & Animation") media = AnimationMuxers.Contains(format.Muxer) ? "animation" : "image";
        else if (supportsVideo) media = "video";
        else if (supportsAudio) media = "audio";

        string flags = $"{(supportsVideo ? "v" : string.Empty)}{(supportsAudio ? "a" : string.Empty)}";
        return format with
        {
            Media = media,
            Preset = $"resolved:{flags}",
            VideoEncoder = videoEncoder ?? format.VideoEncoder,
            AudioEncoder = audioEncoder ?? format.AudioEncoder
        };
    }

    public static bool TryResolvedSupport(OutputFormatOption format, out bool supportsVideo, out bool supportsAudio)
    {
        supportsVideo = true;
        supportsAudio = true;
        if (!format.Preset.StartsWith("resolved:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string flags = format.Preset["resolved:".Length..];
        supportsVideo = flags.Contains('v', StringComparison.OrdinalIgnoreCase);
        supportsAudio = flags.Contains('a', StringComparison.OrdinalIgnoreCase);
        return true;
    }

    private static (bool? Video, bool? Audio) StreamSupport(OutputFormatOption format)
    {
        if (TryResolvedSupport(format, out bool resolvedVideo, out bool resolvedAudio))
        {
            return (resolvedVideo, resolvedAudio);
        }
        if (format.Media == "audio" || format.Category == "Audio" || RawAudioMuxers.Contains(format.Muxer))
        {
            return (false, true);
        }
        if (format.Media is "image" or "animation" || format.Category == "Images & Animation")
        {
            return (true, false);
        }
        if (RawVideoMuxers.Contains(format.Muxer))
        {
            return (true, false);
        }
        if (format.Media == "video")
        {
            return (true, true);
        }
        if (format.Category == "Subtitles & Data")
        {
            return (false, false);
        }
        return (null, null);
    }

    private static MediaKind DetectKind(IMediaInfo info, string path, bool hasVideo, bool hasAudio)
    {
        if (ImageExtensions.Contains(Path.GetExtension(path))) return MediaKind.Image;
        if (hasVideo && !hasAudio && info.Duration <= TimeSpan.FromMilliseconds(200)) return MediaKind.Image;
        if (hasVideo) return MediaKind.Video;
        if (hasAudio) return MediaKind.Audio;
        return MediaKind.Unknown;
    }

    private static HashSet<string> ParseEncoderNames(string text)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in (text ?? string.Empty).Split(["\r\n", "\n"], StringSplitOptions.None))
        {
            Match match = Regex.Match(line, @"^\s*[VAS]\S*\s+([^\s]+)\s+");
            if (match.Success) result.Add(match.Groups[1].Value);
        }
        return result;
    }

    private static string? ParseDefaultCodec(string text, string type)
    {
        Match match = Regex.Match(text ?? string.Empty, $@"Default {Regex.Escape(type)} codec:\s*([^\s.]+)", RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        string codec = match.Groups[1].Value.Trim().ToLowerInvariant();
        return codec is "none" or "unknown" or "n/a" ? null : codec;
    }

    private static string? ChooseEncoderForCodec(string? codec, HashSet<string> encoders)
    {
        if (string.IsNullOrWhiteSpace(codec)) return null;
        IEnumerable<string> choices = CodecEncoderChoices.TryGetValue(codec, out string[]? mapped) ? mapped : [codec];
        return choices.FirstOrDefault(encoders.Contains);
    }

    private static string? ResolvedCodecMessage(OutputFormatOption format)
    {
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(format.VideoEncoder)) parts.Add($"video: {format.VideoEncoder}");
        if (!string.IsNullOrWhiteSpace(format.AudioEncoder)) parts.Add($"audio: {format.AudioEncoder}");
        return parts.Count == 0 ? null : $"FFmpeg preset: {string.Join(", ", parts)}.";
    }

    private static FormatCompatibilityResult Result(
        FormatCompatibilityLevel level,
        string message,
        bool dropsVideo = false,
        bool dropsAudio = false)
    {
        return level switch
        {
            FormatCompatibilityLevel.Recommended => new(level, "★", "Recommended", message, true, dropsVideo, dropsAudio),
            FormatCompatibilityLevel.Compatible => new(level, "✓", "Compatible", message, true, dropsVideo, dropsAudio),
            FormatCompatibilityLevel.StreamDrop => new(level, "△", "Drops streams", message, true, dropsVideo, dropsAudio),
            FormatCompatibilityLevel.Special => new(level, "⚙", "Special", message, true, dropsVideo, dropsAudio),
            _ => new(level, "×", "Unsupported", message, false, dropsVideo, dropsAudio)
        };
    }

    private static async Task<string> RunFfmpegAsync(string arguments)
    {
        string ffmpegPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ffmpeg.exe");
        if (!File.Exists(ffmpegPath))
        {
            throw new FileNotFoundException("ffmpeg.exe could not be found.", ffmpegPath);
        }

        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = ffmpegPath,
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
        return $"{await stdoutTask}\n{await stderrTask}";
    }
}
