// src/types/handlers.ts
import { Request, Response } from 'express';

// Core OpenAI API Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface ModelsResponse {
  object: string;
  data: Model[];
}

export interface EmbeddingRequest {
  input: string | string[];
  model: string;
  encoding_format?: string;
}

export interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface CompletionRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stop?: string | string[];
}

export interface CompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface EnginesResponse {
  data: Array<{
    id: string;
    object: string;
    owner: string;
    ready: boolean;
  }>;
}

// Handler Interface - All OpenAI-compatible handlers must implement this
export interface OpenAIHandler {
  /**
   * Handle chat completions requests
   * Core endpoint for chat-based interactions
   */
  chatCompletions(req: Request, res: Response): Promise<void>;

  /**
   * Return available models
   * Should merge OpenAI models with custom models
   */
  getModels(req: Request, res: Response): Promise<void>;

  /**
   * Handle embeddings requests
   * Can be no-op for handlers that don't support embeddings
   */
  embeddings(req: Request, res: Response): Promise<void>;

  /**
   * Handle legacy completions requests
   * Should convert to chat completions format internally
   */
  completions(req: Request, res: Response): Promise<void>;

  /**
   * Handle engines requests (deprecated but some clients use it)
   * Can return static response
   */
  getEngines(req: Request, res: Response): Promise<void>;
}

// Handler Configuration
export interface HandlerConfig {
  name: string;
  supportedModels: string[];
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  supportsCompletions: boolean;
}

export interface OpenAIBackendConfig {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  timeout?: number;
}

export interface LangGraphConfig {
  modelName: string;
  conversationTimeout?: number;
  maxConversations?: number;
}

// LangGraph specific types
export interface AgentState {
  messages: ChatMessage[];
  conversation_id: string;
  user_id?: string;
  metadata?: Record<string, any>;
}

// Error types
export interface APIError {
  message: string;
  type: string;
  code?: string;
}

export interface ErrorResponse {
  error: APIError;
}

// Streaming types
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      role?: string;
    };
    finish_reason: string | null;
  }>;
}

// Handler Factory types
export type HandlerType = 'openai' | 'langgraph';

export interface HandlerFactory {
  createHandler(type: HandlerType, config?: any): OpenAIHandler;
  getAvailableHandlers(): HandlerType[];
  getHandlerConfig(type: HandlerType): HandlerConfig;
}

// Request context for handlers
export interface RequestContext {
  conversationId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  stream?: boolean;
  model: string;
}

// Handler response metadata
export interface ResponseMetadata {
  handler: string;
  model: string;
  processingTime: number;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export { Request, Response } from 'express';