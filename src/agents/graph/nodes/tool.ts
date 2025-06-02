import { StructuredToolInterface } from "@langchain/core/tools";
import { AgentState, ToolMap } from "../index";
import { RunnableConfig, RunnableSequence } from "@langchain/core/runnables";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

export interface ToolNodeOutput {
  next: string;
  history?: BaseMessage[];
  toolResult?: string;
  error?: string;
}

export const toolCallback = (state: AgentState, tools: StructuredToolInterface[]) => (messages: BaseMessage[]) => {
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
  
  messages.push(new HumanMessage(`Available tools:\n${toolInfo}`));
  
  if (state.toolInput && state.tool) {
    messages.push(new HumanMessage(`Tool call requested: ${state.tool} with input: ${JSON.stringify(state.toolInput)}`));
  }
};

export const tool = (chain: RunnableSequence, config: RunnableConfig, tools: StructuredToolInterface[]) => 
  async ({ state }: { state: AgentState }): Promise<ToolNodeOutput> => {
    try {
      // Find the requested tool
      const toolName = state.tool;
      const toolInput = state.toolInput;
      
      if (!toolName || !toolInput) {
        return {
          next: "agent_node",
          error: "No tool or tool input specified",
          history: state.history
        };
      }
      
      // Find the tool
      const tool = tools.find(t => t.name === toolName);
      
      if (!tool) {
        const errorMsg = `Tool ${toolName} not found`;
        console.error(errorMsg);
        
        return {
          next: "agent_node",
          error: errorMsg,
          history: [
            ...state.history || [],
            new AIMessage(`Error: ${errorMsg}`)
          ]
        };
      }
      
      // Execute the tool
      console.log(`Executing tool ${toolName} with input:`, toolInput);
      
      const toolResponse = await tool.invoke(toolInput);
      console.log("Tool response:", toolResponse);
      
      // Add the tool result to the history
      const updatedHistory = [
        ...state.history || [],
        new AIMessage(`Tool Result (${toolName}): ${toolResponse}`)
      ];
      
      return {
        next: "agent_node",
        toolResult: toolResponse,
        history: updatedHistory
      };
    } catch (error) {
      console.error("Error in tool node:", error);
      
      return {
        next: "agent_node",
        error: (error as Error).message,
        history: [
          ...state.history || [],
          new AIMessage(`Tool Error: ${(error as Error).message}`)
        ]
      };
    }
  };