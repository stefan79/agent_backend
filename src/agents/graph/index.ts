import { BaseMessage } from '@langchain/core/messages';
import { buildSequence, buildRunnableConfig } from '../index';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ReviewResultSchema, reviewCallback, review } from './nodes/review';
import { answerCallback, answer } from './nodes/answer';

//Taken from the Simple React Agent
export interface ToolInput {
    [key: string]: string | number | boolean | object;
  }

// Define interfaces for state and graph typing
export interface AgentState {
    question?: string;
    history?: BaseMessage[];
    tool?: string;
    toolInput?: ToolInput;
    toolCallId?: string;
    error?: string;
    agentResponse?: string;
    answer?: string;
    review?: string;
    finalAnswer?: string;
  }

export async function buildGraph(model: BaseChatModel) {
  const state: AgentState = {}
  const reviewSequence = await buildSequence("react_graph_review", model)(ReviewResultSchema, reviewCallback(state))
  const reviewConfig = buildRunnableConfig({project: "react_graph", id: "react_graph_review_node", name: "React Graph Review Node", version: "1.0.0"})
  const reviewNode = review(reviewSequence, reviewConfig)

  const answerSequence = await buildSequence("react_graph_answer", model)(undefined, answerCallback(state))
  const answerConfig = buildRunnableConfig({project: "react_graph", id: "react_graph_answer_node", name: "React Graph Answer Node", version: "1.0.0"})
  const answerNode = answer(answerSequence, answerConfig)
}
  