import { AgentState, HistoricEvent } from "./index";
import * as hub from "langchain/hub/node";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { StructuredToolInterface } from "@langchain/core/tools";
import { zodToJsonSchema } from "zod-to-json-schema";
import { loadPrompt } from "./util";
import { AIMessage } from "@langchain/core/messages";

const AnswerSchema = z.object({
    error: z.string().optional().describe("An error message if something went wrong"),
    answer: z.string().optional().describe("The answer to the task.")
})

type AnswerResponse = z.infer<typeof AnswerSchema>  

const mapHistory = (history: HistoricEvent[]) => history.map((message) => `${message.node} - ${message.type}: ${message.data}`).join("\n");
const mapFormat = (schema: z.ZodType<any>) => zodToJsonSchema(schema)

export async function taskFinalizerNode(state: AgentState, model: BaseChatModel): Promise<Partial<AgentState>>{

    return {
        agentResponse: state.suggestedAnswer
    }
}
    
