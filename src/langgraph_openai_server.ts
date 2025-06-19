import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StructuredToolInterface } from '@langchain/core/tools';
import { createAgent, AgentState as GraphAgentState } from './agents/graph/ng';

// Types for OpenAI API compatibility
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string | string[];
}

interface ChatCompletionResponse {
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

interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

// LangGraph Agent Class
class LangGraphAgent {
  private graph: any;
  private tools: StructuredToolInterface[];

  constructor(model: BaseChatModel, tools: StructuredToolInterface[]) {
    this.tools = tools;
    this.setupGraph(model);
  }

  private async setupGraph(model: BaseChatModel) {
    this.graph = await createAgent(model, this.tools);
    console.log("LangGraph initialized with actual agent");
  }

  async invoke(messages: ChatMessage[]): Promise<string> {
    // Convert OpenAI messages to our agent state
    const lastMessage = messages[messages.length - 1];
    
    const initialState: GraphAgentState = {
      task: lastMessage.content,
      tools: this.tools,
      history: [
        {
          node: "start",
          type: "request",
          data: lastMessage.content
        }
      ],
      score: 0,
      toolingComplete: false,
      exhausted: false,
    };

    const result = await this.graph.invoke(initialState);
    return result.agentResponse ?? result.error ?? "No result";
  }
}

class OpenAICompatibleServer {
  private app: express.Application;
  private agent: LangGraphAgent;
  private conversations: Map<string, ChatMessage[]> = new Map();

  constructor(model: BaseChatModel, tools: StructuredToolInterface[]) {
    this.app = express();
    this.agent = new LangGraphAgent(model, tools);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // OpenAI-compatible endpoints
    this.app.get('/v1/models', this.getModels.bind(this));
    this.app.post('/v1/chat/completions', this.chatCompletions.bind(this));
    
    // Additional endpoints that llama.cpp web UI might expect
    this.app.get('/models', this.getModels.bind(this));
    this.app.post('/chat/completions', this.chatCompletions.bind(this));
    
    // No-op endpoints for compatibility
    this.app.post('/v1/embeddings', this.embeddings.bind(this));
    this.app.get('/v1/engines', this.getEngines.bind(this));
    this.app.post('/v1/completions', this.completions.bind(this));
  }

  private getModels(req: Request, res: Response) {
    const models: Model[] = [
      {
        id: "langgraph-agent",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "langgraph"
      },
      {
        id: "gpt-3.5-turbo",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "langgraph"
      },
      {
        id: "gpt-4",
        object: "model", 
        created: Math.floor(Date.now() / 1000),
        owned_by: "langgraph"
      }
    ];

    res.json({
      object: "list",
      data: models
    });
  }

  private async chatCompletions(req: Request, res: Response) {
    try {
      const {
        model,
        messages,
        stream = false
      }: ChatCompletionRequest = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: {
            message: "Messages array is required and cannot be empty",
            type: "invalid_request_error"
          }
        });
      }

      // Generate conversation ID from request or create new one
      const conversationId = req.headers['x-conversation-id'] as string || uuidv4();
      
      // Store conversation history
      this.conversations.set(conversationId, messages);
      
      // Invoke LangGraph agent
      const response = await this.agent.invoke(messages);
      
      // Handle streaming vs non-streaming
      if (stream) {
        return this.handleStreamingResponse(res, response, model, conversationId);
      } else {
        return this.handleNonStreamingResponse(res, response, model, conversationId);
      }

    } catch (error) {
      console.error('Error in chat completions:', error);
      res.status(500).json({
        error: {
          message: "Internal server error",
          type: "server_error"
        }
      });
    }
  }

  private handleNonStreamingResponse(res: Response, content: string, model: string, conversationId: string) {
    const response: ChatCompletionResponse = {
      id: `chatcmpl-${uuidv4()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: content
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 100, // Estimate or calculate actual tokens
        completion_tokens: content.split(' ').length,
        total_tokens: 100 + content.split(' ').length
      }
    };

    res.setHeader('X-Conversation-ID', conversationId);
    res.json(response);
  }

  private handleStreamingResponse(res: Response, content: string, model: string, conversationId: string) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Conversation-ID', conversationId);

    // Stream the response word by word
    const words = content.split(' ');
    let wordIndex = 0;

    const streamInterval = setInterval(() => {
      if (wordIndex < words.length) {
        const chunk = {
          id: `chatcmpl-${uuidv4()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              delta: {
                content: words[wordIndex] + (wordIndex < words.length - 1 ? ' ' : '')
              },
              finish_reason: null
            }
          ]
        };

        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        wordIndex++;
      } else {
        // Send final chunk
        const finalChunk = {
          id: `chatcmpl-${uuidv4()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop"
            }
          ]
        };

        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        clearInterval(streamInterval);
      }
    }, 50); // Stream delay
  }

  // No-op endpoints for compatibility
  private embeddings(req: Request, res: Response) {
    res.json({
      object: "list",
      data: [
        {
          object: "embedding",
          embedding: new Array(1536).fill(0), // Mock embedding
          index: 0
        }
      ],
      model: "text-embedding-ada-002",
      usage: {
        prompt_tokens: 10,
        total_tokens: 10
      }
    });
  }

  private getEngines(req: Request, res: Response) {
    res.json({
      data: [
        {
          id: "langgraph-agent",
          object: "engine",
          owner: "langgraph",
          ready: true
        }
      ]
    });
  }

  private completions(req: Request, res: Response) {
    // Legacy completions endpoint - redirect to chat completions
    const { prompt, ...otherParams } = req.body;
    
    const chatRequest = {
      ...otherParams,
      messages: [{ role: 'user' as const, content: prompt }]
    };

    req.body = chatRequest;
    this.chatCompletions(req, res);
  }

  public start(port: number = 3000): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        console.log(`🚀 LangGraph OpenAI-compatible server running on port ${port}`);
        console.log(`📋 Available endpoints:`);
        console.log(`   GET  /v1/models`);
        console.log(`   POST /v1/chat/completions`);
        console.log(`   GET  /health`);
        console.log(`💡 Compatible with llama.cpp web UI`);
        resolve();
      });
    });
  }
}

export default OpenAICompatibleServer;