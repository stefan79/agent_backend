import { StructuredToolInterface } from "@langchain/core/tools";
import { Step } from "./scratchpad";
import { formatScratchpad } from "./scratchpad";
import { generateToolGuidance } from "./tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

const generatePrompt = (userInput: string, tools: StructuredToolInterface[], steps: Step[]) => {
    const scratchpad = formatScratchpad(steps);
    const toolGuidance = generateToolGuidance(tools);
    
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

    
  // Run agent with custom execution loop
  export async function runAgent(input: string, model: ChatOpenAI, tools: StructuredToolInterface[], maxIterations = 10) {
    const steps: Step[] = [];
    let iterations = 0;
    
    while (iterations < maxIterations) {
      iterations += 1;
      console.log(`\nIteration ${iterations}`);
      
      // Generate messages for this iteration
      const messages = generatePrompt(input, tools, steps);
      
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