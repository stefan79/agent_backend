import { BaseMessage } from '@langchain/core/messages';
import { StructuredToolInterface } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { taskAnalyzerNode } from './analyzer';
import { StateGraph , StateGraphArgs} from '@langchain/langgraph';
import { taskExecutorNode } from './executor';
import { taskReviewNode } from './review';
import { taskAnswerNode } from './answer';
import { taskFinalizerNode } from './finalizer';
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { Langfuse, LangfuseSpanClient } from "langfuse";
import { startSpan } from './util';

export interface AgentState {
    task: string;
    suggestedAnswer?: string;
    tools: StructuredToolInterface[];
    history: HistoricEvent[];
    tool?: string;
    toolInput?: any;
    toolOutput?: any;
    error?: string;
    score: number;
    improvements?: string;
    toolingComplete: boolean;
    agentResponse?: string;
    exhausted: boolean;
}  

export type Node = "tool" | "answer" | "review" | "analyze" | "start"
export type Type = "request" | "response" | "error"

export interface HistoricEvent {
    node: Node;
    type: Type;
    data: string
}

export function createAgent(model: BaseChatModel, tools: StructuredToolInterface[]) {

    const channels: StateGraphArgs<AgentState>['channels'] = {
        task: {
            value: (x: string) => x,
            default: () => "",
            reducer: (x: string, y: string) => y,
        },
        tools: {
            value: (x: StructuredToolInterface[]) => x,
            default: () => tools,
        },
        history: {
            value: (x: HistoricEvent[]) => x,
            default: () => [],
            reducer: (x: HistoricEvent[], y: HistoricEvent[]) => [...x, ...y],
        },
        tool: {
            value: (x: string | undefined) => x,
            default: () => undefined,
            reducer: (x: string | undefined, y: string | undefined) => y,
        },
        toolInput: {
            value: (x: any) => x,
            default: () => undefined,
            reducer: (x: any, y: any) => y,
        },
        error: {
            value: (x: string | undefined) => x,
            default: () => undefined,    
        },
        toolingComplete: {
            value: (x: boolean) => x,
            default: () => false,
            reducer: (x: boolean, y: boolean) => y,
        },
        agentResponse: {
            value: (x: string | undefined) => x,
            default: () => undefined,
            reducer: (x: string | undefined, y: string | undefined) => y,
        },
        suggestedAnswer: {
            value: (x: string | undefined) => x,
            default: () => undefined,
            reducer: (x: string | undefined, y: string | undefined) => y,
        },
        score: {
            value: (x: number) => x,
            default: () => 0,
            reducer: (x: number, y: number) => y,
        },
        exhausted: {
            value: (x: boolean) => x,
            default: () => false,
            reducer: (x: boolean, y: boolean) => y,
        }
    }

    //TODO Remove model from nodes when not required
    const builder = new StateGraph({channels: channels})
        .addNode("analyze", async (state: AgentState) => taskAnalyzerNode(state, model))
        .addNode("executor", async (state: AgentState) => taskExecutorNode(state, model))
        .addNode("review", async (state: AgentState) => taskReviewNode(state, model))
        .addNode("answer", async (state: AgentState) => taskAnswerNode(state, model))
        .addNode("finalizer", async (state: AgentState) => taskFinalizerNode(state))
        .addEdge("__start__", "analyze")
        .addEdge("executor", "analyze")
        .addConditionalEdges(
            "analyze",
            (state: AgentState) => state.toolingComplete ? "finish" : "continue",
            {
                continue: "executor",
                finish: "answer"
            }
        )
        .addEdge("answer", "review")
        .addConditionalEdges(
            "review",
            (state: AgentState) => state.score && state.score >= 8 ? "finish" : "retry",
            {
                retry: "analyze",
                finish: "finalizer"
            }
        )   
        .addEdge("finalizer", "__end__")

    const graph = builder.compile()
    const diagram = graph.getGraph()
    const code = diagram.drawMermaid()
    console.log(code)
    return graph
}

