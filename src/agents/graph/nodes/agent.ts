import { StructuredToolInterface } from "@langchain/core/tools";
import { AgentState, ToolMap } from "../index";
import { RunnableConfig, RunnableSequence } from "@langchain/core/runnables";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import * as hub from "langchain/hub/node";

interface ToolAgentResponse {
  actionType: "tool";
  tool: string;
  toolInput: ToolMap;
  reasoning: string;
}

interface FinalAnswerResponse {
  actionType: "finalAnswer";
  answer: string;
  reasoning: string;
}

export interface AgentNodeOutput {
  next: string;
  tool?: string;
  toolInput?: ToolMap;
  agentResponse?: string;
  history?: BaseMessage[];
}

export const agentCallback = (state: AgentState, tools: StructuredToolInterface[]) => async (messages: BaseMessage[]) => {
  const history = state.history || [];
  messages.push(...history);
  
  // Add tool information to the messages
  const toolInfo = tools.map(tool => {
    let info = `${tool.name}: ${tool.description}`;
    
    try {
      if (tool.schema) {
        const schema = tool.schema;
        
        if ('properties' in schema && typeof schema.properties === 'object') {
          info += `\nInput format: `;
          Object.entries(schema.properties).forEach(entry => {
            const [key, details] = entry;
            if ('type' in details) {
              info += `${key} typeOf: ${details.type} `;
            }
          });
        }
      }
    } catch (e) {
      info += '\nSchema unavailable';
    }
    
    return info;
  }).join('\n\n');
  
  // Get the React Agent prompt from LangChain Hub
  const request = await hub.pull("react_agent");
  const hubPrompt = await request.invoke({
    userInput: state.question || "No question provided"
  });

  const systemMessageTemplate = hubPrompt.messages[0];
  const userMessage = hubPrompt.messages[1];

  // Format the system prompt with tools and history
  const scratchPad = history
    .filter(msg => msg.content.includes("Tool Result") || msg.content.includes("Tool Error"))
    .map(msg => msg.content)
    .join("\n\n");
  
  const formattedSystemPrompt = systemMessageTemplate.content
    .replace("{{scratchPad}}", scratchPad || "No previous tool calls.")
    .replace("{{toolGuidance}}", toolInfo);

  messages.push(new HumanMessage(formattedSystemPrompt));
  
  if (state.toolResult) {
    messages.push(new HumanMessage(`Latest tool result: ${state.toolResult}`));
  }
  
  if (state.error) {
    messages.push(new HumanMessage(`Latest error: ${state.error}`));
  }
  
  messages.push(new HumanMessage(userMessage.content));
};

export const parseModelResponse = (response: string): ToolAgentResponse | FinalAnswerResponse => {
  try {
    // Parse the JSON
    try {
      const result = JSON.parse(response);
      console.log("Parsed agent result:", result);
      return result;
    } catch (e) {
      throw new Error("Could not extract JSON from response");
    }
  } catch (error) {
    console.error("Error parsing JSON response:", error);
    throw error;
  }
};

export const agent = (chain: RunnableSequence, config: RunnableConfig, tools: StructuredToolInterface[]) => 
  async ({ state }: { state: AgentState }): Promise<AgentNodeOutput> => {
    try {
      // Get response from the model
      const response: string = await chain.invoke({}, config);
      console.log("Raw agent response:", response);
      
      // Parse the JSON response
      const result = parseModelResponse(response);
      
      // Update history with the agent's reasoning
      const updatedHistory = [
        ...state.history || [],
        new AIMessage(`Agent reasoning: ${result.reasoning}`)
      ];
      
      // Check if this is a final answer
      if (result.actionType === "finalAnswer") {
        console.log("Agent returned final answer");
        
        return {
          next: "answer_node",
          agentResponse: result.answer,
          history: updatedHistory
        };
      }
      // Otherwise, it should be a tool action
      else if (result.actionType === "tool") {
        console.log(`Agent wants to use tool: ${result.tool}`);
        
        return {
          next: "tool_node",
          tool: result.tool,
          toolInput: result.toolInput,
          history: updatedHistory
        };
      } else {
        throw new Error("Unknown action type in agent response");
      }
    } catch (error) {
      console.error("Error in agent node:", error);
      
      return {
        next: "answer_node",
        agentResponse: `I encountered an error while processing your request. Error: ${(error as Error).message}`,
        history: state.history
      };
    }
  };