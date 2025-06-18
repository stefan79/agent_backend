import * as hub from "langchain/hub/node";
import { Runnable } from "@langchain/core/runnables";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { CallbackHandler } from "langfuse-langchain";
import { AgentState } from "./index";
import { Langfuse, LangfuseSpanClient } from "langfuse";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const cache = new Map<string, Runnable>();

export async function loadPrompt(promptName: string): Promise<Runnable> {
    // Return from cache if available
    if(cache.has(promptName)) {
        return cache.get(promptName)!
    }

    // Check environment configuration
    const useLangchain = process.env.USE_LANGCHAIN === 'true';
    const useLangfuse = process.env.USE_LANGFUSE === 'true' || process.env.LANGFUSE_TRACING === 'true';

    if (useLangchain) {
        // Use langchain hub (original implementation)
        const prompt = await hub.pull(promptName);
        cache.set(promptName, prompt);
        return prompt;
    } else if (useLangfuse) {
        // Use langfuse mechanisms
        const langfuse = new Langfuse({
            secretKey: process.env.LANGFUSE_API_KEY,
            publicKey: process.env.LANGFUSE_PUBLIC_API_KEY,
            baseUrl: process.env.LANGFUSE_HOST,
        });

        const prompt = (await langfuse.getPrompt(promptName, undefined, {type: "chat"}));
        const template = ChatPromptTemplate.fromMessages(
          prompt.getLangchainPrompt().map((msg) => [msg.role, msg.content])
        )
        cache.set(promptName, template);
        return template;
    } else {
        // Neither langchain nor langfuse is configured
        throw new Error('Environment not properly configured. Set either USE_LANGCHAIN=true or USE_LANGFUSE=true in your environment variables.');
    }
}


export function getCallbacks(): BaseCallbackHandler[] {
    const cbs: BaseCallbackHandler[] = [];
    
    if (process.env.LANGFUSE_TRACING === "true") {
      console.log("LANGFUSE_TRACING is true");
      const cb = new CallbackHandler({
        secretKey: process.env.LANGFUSE_API_KEY,
        publicKey: process.env.LANGFUSE_PUBLIC_API_KEY,
        baseUrl: process.env.LANGFUSE_HOST,
      });
      cbs.push(cb);
    } else {
      console.log("LANGFUSE_TRACING is false");
    }
    return cbs
}