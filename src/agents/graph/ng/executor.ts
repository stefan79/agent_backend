import { AgentState, HistoricEvent } from "./index";
import * as hub from "langchain/hub/node";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getCallbacks, loadPrompt } from "./util";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

const ExecutorSchema = z.object({
    error: z.string().optional().describe("An error message if something went wrong"),
    selectedTool: z.string().nullable().transform(val => val === null ? undefined : val)
        .describe("The name of the tool to use"),
    toolInput: z.any().nullable().transform(val => val === null ? undefined : val)
        .describe("The input to the tool encoded in the structured schema expected by the tool."),
    toolOutput: z.any().nullable().transform(val => val === null ? undefined : val)
        .describe("The output of the tool encoded in the structured schema expected by the tool."),
})

type ExecutorResponse = z.infer<typeof ExecutorSchema>  

const mapHistory = (history: HistoricEvent[]) => history.map((message) => `${message.node} - ${message.type}: ${message.data}`).join("\n");
const mapTools = (tools: StructuredToolInterface[]) => tools.map((tool) => `${tool.name}: ${tool.description}`).join("\n");
const mapFormat = (schema: z.ZodType<any>) => zodToJsonSchema(schema)

export async function taskExecutorNode(state: AgentState, model: BaseChatModel): Promise<Partial<AgentState>>{
    console.log("taskExecutorNode ", state.tool)
    const history: HistoricEvent[] = [];

    history.push({
        node: "tool",
        type: "request",
        data: JSON.stringify(state.toolInput)
    })

    const tool = state.tools.filter((tool) => tool.name === state.tool)[0];
    if (!tool) {
        const message = `Tool ${state.tool} not found`;
        history.push({
            node: "tool",
            type: "error",
            data: message
        })
        return {
            error: message,
            history: history
        }
    }
    try {
        const response = await tool.invoke(state.toolInput)
        history.push({
            node: "tool",
            type: "response",
            data: JSON.stringify(response)
        })
        return {
            history: history,
            toolInput: undefined,
            tool: undefined,
            toolOutput: undefined,
        }
    } catch (error) {
        const message = `Tool ${state.tool} failed with error: ${error}`;
        history.push({
            node: "tool",
            type: "error",
            data: message
        })
        return {
            error: message,
            history: history,
        }
    }
}
    
