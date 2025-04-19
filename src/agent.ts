import { StructuredToolInterface } from "@langchain/core/tools";
import { Step, ToolInput } from "./scratchpad";
import { formatScratchpad } from "./scratchpad";
import { callTool, generateToolGuidance } from "./tools";
import { HumanMessage, SystemMessage, AIMessageChunk} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

interface ToolAgentResponse {
    actionType: "tool";
    tool: string;
    toolInput: ToolInput;
    reasoning: string;
}

interface FinalAnswerResponse {
    actionType: "finalAnswer";
    answer: string;
    reasoning: string;
}

const generatePrompt = (userInput: string, tools: StructuredToolInterface[], steps: Step[]) => {
    const scratchpad = formatScratchpad(steps);
    const toolGuidance = generateToolGuidance(tools);
    
    const systemContent = `You are an assistant that helps users by answering questions and completing tasks step by step. 
    
  
  You have access to the following tools:
  
  ${toolGuidance}
  
  IMPORTANT: When using a tool, make sure your toolInput matches exactly what the tool expects.
  
  You must respond in one of these two formats EXACTLY:
  
  FORMAT 1 - To use a tool:
  {
    "actionType": "tool",
    "tool": "name_of_the_tool_to_use",
    "toolInput":<object with proper fields, e.g. {"field1": "value1", "field2": "value2"}>,
    "reasoning": "why you are using this tool and why the previous steps are not helpful"
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
  5. If you are not sure how to proceed, use a tool to gather more information.
  6. Try to deliver a final answer as fast as possible
  
  Think step-by-step, then respond with ONLY a JSON object matching one of the formats above.`;
  
    return [
      new SystemMessage(systemContent),
      new HumanMessage(userInput)
    ];
  };

const parseModelResponse = (response: AIMessageChunk): ToolAgentResponse | FinalAnswerResponse => {
    try {
      // Extract JSON from the response content
      console.log("Raw model response:", response.text);
      
      // Parse the JSON
      try {
        const result = JSON.parse(response.text);
        console.log("Parsed result:", result);
        return result;
      } catch (e) {
        throw new Error("Could not extract JSON from response");
      }
    } catch (error) {
      console.error("Error parsing JSON response:", error);
      throw error;
    }
  }
  export class Agent {
    private model: ChatOpenAI;
    private tools: StructuredToolInterface[];
    private maxIterations: number;
    
    constructor(model: ChatOpenAI, tools: StructuredToolInterface[], maxIterations = 10) {
      this.model = model;
      this.tools = tools;
      this.maxIterations = maxIterations;
    }
    async run(input: string): Promise<{ output: string; intermediateSteps: Step[] }> {
            const steps: Step[] = [];
            let iterations = 0;
            
            while (iterations < this.maxIterations) {
              iterations += 1;
              console.log(`\nIteration ${iterations}`);
              
              // Generate messages for this iteration
              const messages = generatePrompt(input, this.tools, steps);
              
              // Get response from the model
              const response = await this.model.invoke(messages);
              
              // Parse the JSON response
              const result = parseModelResponse(response);
              
              // Check if this is a final answer
              if (result.actionType === "finalAnswer") {
                console.log("Agent returned final answer");
                return { 
                  output: result.answer,
                  intermediateSteps: steps 
                };
              }
              // Otherwise, it should be a tool action
              else if (result.actionType === "tool") {
                console.log(`Agent wants to use tool: ${result.tool}`);
                const step = await callTool(result.tool, this.tools, result.toolInput, result.reasoning);                
                steps.push(step);
              } 
            }
            
            console.log("Reached maximum iterations without final answer");

            return {
              output: "I wasn't able to reach a conclusion after multiple attempts. Please try asking your question differently.",
              intermediateSteps: steps,
            };
          }      
    }
  
  export default Agent;