import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

export interface FunctionCallResult {
  name: string;
  args: Record<string, unknown>;
}

export interface GenerateContentResult {
  text?: string;
  reasoningContent?: string;
  functionCalls?: FunctionCallResult[];
}

export interface GenerateContentParams {
  model: string;
  contents: unknown[];
  systemInstruction?: string;
  tools?: { functionDeclarations: { name: string; description: string; parameters: Record<string, unknown> }[] }[];
  config?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  };
}

export interface AIClient {
  generateContent(params: GenerateContentParams): Promise<GenerateContentResult>;
  generateContentStream(
    model: string,
    contents: string,
    systemInstruction: string | undefined,
    onToken: (token: string) => void,
    extraConfig?: Record<string, unknown>
  ): Promise<string>;
}

class GeminiClient implements AIClient {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
  }

  async generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
    const { model, contents, config, systemInstruction, tools } = params;
    const response = await this.ai.models.generateContent({
      model,
      contents: contents as any,
      config: {
        systemInstruction,
        tools,
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
        responseMimeType: config?.responseMimeType,
        ...(config?.responseSchema ? { responseSchema: config.responseSchema } : {}),
      },
    });
    return {
      text: response.text || undefined,
      functionCalls: response.functionCalls?.map(fc => ({
        name: fc.name!,
        args: (fc.args || {}) as Record<string, unknown>,
      })),
    };
  }

  async generateContentStream(
    model: string,
    contents: string,
    systemInstruction: string | undefined,
    onToken: (token: string) => void,
    extraConfig?: Record<string, unknown>
  ): Promise<string> {
    const stream = await this.ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        ...extraConfig,
      },
    });

    let full = '';
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        full += text;
        onToken(text);
      }
    }
    return full;
  }
}

interface OpenAIChoice {
  message: {
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: {
      id: string;
      function: {
        name: string;
        arguments: string;
      };
    }[];
  };
  finish_reason: string;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

interface OpenAIStreamChunk {
  choices: {
    delta: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
}

class OpenAICompatibleClient implements AIClient {
  private apiKey: string;
  private baseUrl: string;
  private name: string;

  constructor(config: { baseUrl: string; apiKey: string; name: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.name = config.name;
  }

  private convertContents(contents: unknown[]): { role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }[] {
    const messages: { role: string; content?: string; tool_calls?: unknown[]; tool_call_id?: string; reasoning_content?: string }[] = [];
    // Track tool_call_ids by function name so tool responses can match the exact ID
    const lastToolCallIds = new Map<string, string>();

    for (const msg of contents as { role: string; parts?: { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: { output: unknown } } }[]; reasoningContent?: string }[]) {
      const parts = msg.parts || [];
      const textParts = parts.filter(p => p.text).map(p => p.text).join('\n');
      const functionCallParts = parts.filter(p => p.functionCall);
      const functionResponsePart = parts.find(p => p.functionResponse);

      if (functionCallParts.length > 0) {
        // Group ALL function calls from one response into ONE assistant message
        // This is REQUIRED for DeepSeek/Zen when reasoning_content is present
        lastToolCallIds.clear();
        const toolCalls = functionCallParts.map((p, i) => {
          const id = `call_${p.functionCall!.name}_${i}`;
          lastToolCallIds.set(p.functionCall!.name, id);
          return {
            id,
            type: 'function' as const,
            function: {
              name: p.functionCall!.name,
              arguments: JSON.stringify(p.functionCall!.args),
            },
          };
        });
        const assistantMsg: { role: string; tool_calls: typeof toolCalls; reasoning_content?: string } = {
          role: 'assistant',
          tool_calls: toolCalls,
        };
        if (msg.reasoningContent) {
          assistantMsg.reasoning_content = msg.reasoningContent;
        }
        messages.push(assistantMsg);
      } else if (functionResponsePart?.functionResponse) {
        const fr = functionResponsePart.functionResponse;
        const toolCallId = lastToolCallIds.get(fr.name) || `call_${fr.name}_0`;
        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(fr.response.output),
        });
      } else if (textParts) {
        const assistantMsg: { role: string; content: string; reasoning_content?: string } = { role: msg.role === 'model' ? 'assistant' : 'user', content: textParts };
        if (msg.reasoningContent) {
          assistantMsg.reasoning_content = msg.reasoningContent;
        }
        messages.push(assistantMsg);
      }
    }

