import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';
import { MAIN_ENV_LOCAL, RUNTIME_DIR } from './paths.js';
import { log } from './logging.js';

dotenv.config({ path: path.join(RUNTIME_DIR, '.env') });
dotenv.config({ path: MAIN_ENV_LOCAL });

export type PaperclipModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-7';

type CallAgentInput<T extends z.ZodType> = {
  model: PaperclipModel;
  system: string;
  cacheableSystem?: string;
  user: string;
  schema: T;
  options?: {
    maxTokens?: number;
    temperature?: number;
    retries?: number;
  };
};

export function requireAnthropicKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(`ANTHROPIC_API_KEY is missing. Add it to ${MAIN_ENV_LOCAL} or runtime/.env.`);
  }
}

function shouldRetry(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || status === 529 || status >= 500 || /network|timeout|ECONNRESET|ETIMEDOUT/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const firstObject = text.indexOf('{');
    const firstArray = text.indexOf('[');
    const first = [firstObject, firstArray].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (first === undefined || last < first) throw new Error(`Agent did not return JSON: ${text.slice(0, 300)}`);
    return JSON.parse(text.slice(first, last + 1));
  }
}

export async function callAgent<T extends z.ZodType>(input: CallAgentInput<T>): Promise<z.infer<T>> {
  requireAnthropicKey();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const retries = input.options?.retries ?? 3;
  const maxTokens = input.options?.maxTokens ?? 4096;
  const temperature = input.options?.temperature ?? 0.4;

  const system = input.cacheableSystem
    ? ([
        { type: 'text', text: input.cacheableSystem, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: input.system },
      ] as Anthropic.Messages.TextBlockParam[])
    : input.system;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = (await client.messages.create({
        model: input.model,
        max_tokens: maxTokens,
        temperature,
        stream: false,
        system,
        messages: [
          {
            role: 'user',
            content: `${input.user}\n\nReturn only valid JSON. No Markdown fences, no commentary.`,
          },
        ],
      } as Anthropic.Messages.MessageCreateParamsNonStreaming)) as Anthropic.Message;

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();

      if (response.usage) {
        const usage = response.usage;
        console.log(
          `[tokens] model=${input.model} input=${usage.input_tokens} output=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} cache_create=${usage.cache_creation_input_tokens ?? 0}`,
        );
      }

      return input.schema.parse(extractJson(text));
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      const backoff = 1000 * 2 ** attempt;
      log.warn(`Anthropic call failed, retrying in ${backoff}ms`, error instanceof Error ? error.message : error);
      await sleep(backoff);
    }
  }

  throw new Error('Anthropic call exhausted retries');
}
