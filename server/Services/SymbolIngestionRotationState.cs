namespace Server.Services;

/// <summary>
/// Round-robin slices for ingestion jobs so each tick only touches a subset of symbols (reduces bursts to Yahoo/Finnhub/etc.).
/// </summary>
public sealed class SymbolIngestionRotationState
{
    private readonly object _sync = new();
    private int _quoteCursor;
    private int _extendedCursor;

    /// <summary>
    /// Returns the next batch of symbols in stable <paramref name="symbolsOrdered"/> order.
    /// When <paramref name="maxBatch"/> is 0 or >= count, returns a copy of the full list without advancing the cursor.
    /// </summary>
    public List<string> NextBatch(IReadOnlyList<string> symbolsOrdered, int maxBatch, IngestionScope scope)
    {
        if (symbolsOrdered.Count == 0)
        {
            return [];
        }

        var n = symbolsOrdered.Count;
        var limit = maxBatch <= 0 || maxBatch >= n ? n : maxBatch;
        if (limit >= n)
        {
            return symbolsOrdered.ToList();
        }

        lock (_sync)
        {
            ref var cursor = ref scope == IngestionScope.QuotesOnly ? ref _quoteCursor : ref _extendedCursor;
            var take = limit;
            var list = new List<string>(take);
            var start = cursor % n;
            for (var i = 0; i < take; i++)
            {
                list.Add(symbolsOrdered[(start + i) % n]);
            }

            cursor = start + take;
            return list;
        }
    }
}
