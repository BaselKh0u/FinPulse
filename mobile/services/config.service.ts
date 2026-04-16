import { apiRequest } from "./api";

export type DataIngestionConfig = {
  pollingIntervalMinutes: number;
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
