import { AgentState, HistoricEvent } from "./index";
import * as hub from "langchain/hub/node";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getCallbacks, loadPrompt } from "./util";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";



const AnswerSchema = z.object({
    error: z.string().optional().describe("An error message if something went wrong"),
    answer: z.string().nullable().transform(val => val === null ? undefined : val).optional()
        .describe("The answer to the task.")
})

type AnswerResponse = z.infer<typeof AnswerSchema>  

const mapHistory = (history: HistoricEvent[]) => history.map((message) => `${message.node} - ${message.type}: ${message.data}`).join("\n");
const mapFormat = (schema: z.ZodType<any>) => zodToJsonSchema(schema)

export async function taskAnswerNode(state: AgentState, model: BaseChatModel): Promise<Partial<AgentState>>{

    console.log("taskAnswerNode ", state.suggestedAnswer)

    const basePrompt = await loadPrompt("react_graph_task_answer");
    const structuredModel = model.withStructuredOutput(AnswerSchema)
    const pipeline = basePrompt.pipe(structuredModel)
    const history: HistoricEvent[] = [];

    history.push({
        node: "answer",
        type: "request",
        data: state.task
    })

    const response = await pipeline.invoke({
        task: state.task,
        history: mapHistory(state.history),
        format: mapFormat(AnswerSchema),
    });

    //TODO This neeeds to be fixed
    if (!response.answer) {
        history.push({
            node: "answer",
            type: "error",
            data: response.error ?? ""
        })
        return {
            error: response.error,
            history: history
        }
    }

    history.push({
        node: "answer",
        type: "response",
        data: JSON.stringify({
            answer: response.answer,
        })
    })
    
    return {
        suggestedAnswer: response.answer === null ? undefined : response.answer,
        history: history,
    }
}
    
