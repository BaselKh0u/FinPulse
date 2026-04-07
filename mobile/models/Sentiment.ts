export interface Sentiment {
  score: number;            // -1..1
  label: "negative" | "neutral" | "positive";
  summary?: string;         // optional short text
  updatedAt?: string;       // ISO date string
}
