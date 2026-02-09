export interface Model {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  context_length: number;
  isFree: boolean;
}

export interface ModelGroup {
  provider: string;
  models: Model[];
}

export interface CompareResult {
  modelId: string;
  loading: boolean;
  text: string;
  time: number;
  tokens: number;
  error?: string;
}
