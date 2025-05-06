import { StructuredToolInterface } from "@langchain/core/tools";
import { Step, ToolInput } from "./scratchpad";
import { formatScratchpad } from "./scratchpad";
import { callTool, generateToolGuidance } from "./tools";
import { HumanMessage, SystemMessage, AIMessageChunk} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import * as hub from "langchain/hub/node";
import {Agent} from "../index";

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

const generatePrompt = async (userInput: string, tools: StructuredToolInterface[], steps: Step[]) => {
    const scratchPad = formatScratchpad(steps);
    const toolGuidance = generateToolGuidance(tools);
    
    const request = await hub.pull("react_agent");
    const hubPrompt = await request.invoke({
      userInput
    });

    const systemMessageTemplate = hubPrompt.messages[0];
    const userMessage = hubPrompt.messages[1];

    const formattedSystemPrompt = systemMessageTemplate.content
        .replace("{{scratchPad}}", scratchPad)
        .replace("{{toolGuidance}}", toolGuidance);

    return [
        new SystemMessage(formattedSystemPrompt),
        new HumanMessage(userMessage.content)
    ];
}

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

  


export class SimpleReactAgent implements Agent {
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
              const messages = await generatePrompt(input, this.tools, steps);
              
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
  
  export default SimpleReactAgent;