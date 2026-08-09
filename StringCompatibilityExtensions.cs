namespace MediaSqueeze;

internal static class StringCompatibilityExtensions
{
    public static bool Contains(this string value, char character, StringComparison comparison) =>
        value.IndexOf(character.ToString(), comparison) >= 0;
}