    return messages;
  }

  private convertTools(tools: GenerateContentParams['tools']): { type: string; function: Record<string, unknown> }[] | undefined {
    if (!tools || !tools[0]?.functionDeclarations?.length) return undefined;
    return tools[0].functionDeclarations.map(fd => ({
      type: 'function',
      function: {
        name: fd.name,
        description: fd.description,
        parameters: fd.parameters,
      },
    }));
  }

  async generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
    const { model, contents, systemInstruction, tools, config } = params;
    const messages = this.convertContents(contents);
    const convertedTools = this.convertTools(tools);

    if (systemInstruction) {
      messages.unshift({ role: 'system', content: systemInstruction });
    }

    const body: Record<string, unknown> = {
      model: model,
      messages,
      temperature: config?.temperature ?? 0.7,
    };

    if (convertedTools) {
      body.tools = convertedTools;
    }

    if (config?.maxOutputTokens) {
      body.max_tokens = config.maxOutputTokens;
    }

    if (config?.responseMimeType === 'application/json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];

    if (!choice) return {};

    const result: GenerateContentResult = {};

    if (choice.message.content) {
      result.text = choice.message.content;
    }

    if (choice.message.reasoning_content) {
      result.reasoningContent = choice.message.reasoning_content;
    }

    if (choice.message.tool_calls) {
      result.functionCalls = choice.message.tool_calls.map(tc => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));
    }

    return result;
  }

  async generateContentStream(
    model: string,
    contents: string,
    systemInstruction: string | undefined,
    onToken: (token: string) => void,
    extraConfig?: Record<string, unknown>
  ): Promise<string> {
    const messages: { role: string; content: string }[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: contents });

    const body: Record<string, unknown> = {
      model: model,
      messages,
      temperature: 0.7,
      stream: true,
      ...extraConfig,
    };

    if (extraConfig?.responseMimeType === 'application/json') {
      body.response_format = { type: 'json_object' };
      delete body.responseMimeType;
    }

    delete body.responseMimeType;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body for streaming');

    const decoder = new TextDecoder();
    let full = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const chunk = JSON.parse(data) as OpenAIStreamChunk;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            full += delta.content;
            onToken(delta.content);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    return full;
  }
}

let _provider: AIClient | null = null;
let _providerInfo: ProviderInfo = { type: 'none', model: 'none', createdAt: 0 };

export interface ProviderInfo {
  type: string;
  model: string;
  createdAt: number;
}

export function getModel(): string {
  const provider = process.env.AI_PROVIDER || 'gemini';
  switch (provider) {
    case 'zen':
      return process.env.ZEN_MODEL || 'big-pickle';
    case 'openrouter':
      return process.env.OPENROUTER_MODEL || 'opencode/big-pickle';
    case 'gemini':
    default:
      return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  }
}

export function getProviderInfo(): ProviderInfo {
  return { ..._providerInfo };
}

export function resetProvider(): void {
  _provider = null;
  _providerInfo = { type: 'none', model: 'none', createdAt: 0 };
}

export function recreateProvider(): AIClient {
  dotenv.config({ override: true });
  resetProvider();
  return createAIProvider();
}

export function createAIProvider(): AIClient {
  if (_provider) return _provider;

  const providerType = process.env.AI_PROVIDER || 'gemini';
  const model = getModel();

  switch (providerType) {
    case 'openrouter':
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY environment variable is required');
      }
      _provider = new OpenAICompatibleClient({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        name: 'OpenRouter',
      });
      break;
    case 'zen':
      if (!process.env.ZEN_API_KEY) {
        throw new Error('ZEN_API_KEY environment variable is required (get one at https://opencode.ai/auth)');
      }
      _provider = new OpenAICompatibleClient({
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKey: process.env.ZEN_API_KEY,
        name: 'Zen',
      });
      break;
    case 'gemini':
    default:
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      _provider = new GeminiClient();
      break;
  }

  _providerInfo = { type: providerType, model, createdAt: Date.now() };
  return _provider;
}
