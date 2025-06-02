import { AgentState, HistoricEvent } from "./index";
import * as hub from "langchain/hub/node";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadPrompt } from "./util";

const TaskSchema = z.object({
    error: z.string().nullable().describe("An error message if something went wrong"),
    exhausted: z.boolean().optional().describe("A boolean indicating if there are no more tool calls required or possible"),
    selectedTool: z.string().nullable().transform(val => val === null ? undefined : val).optional()
        .describe("The name of the tool to use"),
    toolInput: z.any().nullable().transform(val => val === null ? undefined : val).optional()
        .describe("The input to the tool encoded in the structured schema expected by the tool."),
    reasoning: z.string().describe("A string explaining why the tool was selected and how it will be used."),
    executionPlan: z.string().describe("A string explaining the steps that will be taken to execute the tool.")
})

type TaskResponse = z.infer<typeof TaskSchema>  

const mapHistory = (history: HistoricEvent[]) => history.map((message) => `${message.node} - ${message.type}: ${message.data}`).join("\n");
const mapTools = (tools: StructuredToolInterface[]) => tools.map(
    (tool) => {
        const schema = tool.schema;
        return `### ${tool.name}: ${tool.description}\n${JSON.stringify(schema)}\n`
    }).join("\n");
const mapFormat = (schema: z.ZodType<any>) => zodToJsonSchema(schema)

export async function taskAnalyzerNode(state: AgentState, model: BaseChatModel): Promise<Partial<AgentState>>{
    console.log("taskAnalyzerNode ", state.task)
    const basePrompt = await loadPrompt("react_graph_task_analyzer");
    const structuredModel = model.withStructuredOutput(TaskSchema)
    const pipeline = basePrompt.pipe(structuredModel)
    const history: HistoricEvent[] = []

    history.push({
        node: "analyze",
        type: "request",
        data: state.task
    })

    const response = await pipeline.invoke({
        task: state.task,
        history: mapHistory(state.history),
        tools: mapTools(state.tools),
        format: mapFormat(TaskSchema),
    });

    if (response.error) {
        history.push({
            node: "analyze",
            type: "error",
            data: response.error
        })
        return {
            error: response.error,
            history: history
        }
    }

    history.push({
        node: "analyze",
        type: "response",
        data: JSON.stringify({
            selectedTool: response.selectedTool,
            toolInput: response.toolInput,
            reasoning: response.reasoning,
            executionPlan: response.executionPlan,
        })
    })
    
    return {
        tool: response.selectedTool === null ? undefined : response.selectedTool,
        toolInput: response.toolInput === null ? undefined : response.toolInput,
        history: history,
        toolingComplete: response.exhausted === true,
    }
}
    
