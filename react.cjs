// react-agent.js
require('dotenv').config();
const { ChatOpenAI } = require("@langchain/openai");
const { MultiServerMCPClient } = require("@langchain/mcp-adapters");
const { App } = require('@slack/bolt');
const { SystemMessage, HumanMessage } = require("@langchain/core/messages");

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
        const schema = typeof tool.schema === 'function' ? tool.schema() : tool.schema;
        console.log(`Schema: ${JSON.stringify(schema, null, 2)}`);
      } else {
        console.log('No schema available');
      }
    } catch (e) {
      console.log('Error retrieving schema:', e.message);
    }
    console.log('---');
  });

  // Generate detailed tool guidance
  const toolGuidance = tools.map(tool => {
    let guidance = `${tool.name}: ${tool.description}`;
    
    try {
      if (tool.schema) {
        let schema = tool.schema;
        if (typeof schema === 'function') {
          schema = schema();
        }
        
        if (schema.parameters) {
          guidance += `\nInput format: `;
          
          if (schema.parameters.type === 'string') {
            guidance += `a simple string`;
          } else if (schema.parameters.type === 'object' && schema.parameters.properties) {
            guidance += `an object with these properties:\n`;
            
            for (const [key, prop] of Object.entries(schema.parameters.properties)) {
              const required = schema.parameters.required && schema.parameters.required.includes(key);
              guidance += `- ${key}${required ? ' (required)' : ''}: ${prop.type || 'any'}\n`;
            }
          }
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
    temperature: 0,
    modelKwargs: {
      response_format: { type: "json_object" }
    }
  });

  // Helper function to format tool inputs according to schema
  async function formatToolInput(tool, rawInput) {
    // If the tool doesn't have a schema, return the input as is
    if (!tool.schema) {
      console.log(`Tool ${tool.name} has no schema, using input as-is`);
      return rawInput;
    }
    
    // Log the tool schema for debugging
    let schema;
    try {
      schema = typeof tool.schema === 'function' ? tool.schema() : tool.schema;
      console.log(`Tool ${tool.name} schema:`, JSON.stringify(schema, null, 2));
    } catch (e) {
      console.error(`Error getting schema for ${tool.name}:`, e);
      return rawInput;
    }
    
    // Try to extract the expected input type
    if (schema.parameters || schema.schema || schema.input_schema) {
      const params = schema.parameters || schema.schema || schema.input_schema;
      console.log(`Extracted schema parameters:`, JSON.stringify(params, null, 2));
      
      // If we have a type or properties field, we can try to match it
      if (params.type === 'string') {
        // Tool expects a simple string
        if (typeof rawInput === 'string') {
          return rawInput;
        } else {
          // Convert to string if it's not already
          return JSON.stringify(rawInput);
        }
      } else if (params.type === 'object' && params.properties) {
        // Tool expects an object with specific properties
        let formattedInput = {};
        
        // If input is a string, try to parse it
        if (typeof rawInput === 'string') {
          try {
            rawInput = JSON.parse(rawInput);
          } catch (e) {
            // If parsing fails, try to fit it into the first string property
            const firstStringProp = Object.keys(params.properties).find(
              key => params.properties[key].type === 'string'
            );
            
            if (firstStringProp) {
              formattedInput[firstStringProp] = rawInput;
              return formattedInput;
            }
          }
        }
        
        // If input is already an object, map it to the schema
        if (typeof rawInput === 'object' && rawInput !== null) {
          // For each property in the schema
          for (const [key, prop] of Object.entries(params.properties)) {
            // If the input has this property, use it
            if (rawInput[key] !== undefined) {
              formattedInput[key] = rawInput[key];
            } 
            // If input has a property that seems equivalent
            else {
              const alternateKeys = [
                key.toLowerCase(),
                key.toUpperCase(),
                key.replace(/_/g, ''),
                key.replace(/([A-Z])/g, '_$1').toLowerCase() // camelCase to snake_case
              ];
              
              for (const altKey of alternateKeys) {
                if (rawInput[altKey] !== undefined) {
                  formattedInput[key] = rawInput[altKey];
                  break;
                }
              }
            }
          }
          
          // Handle required fields that are missing
          if (params.required && Array.isArray(params.required)) {
            let missingFields = params.required.filter(field => formattedInput[field] === undefined);
            
            if (missingFields.length > 0) {
              console.warn(`Missing required fields: ${missingFields.join(', ')}`);
              
              // If the input is a simple string and only one required field is missing
              if (typeof rawInput === 'string' && missingFields.length === 1) {
                formattedInput[missingFields[0]] = rawInput;
              }
            }
          }
          
          return formattedInput;
        }
      }
    }
    
    // If we couldn't match the schema, return the original input
    console.log(`Couldn't match input to schema, using original`);
    return rawInput;
  }

  // Special function to format discover tool input
  async function formatDiscoverToolInput(rawInput) {
    console.log("Formatting discover tool input:", rawInput);
    
    // Based on the error, we need to format the input in a specific way
    // The Here Discover API typically expects a specific format
    
    let formatted = {};
    
    // Handle common parameter patterns
    if (typeof rawInput === 'object' && rawInput !== null) {
      // Extract location parameters
      if (rawInput.at) {
        // Format could be "lat,lng" as a string
        if (typeof rawInput.at === 'string' && rawInput.at.includes(',')) {
          formatted.at = rawInput.at;
        } 
        // Could be separate lat/lng values
        else if (typeof rawInput.at === 'object' && rawInput.at.latitude && rawInput.at.longitude) {
          formatted.at = `${rawInput.at.latitude},${rawInput.at.longitude}`;
        }
      } 
      // Handle alternative location formats
      else if (rawInput.latitude && rawInput.longitude) {
        formatted.at = `${rawInput.latitude},${rawInput.longitude}`;
      } else if (rawInput.lat && rawInput.lng) {
        formatted.at = `${rawInput.lat},${rawInput.lng}`;
      } else if (rawInput.location) {
        if (typeof rawInput.location === 'string') {
          // Use as-is if it's already a string (like an address)
          formatted.q = rawInput.location;
        } else if (typeof rawInput.location === 'object' && rawInput.location.lat && rawInput.location.lng) {
          formatted.at = `${rawInput.location.lat},${rawInput.location.lng}`;
        }
      }
      
      // Extract query parameter
      if (rawInput.q) {
        formatted.q = rawInput.q;
      } else if (rawInput.query) {
        formatted.q = rawInput.query;
      } else if (rawInput.what) {
        formatted.q = rawInput.what;
      }
      
      // Handle limit parameter
      if (rawInput.limit) {
        formatted.limit = rawInput.limit;
      }
    }
    // Handle string input
    else if (typeof rawInput === 'string') {
      // If it's a simple query string
      formatted.q = rawInput;
    }
    
    console.log("Formatted discover input:", formatted);
    
    // IMPORTANT: Convert to JSON string format
    // The error suggests we need to pass a string, not an object
    return JSON.stringify(formatted);
  }

  // Format the agent scratchpad to show previous steps
  const formatScratchpad = (steps) => {
    if (!steps || steps.length === 0) return "No previous steps.";
    
    return steps.map((step, i) => {
      let stepInfo = `Step ${i + 1}:\n`;
      
      if (step.action && typeof step.action === 'object') {
        stepInfo += `Reasoning: ${step.action.reasoning || 'No reasoning provided'}\n`;
        stepInfo += `Tool: ${step.action.tool || 'Unknown tool'}\n`;
        stepInfo += `Input: ${JSON.stringify(step.action.toolInput)}\n`;
        stepInfo += `Result: ${step.observation || 'No result'}\n`;
      }
      
      return stepInfo;
    }).join("\n");
  };

  // Generate prompt for the agent
  const generatePrompt = (userInput, steps) => {
    const scratchpad = formatScratchpad(steps);
    
    const systemContent = `You are an assistant that helps users by answering questions and completing tasks step by step.

You have access to the following tools:

${toolGuidance}

IMPORTANT: When using a tool, make sure your toolInput matches exactly what the tool expects.
- If a tool needs a string, provide a simple string value
- If a tool needs a JSON object, provide a properly formatted object with all required fields

SPECIAL NOTES FOR THE DISCOVER TOOL:
For the mcp__here__discover tool, provide an input object with:
- "at" for coordinates in the format "latitude,longitude" (e.g., "52.5200,13.4050")
- "q" for your search query (e.g., "hotel", "restaurant")

You must respond in one of these two formats EXACTLY:

FORMAT 1 - To use a tool:
{
  "actionType": "tool",
  "tool": "name_of_the_tool_to_use",
  "toolInput": <exactly what the tool expects - either string or object with proper fields>,
  "reasoning": "why you are using this tool"
}

FORMAT 2 - To give a final answer:
{
  "actionType": "finalAnswer",
  "answer": "your final answer to the user's question",
  "reasoning": "why this is your answer"
}

Previous steps:
${scratchpad}

Think step-by-step, then respond with ONLY a JSON object matching one of the formats above.`;

    return [
      new SystemMessage(systemContent),
      new HumanMessage(userInput)
    ];
  };

  // Run agent with custom execution loop
  async function runAgent(input, maxIterations = 10) {
    let steps = [];
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
        const content = response.content;
        console.log("Raw model response:", content);
        
        // Parse the JSON
        try {
          result = JSON.parse(content);
        } catch (e) {
          // Try to extract JSON if direct parsing fails
          const match = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/\{[\s\S]*\}/);
          
          if (match) {
            result = JSON.parse(match[1] || match[0]);
          } else {
            throw new Error("Could not extract JSON from response");
          }
        }

        console.log("Parsed result:", result);
      } catch (error) {
        console.error("Error parsing JSON response:", error);
        
        // Add this as an observation and continue
        steps.push({
          action: { error: true },
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
            action: {
              tool: result.tool,
              toolInput: result.toolInput,
              reasoning: result.reasoning,
            },
            observation: errorMsg,
          });
          
          continue;
        }
        
        // Execute the tool
        try {
          console.log(`Executing tool ${result.tool} with input:`, result.toolInput);
          
          // Format the input based on the tool's schema
          let formattedInput;
          
          // Special case for the discover tool
          if (result.tool === 'mcp__here__discover') {
            formattedInput = await formatDiscoverToolInput(result.toolInput);
          } else {
            formattedInput = await formatToolInput(tool, result.toolInput);
          }
          
          console.log(`Formatted tool input:`, formattedInput);
          const observation = await tool.invoke(formattedInput);
          console.log("Tool result:", observation);
          
          // Add to steps
          steps.push({
            action: {
              tool: result.tool,
              toolInput: result.toolInput,
              reasoning: result.reasoning,
            },
            observation: observation,
          });
        } catch (error) {
          console.error(`Error executing tool ${result.tool}:`, error);
          
          // Add error as observation
          steps.push({
            action: {
              tool: result.tool,
              toolInput: result.toolInput,
              reasoning: result.reasoning,
            },
            observation: `Error: ${error.message}`,
          });
        }
      } else {
        console.error("Unknown action type:", result.actionType);
        
        // Add as observation and continue
        steps.push({
          action: { unknown: true },
          observation: `Error: Unknown action type ${result.actionType}`,
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
  app.message(/^(?!\!).*$/, async ({ message, say }) => {
    try {
      console.log("Processing message:", message.text);
      
      const result = await runAgent(message.text);
      
      console.log("Agent result:", result);
      
      await say(result.output);
    } catch (error) {
      console.error("Error processing message:", error);
      await say(`Sorry, I encountered an error: ${error.message}`);
    }
  });

  // Add debug command
  app.message(/^!debug$/, async ({ message, say }) => {
    await say("Running a simple test...");
    
    try {
      // Test the agent with a simple question
      const result = await runAgent("What is 2+2?");
      
      await say(`Agent test result: ${result.output}`);
    } catch (error) {
      await say(`Debug error: ${error.message}`);
    }
  });

  // Add command to show tool list
  app.message(/^!tools$/, async ({ say }) => {
    try {
      const toolInfo = tools.map(tool => `- ${tool.name}: ${tool.description}`).join("\n");
      await say(`Available tools:\n${toolInfo}`);
    } catch (error) {
      await say(`Error listing tools: ${error.message}`);
    }
  });

  // Add command to test a specific tool
  app.message(/^!test-tool (.+?)(?:\s+(.+))?$/, async ({ message, context, say }) => {
    const toolName = context.matches[1];
    const toolInputStr = context.matches[2] || "{}";
    
    await say(`Testing tool: ${toolName}`);
    
    try {
      // Find the tool
      const tool = tools.find(t => t.name === toolName);
      
      if (!tool) {
        await say(`Tool "${toolName}" not found. Available tools: ${tools.map(t => t.name).join(", ")}`);
        return;
      }
      
      // Parse the input
      let toolInput;
      try {
        toolInput = JSON.parse(toolInputStr);
      } catch (e) {
        toolInput = toolInputStr; // Use as string if not valid JSON
      }
      
      // Format the input
      let formattedInput;
      
      // Special case for discover tool
      if (toolName === 'mcp__here__discover') {
        formattedInput = await formatDiscoverToolInput(toolInput);
      } else {
        formattedInput = await formatToolInput(tool, toolInput);
      }
      
      // Execute the tool
      await say(`Executing ${toolName} with formatted input: ${formattedInput}`);
      const result = await tool.invoke(formattedInput);
      
      // Send back the result
      await say(`Result: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`);
    } catch (error) {
      await say(`Error testing tool: ${error.message}`);
    }
  });

  // Add special command to test the discover tool
  app.message(/^!test-discover (.+)$/, async ({ message, context, say }) => {
    const query = context.matches[1];
    
    await say(`Testing discover tool with query: ${query}`);
    
    try {
      // Find the discover tool
      const tool = tools.find(t => t.name === 'mcp__here__discover');
      
      if (!tool) {
        await say(`Discover tool not found`);
        return;
      }
      
      // Format a simple query
      const formattedInput = await formatDiscoverToolInput({ q: query });
      
      // Execute the tool
      await say(`Executing discover with input: ${formattedInput}`);
      const result = await tool.invoke(formattedInput);
      
      // Send back the result summary
      const resultSummary = typeof result === 'object' ? 
        `Found ${result.items?.length || 0} items` : 
        result;
      
      await say(`Result summary: ${resultSummary}`);
      
      // If there are items, show some details
      if (result.items && result.items.length > 0) {
        const firstFew = result.items.slice(0, 3).map(item => 
          `- ${item.title || 'Unnamed'}: ${item.address?.label || 'No address'}`
        ).join('\n');
        
        await say(`First few results:\n${firstFew}`);
      }
    } catch (error) {
      await say(`Error testing discover tool: ${error.message}`);
    }
  });

  // Start the Slack app
  await app.start(process.env.PORT || 3000);
  console.log('Slack bot is running!');
})();