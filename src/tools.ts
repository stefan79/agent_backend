import { StructuredToolInterface } from "@langchain/core/tools";
import { Step, ToolInput } from "./scratchpad";

export const generateToolGuidance = (tools: StructuredToolInterface[]) => tools.map(tool => {
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

export const callTool = async (toolName: string, tools: StructuredToolInterface[], toolInput: ToolInput, reasoning: string): Promise<Step> => {
    // Find the tool
    const tool = tools.find(t => t.name === toolName);

    if (!tool) {
        const errorMsg = `Tool ${toolName} not found`;
        console.error(errorMsg);

        // Add this as an observation and continue
        return {
            tool: toolName,
            toolInput: toolInput,
            reasoning: reasoning,
            observation: errorMsg,
        }
    }

    // Execute the tool
    try {
        console.log(`Executing tool ${toolName} with input:`, toolInput);

        const toolResponse = await tool.invoke(toolInput);

        const observation = toolResponse.map((item: { text: string }) => item.text).join(', ')

        console.log("Tool result:", observation);

        // Add to steps
        return {
            tool: toolName,
            toolInput: toolInput,
            reasoning: reasoning,
            observation: observation,
        };
    } catch (error: unknown) {
        console.error(`Error executing tool ${toolName}:`, (error as Error)?.message);

        // Add error as observation
        return {
            tool: toolName,
            toolInput: toolInput,
            reasoning: reasoning,
            observation: `Error: ${(error as Error)?.message}`,
        };
    }
} 