namespace Server.Config
{
    public class AlphaVantageOptions
    {
        public const string SectionName = "AlphaVantage";

        public string ApiKey { get; set; } = string.Empty;
        public List<string> ApiKeys { get; set; } = [];
        public string BaseUrl { get; set; } = "https://www.alphavantage.co";
        public List<string> Symbols { get; set; } = [];

        /// <summary>
        /// When false, ingestion never calls Alpha Vantage (quotes use Yahoo/Stooq; AV news skipped).
        /// Use with a free-tier key you do not want to burn, or when relying only on fallback providers.
        /// </summary>
        public bool UseAlphaVantageIngestion { get; set; } = true;

        /// <summary>
        /// When true, registers a second background job for news/Finnhub/social/confidence on <see cref="ExtendedPollingIntervalMinutes"/>.
        /// When false, only quote ingestion runs on <see cref="QuotePollingIntervalMinutes"/> (minimal external API usage).
        /// </summary>
        public bool RunExtendedIngestionJob { get; set; } = true;

        /// <summary>How often to refresh prices only (lightweight; uses Yahoo/Stooq when Alpha Vantage ingestion is off).</summary>
        public int QuotePollingIntervalMinutes { get; set; } = 15;

        /// <summary>
        /// How often to run news, Finnhub, Reddit/X/Facebook, and confidence (heavy).
        /// Should be greater than or equal to <see cref="QuotePollingIntervalMinutes"/> on free tiers.
        /// </summary>
        public int ExtendedPollingIntervalMinutes { get; set; } = 120;

        /// <summary>
        /// Extra delay before the extended ingestion loop starts (avoids overlapping the first quote-only pass on startup).
        /// </summary>
        public int ExtendedJobStartupOffsetSeconds { get; set; } = 120;

        /// <summary>Legacy single-interval setting; kept for compatibility and documentation. Prefer quote + extended intervals.</summary>
        public int PollingIntervalMinutes { get; set; } = 60;
        public int NewsPageSize { get; set; } = 10;

        /// <summary>Wait this many seconds after host start before the first ingestion run (lets Swagger / Kestrel respond first).</summary>
        public int StartupDelaySeconds { get; set; } = 15;

        /// <summary>Pause after finishing one symbol before starting the next (reduces Alpha Vantage rate-limit hits).</summary>
        public int DelayBetweenSymbolIngestionSeconds { get; set; } = 15;

        /// <summary>Pause between HTTP calls within the same symbol (quote → news → Finnhub, etc.). Also spaces Yahoo/Stooq.</summary>
        public int DelayBetweenAlphaVantageCallsSeconds { get; set; } = 15;

        /// <summary>
        /// Quote-only job: process at most this many symbols per tick, rotating through the full set (0 = all symbols every tick).
        /// </summary>
        public int MaxSymbolsPerQuoteBatch { get; set; } = 0;

        /// <summary>
        /// Extended job: max symbols per tick for news/social (0 = all every run).
        /// </summary>
        public int MaxSymbolsPerExtendedBatch { get; set; } = 0;

        /// <summary>
        /// Minimum wall-clock seconds between Alpha Vantage SYMBOL_SEARCH calls when the DB has no hits (0 = no limit).
        /// </summary>
        public int AlphaVantageSymbolSearchMinIntervalSeconds { get; set; } = 0;
    }
}
