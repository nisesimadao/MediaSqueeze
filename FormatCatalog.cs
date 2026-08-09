using System.Text.RegularExpressions;

namespace MediaSqueeze;

public sealed record OutputFormatOption(
    string Id,
    string Label,
    string Category,
    string Muxer,
    string Extension,
    string Media,
    string Preset,
    string Description,
    string? VideoEncoder = null,
    string? AudioEncoder = null,
    string? ImageEncoder = null)
{
    public string DisplayLabel => $"{Label} (.{Extension})";
}

public static class FormatCatalog
{
    private static readonly string[] CategoryOrder =
    [
        "Video",
        "Audio",
        "Images & Animation",
        "Streaming & Broadcast",
        "Raw / Elementary Streams",
        "Subtitles & Data",
        "Advanced / Other"
    ];

    private static readonly Dictionary<string, string> ExtensionOverrides = new(StringComparer.OrdinalIgnoreCase)
    {
        ["matroska"] = "mkv", ["mpeg"] = "mpg", ["mpegts"] = "ts", ["ipod"] = "m4a",
        ["adts"] = "aac", ["image2"] = "img", ["hls"] = "m3u8", ["dash"] = "mpd",
        ["smoothstreaming"] = "ism", ["segment"] = "segment", ["stream_segment"] = "segment",
        ["ssegment"] = "segment", ["tee"] = "txt", ["framecrc"] = "txt", ["framemd5"] = "txt",
        ["hash"] = "txt", ["md5"] = "txt", ["crc"] = "txt", ["streamhash"] = "txt",
        ["null"] = "null"
    };

