import * as hub from "langchain/hub/node";
import { Runnable } from "@langchain/core/runnables";


const cache = new Map<string, Runnable>();

export async function loadPrompt(promptName: string): Promise<Runnable> {

    if(cache.has(promptName)) {
        return cache.get(promptName)!
    }
    const prompt = await hub.pull(promptName)
    cache.set(promptName, prompt)
    return prompt
}