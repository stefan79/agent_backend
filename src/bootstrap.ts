// bootstrap.ts - Entry point for debugging
import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { StructuredToolInterface } from "@langchain/core/tools";
import { AgentState, createAgent } from './agents/graph/ng';

// Main debugging function
async function main() {
  try {
    console.log("Starting bootstrap debugging process...");
    
    // Get MCP server URL from environment or use default
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3000/sse';
    const mcpTransport = process.env.MCP_TRANSPORT || 'sse';
    
    console.log(`Using MCP server: ${mcpServerUrl} with transport: ${mcpTransport}`);
    
    // Initialize MCP client with appropriate transport
    // The MultiServerMCPClient expects specific configuration based on transport type
    const mcpServers: Record<string, any> = {};
    
    if (mcpTransport === 'sse') {
      mcpServers.remote = {
        transport: 'sse',
        url: mcpServerUrl
      };
    } else {
      mcpServers.remote = {
        transport: 'https',
        url: mcpServerUrl
      };
    } 
      
    const mcpClient = new MultiServerMCPClient({
      throwOnLoadError: false, // Set to false to handle errors gracefully
      prefixToolNameWithServerName: true,
      additionalToolNamePrefix: "mcp",
      mcpServers
    });

    // Get tools from MCP
    console.log("Loading tools from MCP server...");
    let tools: StructuredToolInterface[] = [];
    try {
      tools = await mcpClient.getTools();
      console.log(`Loaded ${tools.length} tools from MCP`);
    } catch (error) {
      console.error("Failed to load tools from MCP server:", error);
      console.log("Continuing with empty tools list...");
    }
    
    // List available tools for debugging
    console.log("Available tools:");
    tools.forEach(tool => {
      console.log(`- ${tool.name}: ${tool.description}`);
    });

    // Initialize the language model
    console.log("Initializing OpenAI model...");
    const model = new ChatOpenAI({
      modelName: "gpt-4",
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 0
    });

    // Build the graph
    console.log("Building the agent graph...");
    const graph = await createAgent(model, tools);
    
    // Create a static message for testing
    const staticMessage = "What is the current weather in Berlin?";
    console.log(`Testing graph with static message: "${staticMessage}"`);
    
    // Initialize state with the question
    const initialState: AgentState = {
      task: staticMessage,
      tools: tools,
      history: [
        {
            node: "start",
            type: "request",
            data: staticMessage
        }
      ]
    };
    
    // Execute the graph
    console.log("Executing graph...");
    const result = await graph.invoke(initialState);
    
    // Display the result
    console.log("\n--- EXECUTION RESULT ---");
    console.log(JSON.stringify(result, null, 2));
    console.log("--- END RESULT ---\n");
    
    // Check if we have a final answer
    if (result.agentResponse)   {
      console.log("Final answer:", result.agentResponse);
    } else {
      console.log("No final answer was produced. Check the execution flow.");
    }
    
  } catch (error) {
    console.error("Error in bootstrap process:", error);
  }
}

// Execute the main function
main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