    private static readonly HashSet<string> RawMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "ac3", "adts", "aptx", "aptx_hd", "av1", "cavsvideo", "codec2raw", "data", "dfpwm",
        "dirac", "dnxhd", "dts", "eac3", "g722", "g723_1", "g726", "g726le", "gsm", "h261",
        "h263", "h264", "hevc", "ilbc", "m4v", "mjpeg", "mlp", "mp2", "mpeg1video",
        "mpeg2video", "rawvideo", "sbc", "truehd", "vc1", "vvc"
    };

    private static readonly HashSet<string> StreamingMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "dash", "hls", "fifo", "fifo_test", "flv", "ismv", "mpegts", "rtp", "rtp_mpegts",
        "rtsp", "sap", "segment", "stream_segment", "ssegment", "smoothstreaming", "tee"
    };

    private static readonly HashSet<string> AudioMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "ac3", "adts", "aiff", "alaw", "amr", "apm", "aptx", "aptx_hd", "au", "caf", "codec2",
        "dfpwm", "dts", "eac3", "f64be", "f64le", "f32be", "f32le", "flac", "g722", "g723_1",
        "g726", "g726le", "gsm", "ircam", "latm", "m4a", "mlp", "mp2", "mp3", "mulaw", "oga",
        "ogg", "oma", "opus", "s16be", "s16le", "s24be", "s24le", "s32be", "s32le", "s8", "sbc",
        "sox", "spdif", "tta", "truehd", "u16be", "u16le", "u24be", "u24le", "u32be", "u32le",
        "u8", "voc", "w64", "wav", "wv"
    };

    private static readonly HashSet<string> VideoMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "3g2", "3gp", "asf", "asf_stream", "avi", "avif", "dv", "f4v", "film_cpk", "flv", "gxf",
        "ipod", "ismv", "ivf", "matroska", "matroska_audio", "mjpeg", "mov", "mp4", "mpeg",
        "mpeg1video", "mpeg2video", "mpegts", "mxf", "mxf_d10", "mxf_opatom", "nut", "ogv", "rm",
        "roq", "vob", "webm", "webm_chunk", "webm_dash_manifest", "wtv"
    };

    private static readonly HashSet<string> ImageMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "apng", "avif", "gif", "image2", "image2pipe"
    };

    private static readonly HashSet<string> SubtitleDataMuxers = new(StringComparer.OrdinalIgnoreCase)
    {
        "ass", "data", "ffmetadata", "microdvd", "srt", "sup", "ttml", "webvtt"
    };

    private static readonly FormatDefinition[] CommonDefinitions =
    [
        new("mp4", "MP4", "Video", ["mp4"], "mp4", "video", "h264-aac"),
        new("mov", "MOV / QuickTime", "Video", ["mov"], "mov", "video", "h264-aac"),
        new("mkv", "MKV / Matroska", "Video", ["matroska"], "mkv", "video", "h264-aac"),
        new("webm", "WebM", "Video", ["webm"], "webm", "video", "webm"),
        new("avi", "AVI", "Video", ["avi"], "avi", "video", "avi"),
        new("mpegts", "MPEG-TS", "Video", ["mpegts"], "ts", "video", "mpegts"),
        new("mpeg", "MPEG-PS", "Video", ["mpeg"], "mpg", "video", "mpeg"),
        new("flv", "FLV", "Video", ["flv"], "flv", "video", "h264-aac"),
        new("3gp", "3GP", "Video", ["3gp"], "3gp", "video", "h264-aac"),
        new("3g2", "3G2", "Video", ["3g2"], "3g2", "video", "h264-aac"),
        new("wmv", "WMV / ASF", "Video", ["asf"], "wmv", "video", "asf"),
        new("nut", "NUT", "Video", ["nut"], "nut", "video", "auto"),

        new("mp3", "MP3", "Audio", ["mp3"], "mp3", "audio", "mp3"),
        new("m4a", "M4A / AAC", "Audio", ["ipod", "mp4"], "m4a", "audio", "aac"),
        new("wav", "WAV", "Audio", ["wav"], "wav", "audio", "wav"),
        new("flac", "FLAC", "Audio", ["flac"], "flac", "audio", "flac"),
        new("ogg", "OGG / Vorbis", "Audio", ["ogg"], "ogg", "audio", "vorbis"),
        new("opus", "Opus", "Audio", ["opus", "ogg"], "opus", "audio", "opus"),
        new("aac", "AAC / ADTS", "Audio", ["adts"], "aac", "audio", "aac"),
        new("aiff", "AIFF", "Audio", ["aiff"], "aiff", "audio", "aiff"),
        new("ac3", "AC-3", "Audio", ["ac3"], "ac3", "audio", "ac3"),
        new("eac3", "E-AC-3", "Audio", ["eac3"], "eac3", "audio", "eac3"),
        new("caf", "CAF", "Audio", ["caf"], "caf", "audio", "pcm"),
        new("au", "AU", "Audio", ["au"], "au", "audio", "pcm-be"),
        new("w64", "Wave64", "Audio", ["w64"], "w64", "audio", "pcm"),
        new("mp2", "MP2", "Audio", ["mp2"], "mp2", "audio", "mp2"),

        new("jpg", "JPEG / JPG", "Images & Animation", ["image2"], "jpg", "image", "jpg", ["mjpeg"]),
        new("png", "PNG", "Images & Animation", ["image2"], "png", "image", "png", ["png"]),
        new("webp", "WebP", "Images & Animation", ["image2"], "webp", "image", "webp", ["libwebp", "webp"]),
        new("avif", "AVIF", "Images & Animation", ["avif"], "avif", "image", "avif", ["libaom-av1", "librav1e", "libsvtav1", "av1"]),
        new("gif", "GIF", "Images & Animation", ["gif"], "gif", "animation", "gif", ["gif"]),
        new("apng", "Animated PNG / APNG", "Images & Animation", ["apng"], "apng", "animation", "apng", ["apng"]),
        new("tiff", "TIFF", "Images & Animation", ["image2"], "tiff", "image", "tiff", ["tiff"]),
        new("bmp", "BMP", "Images & Animation", ["image2"], "bmp", "image", "bmp", ["bmp"]),
        new("tga", "TGA", "Images & Animation", ["image2"], "tga", "image", "tga", ["targa"]),
        new("qoi", "QOI", "Images & Animation", ["image2"], "qoi", "image", "qoi", ["qoi"]),
        new("ppm", "PPM", "Images & Animation", ["image2"], "ppm", "image", "ppm", ["ppm"]),
        new("pgm", "PGM", "Images & Animation", ["image2"], "pgm", "image", "pgm", ["pgm"]),
        new("pbm", "PBM", "Images & Animation", ["image2"], "pbm", "image", "pbm", ["pbm"])
    ];

    private static readonly Dictionary<string, string> FallbackMuxers = CommonDefinitions
        .SelectMany(definition => definition.Muxers.Select(muxer => new KeyValuePair<string, string>(muxer, definition.Label)))
        .GroupBy(pair => pair.Key, StringComparer.OrdinalIgnoreCase)
        .ToDictionary(group => group.Key, group => group.First().Value, StringComparer.OrdinalIgnoreCase);

    private static readonly HashSet<string> FallbackEncoders = new(StringComparer.OrdinalIgnoreCase)
    {
        "libx264", "mpeg4", "aac", "libvpx-vp9", "libopus", "libmp3lame", "pcm_s16le", "pcm_s16be",
        "flac", "libvorbis", "ac3", "eac3", "mp2", "mjpeg", "png", "libwebp", "gif", "apng",
        "tiff", "bmp", "targa", "qoi", "ppm", "pgm", "pbm"
    };

    public static IReadOnlyList<OutputFormatOption> Fallback { get; } = Build(FallbackMuxers, FallbackEncoders, [], true);

    public static IReadOnlyList<OutputFormatOption> Build(string muxerText, string encoderText, string deviceText)
    {
        Dictionary<string, string> muxers = ParseMuxers(muxerText);
        HashSet<string> encoders = ParseEncoders(encoderText);
        HashSet<string> devices = new(ParseMuxers(deviceText).Keys, StringComparer.OrdinalIgnoreCase);
        IReadOnlyList<OutputFormatOption> result = Build(muxers, encoders, devices, false);
        return result.Count > 0 ? result : Fallback;
    }

    private static IReadOnlyList<OutputFormatOption> Build(
        IReadOnlyDictionary<string, string> muxers,
        HashSet<string> encoders,
        HashSet<string> devices,
        bool fallbackOnly)
    {
        var byCategory = CategoryOrder.ToDictionary(category => category, _ => new List<(int Rank, OutputFormatOption Option)>(), StringComparer.Ordinal);
        var represented = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int rank = 0; rank < CommonDefinitions.Length; rank++)
        {
            FormatDefinition definition = CommonDefinitions[rank];
            string? muxer = definition.Muxers.FirstOrDefault(muxers.ContainsKey);
            if (muxer is null)
            {
                continue;
            }

            if (definition.Encoders is { Length: > 0 } && !definition.Encoders.Any(encoders.Contains))
            {
                continue;
            }

            var option = new OutputFormatOption(
                definition.Id,
                definition.Label,
                definition.Category,
                muxer,
                definition.Extension,
                definition.Media,
                definition.Preset,
                muxers.TryGetValue(muxer, out string? description) ? description : definition.Label,
                ChooseEncoder(encoders, VideoEncoderChoices(definition.Preset)),
                ChooseEncoder(encoders, AudioEncoderChoices(definition.Preset)),
                ChooseEncoder(encoders, definition.Encoders ?? []));

            byCategory[definition.Category].Add((rank, option));
            represented.Add(muxer);
        }

        if (!fallbackOnly)
        {
            foreach ((string muxer, string description) in muxers)
            {
                if (devices.Contains(muxer) || represented.Contains(muxer))
                {
                    continue;
                }

                string category = ClassifyMuxer(muxer, description);
                string extension = InferExtension(muxer);
                var option = new OutputFormatOption(
                    $"muxer:{muxer}",
                    FriendlyName(muxer, description),
                    category,
                    muxer,
                    extension,
                    "auto",
                    "auto",
                    description);
                byCategory[category].Add((10000, option));
            }
        }

        var result = new List<OutputFormatOption>();
        foreach (string category in CategoryOrder)
        {
            result.AddRange(byCategory[category]
                .OrderBy(item => item.Rank)
                .ThenBy(item => item.Option.Label, StringComparer.OrdinalIgnoreCase)
                .Select(item => item.Option));
        }
        return result;
    }

    private static Dictionary<string, string> ParseMuxers(string text)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in SplitLines(text))
        {
            Match match = Regex.Match(line, @"^\s*E\s+([^\s]+)\s+(.*)$");
            if (!match.Success)
            {
                continue;
            }

            foreach (string alias in match.Groups[1].Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                result.TryAdd(alias, match.Groups[2].Value.Trim());
            }
        }
        return result;
    }

    private static HashSet<string> ParseEncoders(string text)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string line in SplitLines(text))
        {
            Match match = Regex.Match(line, @"^\s*[VAS]\S*\s+([^\s]+)\s+");
            if (match.Success)
            {
                result.Add(match.Groups[1].Value);
            }
        }
        return result;
    }

    private static IEnumerable<string> SplitLines(string text) =>
        (text ?? string.Empty).Split(["\r\n", "\n"], StringSplitOptions.None);

    private static string? ChooseEncoder(HashSet<string> encoders, IEnumerable<string> choices) =>
        choices.FirstOrDefault(encoders.Contains);

    private static IEnumerable<string> VideoEncoderChoices(string preset) => preset switch
    {
        "webm" => ["libvpx-vp9", "libvpx", "vp9", "vp8"],
        "avi" => ["mpeg4", "libxvid"],
        "mpeg" or "mpegts" => ["mpeg2video", "mpeg1video"],
        "asf" => ["wmv2", "wmv1", "mpeg4"],
        "h264-aac" => ["libx264", "mpeg4"],
        _ => []
    };

    private static IEnumerable<string> AudioEncoderChoices(string preset) => preset switch
    {
        "webm" or "opus" => ["libopus", "opus", "libvorbis"],
        "avi" => ["libmp3lame", "mp3", "mp2"],
        "mpeg" => ["mp2", "aac"],
        "mpegts" or "h264-aac" or "aac" => ["aac"],
        "asf" => ["wmav2", "wmav1", "aac"],
        "mp3" => ["libmp3lame", "mp3"],
        "wav" or "pcm" => ["pcm_s16le"],
        "pcm-be" or "aiff" => ["pcm_s16be"],
        "flac" => ["flac"],
        "vorbis" => ["libvorbis", "vorbis"],
        "ac3" => ["ac3", "ac3_fixed"],
        "eac3" => ["eac3"],
        "mp2" => ["mp2"],
        _ => []
    };

    private static string ClassifyMuxer(string name, string description)
    {
        string lower = $"{name} {description}".ToLowerInvariant();
        if (StreamingMuxers.Contains(name) || Regex.IsMatch(lower, @"stream|playlist|segment|rtp|rtsp|dash|hls|broadcast"))
            return "Streaming & Broadcast";
        if (ImageMuxers.Contains(name) || Regex.IsMatch(lower, @"image|picture|animated png|gif"))
            return "Images & Animation";
        if (SubtitleDataMuxers.Contains(name) || Regex.IsMatch(lower, @"subtitle|metadata|timed text|caption"))
            return "Subtitles & Data";
        if (RawMuxers.Contains(name) || Regex.IsMatch(lower, @"raw |raw$|elementary stream|checksum|hash|crc"))
            return "Raw / Elementary Streams";
        if (AudioMuxers.Contains(name) || Regex.IsMatch(lower, @"audio|sound|voice|pcm"))
            return "Audio";
        if (VideoMuxers.Contains(name) || Regex.IsMatch(lower, @"video|movie|multimedia|container|transport stream"))
            return "Video";
        return "Advanced / Other";
    }

    private static string InferExtension(string muxer)
    {
        if (ExtensionOverrides.TryGetValue(muxer, out string? extension))
        {
            return extension;
        }
        string cleaned = Regex.Replace(muxer.ToLowerInvariant(), "[^a-z0-9]+", string.Empty);
        return string.IsNullOrWhiteSpace(cleaned) ? "bin" : cleaned;
    }

    private static string FriendlyName(string muxer, string description)
    {
        string compact = Regex.Replace(description ?? string.Empty, @"\s+", " ").Trim();
        return string.IsNullOrWhiteSpace(compact) ? muxer.ToUpperInvariant() : $"{muxer.ToUpperInvariant()} — {compact}";
    }

    private sealed record FormatDefinition(
        string Id,
        string Label,
        string Category,
        string[] Muxers,
        string Extension,
        string Media,
        string Preset,
        string[]? Encoders = null);
}
