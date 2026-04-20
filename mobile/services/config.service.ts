import { apiRequest } from "./api";

export type DataIngestionConfig = {
  pollingIntervalMinutes: number;
  /** Server quote-only job interval (prices). */
  quotePollingIntervalMinutes?: number;
  /** News / Finnhub / social / confidence job interval. */
  extendedPollingIntervalMinutes?: number;
  runExtendedIngestionJob?: boolean;
  maxSymbolsPerQuoteBatch?: number;
  maxSymbolsPerExtendedBatch?: number;
  alphaVantageSymbolSearchMinIntervalSeconds?: number;
  delayBetweenSymbolIngestionSeconds: number;
  delayBetweenAlphaVantageCallsSeconds: number;
  startupDelaySeconds: number;
  hasAlphaVantageKey: boolean;
  alphaVantageCooldownActive?: boolean;
  alphaVantageBlockedUntilUtc?: string | null;
  alphaVantageCooldownReason?: string | null;
};

export async function getDataIngestionConfig(): Promise<DataIngestionConfig | null> {
  try {
    return await apiRequest<DataIngestionConfig>("/config/data-ingestion");
  } catch {
    return null;
  }
}
