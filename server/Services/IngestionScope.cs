namespace Server.Services;

/// <summary>
/// Controls which parts of ingestion run. Splitting quotes from extended work reduces external API calls per tick.
/// </summary>
public enum IngestionScope
{
    /// <summary>Quotes, news, Finnhub, social signals, confidence — full pipeline per symbol.</summary>
    Full = 0,

    /// <summary>Price quotes only (Alpha Vantage when enabled, else Yahoo/Stooq).</summary>
    QuotesOnly = 1,

    /// <summary>News, Finnhub, Reddit/X/Facebook, confidence — no quote fetch.</summary>
    ExtendedOnly = 2
}
