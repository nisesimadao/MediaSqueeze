namespace MediaSqueeze;

public partial class MainWindow
{
    private void ApplyLocalization()
    {
        if (!UiText.IsJapanese) return;

        btnSelect.Content = "ファイルを選択…";
        lblMode.Content = "モード";
        modeCompressItem.Content = "圧縮";
        modeConvertItem.Content = "変換";
        modeResizeItem.Content = "リサイズ";
        modeCustomItem.Content = "カスタム";

        txtOptionLabel.Content = "品質";
        qualityHighItem.Content = "高品質";
        qualityMediumItem.Content = "標準";
        qualityLowItem.Content = "低容量";
        txtFixedOutput.Text = "MP4で出力";
        txtCustomExtension.ToolTip = "出力拡張子（例: mp4, mkv, m4a, webp）";

        txtScaleLabel.Content = "サイズ";
        scaleOriginalItem.Content = "元のまま";
        scalePercentItem.Content = "倍率 (%)";
        scaleWidthItem.Content = "幅";
        scaleHeightItem.Content = "高さ";
        txtScaleValue.ToolTip = "倍率、幅、または高さの値";
        txtScaleHint.Text = "元のサイズを維持します。";

        lblCustomArguments.Content = "FFmpeg 引数";
        txtCustomArguments.ToolTip = "入力と出力は自動で追加されます。位置を指定したい場合は {input} と {output} を使えます。";
        txtCustomArgumentsHint.Text = "入力と出力は自動で追加されます。引用符とエスケープした空白に対応しています。位置を指定する場合は {input} と {output} を使用でき、先頭の ffmpeg は省略できます。";

        btnRun.Content = "開始";
        btnCancel.Content = "キャンセル";
        btnOpenFolder.Content = "出力を表示";
        txtStatus.Text = "ファイルを選択するか、ここへドロップしてください。";
    }
}
