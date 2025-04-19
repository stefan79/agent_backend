// Format the agent scratchpad to show previous steps
export const formatScratchpad = (steps: Step[]) => {
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

export interface ToolInput {
    [key: string]: string | number | boolean | object;
  }

export interface Step {
    tool: string,
    toolInput: ToolInput,
    reasoning: string,
    observation: string,
  }
