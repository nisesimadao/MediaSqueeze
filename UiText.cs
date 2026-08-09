using System.Globalization;
using System.Text.RegularExpressions;

namespace MediaSqueeze;

public static class UiText
{
    public static bool IsJapanese => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("ja", StringComparison.OrdinalIgnoreCase);

    public static string T(string english, string japanese) => IsJapanese ? japanese : english;

    public static string Category(string category)
    {
        if (!IsJapanese) return category;
        return category switch
        {
            "Video" => "動画",
            "Audio" => "音声",
            "Images & Animation" => "画像・アニメーション",
            "Streaming & Broadcast" => "ストリーミング・配信",
            "Raw / Elementary Streams" => "Raw・エレメンタリーストリーム",
            "Subtitles & Data" => "字幕・データ",
            "Advanced / Other" => "高度・その他",
            _ => category
        };
    }

    public static string Kind(MediaKind kind)
    {
        if (!IsJapanese) return kind.ToString();
        return kind switch
        {
            MediaKind.Video => "動画",
            MediaKind.Audio => "音声",
            MediaKind.Image => "画像",
            _ => "不明"
        };
    }

    public static string CompatibilityLabel(FormatCompatibilityLevel level)
    {
        return level switch
        {
            FormatCompatibilityLevel.Recommended => T("Recommended", "おすすめ"),
            FormatCompatibilityLevel.Compatible => T("Compatible", "互換"),
            FormatCompatibilityLevel.StreamDrop => T("Drops streams", "一部除外"),
            FormatCompatibilityLevel.Special => T("Special", "特殊"),
            _ => T("Unsupported", "非対応")
        };
    }

    public static string LocalizeCompatibilityMessage(string message)
    {
        if (!IsJapanese || string.IsNullOrWhiteSpace(message)) return message;

        return message switch
        {
            "No usable audio/video stream was detected." => "使用可能な動画・音声ストリームが見つかりませんでした。",
            "This FFmpeg output is a control/data/special-purpose muxer and may require extra parameters." => "制御・データ・特殊用途のMuxerです。追加のFFmpeg引数が必要な場合があります。",
            "This output does not accept the detected media streams." => "検出されたメディアストリームをこの形式では出力できません。",
            "FFmpeg supports this muxer; MediaSqueeze will inspect its default codecs before conversion." => "FFmpegはこのMuxerに対応しています。変換前に既定コーデックを確認します。",
            "Common, broadly compatible choice for this input." => "この入力に適した、一般的で互換性の高い形式です。",
            "Special-purpose FFmpeg output. Review the muxer description before using it." => "特殊用途のFFmpeg出力です。Muxerの説明を確認してから使用してください。",
            "The detected media streams can be converted to this output." => "検出されたメディアストリームをこの形式へ変換できます。",
            _ => LocalizeCompatibilityPattern(message)
        };
    }

    public static string LocalizeRuntimeMessage(string message)
    {
        if (!IsJapanese || string.IsNullOrWhiteSpace(message)) return message;

        string localized = message switch
        {
            "Please select a valid file." => "有効なファイルを選択してください。",
            "Choose Percent, Width, or Height for Resize mode." => "リサイズでは「倍率」「幅」「高さ」のいずれかを選択してください。",
            "Enter a positive number for Size." => "サイズには正の数値を入力してください。",
            "Percent must be 400 or lower." => "倍率は400%以下にしてください。",
            "Input file was not found." => "入力ファイルが見つかりません。",
            "ffmpeg.exe could not be found after setup." => "セットアップ後も ffmpeg.exe が見つかりませんでした。",
            "Could not start FFmpeg." => "FFmpegを起動できませんでした。",
            "Output extension must be 1–16 letters or numbers, for example mp4, mkv, webm, m4a, or png." => "出力拡張子は1〜16文字の英数字で指定してください（例: mp4, mkv, webm, m4a, png）。",
            "FFmpeg completed without creating the expected output. Use {output} for the output path when supplying a full command layout." => "FFmpegは終了しましたが、想定した出力ファイルが作成されませんでした。コマンド全体の位置を指定する場合は出力先に {output} を使ってください。",
            _ => message
        };

        if (localized != message) return localized;

        Match match = Regex.Match(message, @"^FFmpeg exited with code (-?\d+)\.(.*)$", RegexOptions.Singleline);
        if (match.Success)
        {
            return $"FFmpegが終了コード {match.Groups[1].Value} で停止しました。{match.Groups[2].Value}";
        }

        match = Regex.Match(message, @"^Unclosed (double|single) quote in custom arguments\.$");
        if (match.Success)
        {
            string quote = match.Groups[1].Value == "double" ? "ダブル" : "シングル";
            return $"カスタム引数内の{quote}引用符が閉じられていません。";
        }

        return message;
    }

    private static string LocalizeCompatibilityPattern(string message)
    {
        Match match = Regex.Match(message, @"^This format requires (.+) input\.$");
        if (match.Success)
        {
            string required = match.Groups[1].Value switch
            {
                "video/image" => "動画または画像",
                "audio" => "音声",
                _ => "対応するメディア"
            };
            return $"この形式には{required}の入力が必要です。";
        }

        string trimmed = message.TrimEnd('.');
        string[] parts = trimmed.Split("; ", StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length > 0 && parts.All(part => part is "video will be removed" or "audio will be removed" or "only one frame will be kept"))
        {
            return string.Join("・", parts.Select(part => part switch
            {
                "video will be removed" => "動画は除外されます",
                "audio will be removed" => "音声は除外されます",
                _ => "先頭の1フレームだけを出力します"
            }));
        }

        if (message.StartsWith("FFmpeg preset: ", StringComparison.Ordinal))
        {
            string body = message["FFmpeg preset: ".Length..].TrimEnd('.');
            body = Regex.Replace(body, @"\bvideo codec: ", "動画コーデック: ");
            body = Regex.Replace(body, @"\bvideo: ", "動画: ");
            body = Regex.Replace(body, @"\baudio codec: ", "音声コーデック: ");
            body = Regex.Replace(body, @"\baudio: ", "音声: ");
            return $"FFmpeg設定: {body}";
        }

        return message;
    }
}
