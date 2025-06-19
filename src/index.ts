// react-agent.js
import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { App } from '@slack/bolt';
import { SimpleReactAgent } from './agents/simple';
import { AgentState, createAgent } from './agents/graph/ng';
import { StructuredToolInterface } from "@langchain/core/tools";
import { CallbackHandler } from "langfuse-langchain";



const callAgent = async (graph: any, input: string, tools: StructuredToolInterface[]) => {
     // Initialize state with the question
     const initialState: AgentState = {
       task: input,
       tools: tools,
       history: [
         {
             node: "start",
             type: "request",
             data: input
         }
       ],
       score: 0,
       toolingComplete: false,
       exhausted: false,
     }; 

     return graph.invoke(initialState)
}
    

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



  // Initialize the agent
  const graph = await createAgent(model, tools);
  

  // Initialize Slack app
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    socketMode: true,
    appToken: process.env.SLACK_SOCKET_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  const wrapResponse = (response: string) => {
    return {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: response
          }
        }
      ]
    }
  };

  // Handle Slack messages
  app.message(/^.*$/, async ({ message, say }) => {
    try {

      const typedMessage = message as { text: string; user: string; channel: string };

      const initialState: Partial<AgentState> = {
        task: typedMessage.text,
        tools: tools,
        history: [],
      };
      

      console.log("Processing message:", typedMessage.text);
      
      const state = await graph.invoke(initialState);
      const result = state.agentResponse ?? state.error ?? "No result";
      console.log("Agent result:", result);
      
      await say(wrapResponse(result));
    } catch (error) {
      console.error("Error processing message:", error);
      await say(`Sorry, I encountered an error: ${(error as Error)?.message}`);
    }
  });

  // Start the Slack app
  await app.start(process.env.PORT || 3005);
  console.log('Slack bot is running!');

  // Start the OpenAI-compatible server on a different port
  const openaiServer = new OpenAICompatibleServer(model, tools);
  const openaiPort = 3004;
  await openaiServer.start(openaiPort);

  console.log('🎉 Both servers are running:');
  console.log(`📱 Slack Bot: Port ${process.env.PORT || 3005}`);
  console.log(`🤖 OpenAI API: Port ${openaiPort}`);
})();