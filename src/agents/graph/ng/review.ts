import { AgentState, HistoricEvent } from "./index";
import * as hub from "langchain/hub/node";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { getCallbacks, loadPrompt } from "./util";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

const ReviewSchema = z.object({
    error: z.string().optional().describe("An error message if something went wrong"),
    score: z.number().int().min(0).max(10).nullable().transform(val => val === null ? undefined : val)
        .describe("A score from 0 to 10 indicating how good the answer is."),
    reasoning: z.string().describe("A string explaining why the answer is good or bad."),
    improvements: z.string().nullable().transform(val => val === null ? undefined : val).optional()
        .describe("A string suggesting ways to improve the answer. This is optional."),
})

type ReviewResponse = z.infer<typeof ReviewSchema>  

const mapHistory = (history: HistoricEvent[]) => history.map((message) => `${message.node} - ${message.type}: ${message.data}`).join("\n");
const mapFormat = (schema: z.ZodType<any>) => zodToJsonSchema(schema)

export async function taskReviewNode(state: AgentState, model: BaseChatModel): Promise<Partial<AgentState>>{
    const basePrompt = await loadPrompt("react_graph_task_review");
    const structuredModel = model.withStructuredOutput(ReviewSchema)
    const pipeline = basePrompt.pipe(structuredModel)
    const history: HistoricEvent[] = [];

    console.log("taskReviewNode ", state.suggestedAnswer)

    history.push({
        node: "review",
        type: "request",
        data: state.suggestedAnswer ?? "No answer provided"
    })

    const response = await pipeline.invoke({
        task: state.task,
        history: mapHistory(state.history),
        suggestedAnswer: state.suggestedAnswer ?? "No answer provided",
        format: mapFormat(ReviewSchema),
    });

    if (response.error) {
        history.push({
            node: "review",
            type: "error",
            data: response.error
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
            score: response.score,
            reasoning: response.reasoning,
            improvements: response.improvements,
        })
    })
    
    return {
        score: response.score === null ? 0 : response.score,
        improvements: response.improvements === null ? undefined : response.improvements,
        history: history,
    }
}
    
