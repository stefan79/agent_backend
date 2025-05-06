import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { RunnableConfig, RunnableSequence } from "@langchain/core/runnables";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { JsonOutputParser, StringOutputParser } from "@langchain/core/output_parsers";
import * as hub from "langchain/hub/node";
import { BaseMessage } from "@langchain/core/messages";
import { ZodSchema } from "zod";

export interface Agent {

    run(input: string): Promise<{ output: string }>;
}


export type messageCallback = (messages: BaseMessage[]) => void;



//TODO: Cach the loadedd prompts somehow so we dont load them for each request. Also apply to the LLM tools.
export const buildSequence =  (promptName: string, model: BaseChatModel) => async (schema?: ZodSchema, callback?: messageCallback): Promise<RunnableSequence> => {
    const basePrompt = await hub.pull(promptName);
    const messages = await basePrompt.invoke({});
    if(callback) {
        callback(messages);
    }
    if (schema) {
        return RunnableSequence.from([messages, model.withStructuredOutput(schema), new JsonOutputParser()]);
    } else {
        return RunnableSequence.from([messages, model, new StringOutputParser()]);
    }
}

export function buildRunnableConfig({project, id, name, version}: {project: string, id: string, name: string, version: string}): RunnableConfig {
    return {
        callbacks: [new LangChainTracer({projectName: project})],
        metadata: {
            id: id,
            name: name,
            version: version
        }
    }
}