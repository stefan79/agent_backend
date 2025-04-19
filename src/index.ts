// react-agent.js
import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { App } from '@slack/bolt';
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

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

  // Analyze and log tool schemas
  tools.forEach(tool => {
    console.log(`Tool: ${tool.name}`);
    console.log(`Description: ${tool.description}`);
    try {
      if (tool.schema) {
        console.log(`Schema: ${JSON.stringify(tool.schema, null, 2)}`);
      } else {
        console.log('No schema available');
      }
    } catch (e: unknown) {
      console.log('Error retrieving schema:', (e as Error)?.message);
    }
  });

  // Generate detailed tool guidance
  const toolGuidance = tools.map(tool => {
    let guidance = `${tool.name}: ${tool.description}`;
    
    try {
      if (tool.schema) {
        const schema = tool.schema;
        
        if ('properties' in schema && typeof schema.properties === 'object') {
          guidance += `\nInput format: `;
          Object.entries(schema.properties).forEach(entry => {
            const [key, details] = entry
            if ('type' in details) {
              guidance += `${key} typeOf: ${details.type} `
            }
          })
        }
      }
    } catch (e) {
      guidance += '\nSchema unavailable';
    }
    
    return guidance;
  }).join('\n\n');

  // Initialize the language model
  const model = new ChatOpenAI({
    modelName: "gpt-4",
    openAIApiKey: process.env.OPENAI_API_KEY,
    temperature: 0
    // Removed unsupported response_format parameter
  });

  // Format the agent scratchpad to show previous steps
  const formatScratchpad = (steps: Step[]) => {
    if (!steps || steps.length === 0) return "No previous steps.";
    
    return steps.map((step, i) => {
      let stepInfo = `Step ${i + 1}:\n`;
      stepInfo += `Reasoning: ${step.reasoning || 'No reasoning provided'}\n`;
      stepInfo += `Tool: ${step.tool || 'Unknown tool'}\n`;
      stepInfo += `Input: ${JSON.stringify(step.toolInput)}\n`;
      stepInfo += `Result: ${step.observation || 'No result'}\n`;
      
      return stepInfo;
    }).join("\n");
  };

  // Generate prompt for the agent
// Generate prompt for the agent
  const generatePrompt = (userInput: string, steps: Step[]) => {
    const scratchpad = formatScratchpad(steps);
    
    const systemContent = `You are an assistant that helps users by answering questions and completing tasks step by step.
  
  You have access to the following tools:
  
  ${toolGuidance}
  
  IMPORTANT: When using a tool, make sure your toolInput matches exactly what the tool expects.
  - If a tool needs a string, provide a simple string value
  - If a tool needs a JSON object, provide a properly formatted object with all required fields
  
  You must respond in one of these two formats EXACTLY:
  
  FORMAT 1 - To use a tool:
  {
    "actionType": "tool",
    "tool": "name_of_the_tool_to_use",
    "toolInput":<object with proper fields, e.g. {"field1": "value1", "field2": "value2"}>,
    "reasoning": "why you are using this tool"
  }
  
  FORMAT 2 - To give a final answer:
  {
    "actionType": "finalAnswer",
    "answer": "your final answer to the user's question",
    "reasoning": "why this is your answer"
  }
  
  PREVIOUS STEPS:
  ${scratchpad}
  
  IMPORTANT INSTRUCTIONS:
  1. Review the previous steps carefully, especially the Results from tool executions.
  2. If a tool returned a result, use that information to inform your next action.
  3. If a tool returned an error, try using it differently or use a different tool.
  4. If you have enough information from the previous steps to answer the user's question, provide a final answer.
  
  Think step-by-step, then respond with ONLY a JSON object matching one of the formats above.`;
  
    return [
      new SystemMessage(systemContent),
      new HumanMessage(userInput)
    ];
  };

  interface ToolInput {
    [key: string]: string | number | boolean | object;
  }

  interface Step {
    tool: string,
    toolInput: ToolInput,
    reasoning: string,
    observation: string,
  }

  // Run agent with custom execution loop
  async function runAgent(input: string, maxIterations = 10) {
    const steps: Step[] = [];
    let iterations = 0;
    
    while (iterations < maxIterations) {
      iterations += 1;
      console.log(`\nIteration ${iterations}`);
      
      // Generate messages for this iteration
      const messages = generatePrompt(input, steps);
      
      // Get response from the model
      const response = await model.invoke(messages);
      
      // Parse the JSON response
      let result;
      try {
        // Extract JSON from the response content
        console.log("Raw model response:", response.text);
        
        // Parse the JSON
        try {
          result = JSON.parse(response.text);
        } catch (e) {
          throw new Error("Could not extract JSON from response");
        }

        console.log("Parsed result:", result);
      } catch (error) {
        console.error("Error parsing JSON response:", error);
        
        // Add this as an observation and continue
        steps.push({
          tool: "error",
          toolInput: { error: true },
          reasoning: `Error parsing response: ${response.content}`,
          observation: `Error parsing response: ${response.content}`,
        });
        
        continue;
      }
      
      // Normalize the result object
      if (!result.actionType && result.tool) {
        result.actionType = "tool";
      } else if (!result.actionType && (result.answer || result.finalAnswer)) {
        result.actionType = "finalAnswer";
        if (result.finalAnswer && !result.answer) {
          result.answer = result.finalAnswer;
        }
      }
      
      // Check if this is a final answer
      if (result.actionType === "finalAnswer") {
        console.log("Agent returned final answer");
        return { 
          output: result.answer,
          intermediateSteps: steps 
        };
      }
      
      // Otherwise, it should be a tool action
      if (result.actionType === "tool") {
        console.log(`Agent wants to use tool: ${result.tool}`);
        
        // Find the tool
        const tool = tools.find(t => t.name === result.tool);
        
        if (!tool) {
          const errorMsg = `Tool ${result.tool} not found`;
          console.error(errorMsg);
          
          // Add this as an observation and continue
          steps.push({
            tool: result.tool,
            toolInput: result.toolInput,
            reasoning: result.reasoning,
            observation: errorMsg,
          });
          
          continue;
        }
        
        // Execute the tool
        try {
          console.log(`Executing tool ${result.tool} with input:`, result.toolInput);
          
          const toolResponse = await tool.invoke(result.toolInput);
          
          const observation = toolResponse.map(( item: { text: string }) => item.text).join(', ')

          console.log("Tool result:", observation);
          
          // Add to steps
          steps.push({
            tool: result.tool,
            toolInput: result.toolInput,
            reasoning: result.reasoning,
            observation: observation,
          });
        } catch (error: unknown) {
          console.error(`Error executing tool ${result.tool}:`, (error as Error)?.message);
          
          // Add error as observation
          steps.push({
            tool: result.tool,
            toolInput: result.toolInput,
            reasoning: result.reasoning,
            observation: `Error: ${(error as Error)?.message}`,
          });
        }
      } else {
        console.error("Unknown action type:", result.actionType);
        
        // Add as observation and continue
        steps.push({
          observation: `Error: Unknown action type ${result.actionType}`,
          tool: '',
          toolInput: {},
          reasoning: ''
        });
      }
    }
    
    console.log("Reached maximum iterations without final answer");
    return {
      output: "I wasn't able to reach a conclusion after multiple attempts. Please try asking your question differently.",
      intermediateSteps: steps,
    };
  }

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
      
      const result = await runAgent(typedMessage.text);
      
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