// react-agent.js
import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import {  createAgent } from './agents/graph/ng';
import { CallbackHandler } from "langfuse-langchain";
import OpenAICompatibleServer from './langgraph_openai_server';


// Start the app
(async () => {
  // Initialize MCP client
  const mcpClient = new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: "mcp",
    mcpServers: {
      here: {
        transport: "sse",
        url: "http://localhost:3000/sse"
      }
    }
  });

  // Get tools from MCP
  const tools = await mcpClient.getTools();
  console.log(`Loaded ${tools.length} tools from MCP`);

  // Initialize the language model
  const model = new ChatOpenAI({
    modelName: "gpt-4o",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
    // Removed unsupported response_format parameter
  });

  const cbs: CallbackHandler[] = [];
  if (process.env.LANGFUSE_TRACING === "true") {
    console.log("LANGFUSE_TRACING is true");
    const cb = new CallbackHandler({
      secretKey: process.env.LANGFUSE_API_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_API_KEY,
      baseUrl: process.env.LANGFUSE_HOST,
    });
    cbs.push(cb);
  } else {
    console.log("LANGFUSE_TRACING is false");
  }
  
  // Start the OpenAI-compatible server on a different port
  const openaiServer = new OpenAICompatibleServer(model, tools);
  const openaiPort = Number.parseInt(process.env.OPENAI_PORT ?? '3004', 10);
  await openaiServer.start(openaiPort);

  console.log('🎉 Open AI Server is running:');
  console.log(`🤖 OpenAI API: Port ${openaiPort}`);
})();