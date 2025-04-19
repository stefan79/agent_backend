// react-agent.js
import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { App } from '@slack/bolt';
import { Agent } from './agent';

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
    modelName: "gpt-4",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0
    // Removed unsupported response_format parameter
  });

  // Initialize the agent
  const agent = new Agent(model, tools);

  // Initialize Slack app
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_SOCKET_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  // Handle Slack messages
  app.message(/^.*$/, async ({ message, say }) => {
    try {

      const typedMessage = message as { text: string; user: string; channel: string };

      console.log("Processing message:", typedMessage.text);
      
      const result = await agent.run(typedMessage.text);
      
      console.log("Agent result:", result);
      
      await say(result.output);
    } catch (error) {
      console.error("Error processing message:", error);
      await say(`Sorry, I encountered an error: ${(error as Error)?.message}`);
    }
  });

  // Start the Slack app
  await app.start(process.env.PORT || 3005);
  console.log('Slack bot is running!');
})();