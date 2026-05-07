import type { z } from 'zod';

export type Role = 'system' | 'user' | 'assistant';

export type Message = {
  role: Role;
  content: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
};

export type GenerateArgs = {
  messages: Message[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateResult = {
  text: string;
  usage: Usage;
};

export type StreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'finish'; usage: Usage };

export type ClassifyArgs<T> = {
  schema: z.ZodType<T>;
  prompt: string;
  system?: string;
};

export interface LLMProvider {
  generate(args: GenerateArgs): Promise<GenerateResult>;
  stream(args: GenerateArgs): AsyncIterable<StreamChunk>;
  classify<T>(args: ClassifyArgs<T>): Promise<T>;
}
