import { BaseMessage } from '@langchain/core/messages';
import { buildSequence, buildRunnableConfig } from '../index';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ReviewResultSchema, reviewCallback, review } from './nodes/review';
import { answerCallback, answer } from './nodes/answer';
import { toolCallback, tool } from './nodes/tool';
import { StateGraph } from '@langchain/langgraph';
import { StructuredToolInterface } from '@langchain/core/tools';

//Taken from the Simple React Agent
export interface ToolMap {
    [key: string]: string | number | boolean | object;
  }

// Define interfaces for state and graph typing
export interface AgentState {
    question?: string;
    history?: BaseMessage[];
    tool?: string;
    toolInput?: ToolMap;
    toolCallId?: string;
    error?: string;
    agentResponse?: string;
    suggestedAnswer?: string;
    review?: string;
    finalAnswer?: string;
    toolResult?: ToolMap;
  }

export async function buildGraph(model: BaseChatModel, tools: StructuredToolInterface[]) {
  const state: AgentState = {}
  
  // Review node setup
  const reviewSequence = await buildSequence("react_graph_review", model)(ReviewResultSchema, reviewCallback(state))
  const reviewConfig = buildRunnableConfig({project: "react_graph", id: "react_graph_review_node", name: "React Graph Review Node", version: "1.0.0"})
  const reviewNode = review(reviewSequence, reviewConfig)

  // Answer node setup
  const answerSequence = await buildSequence("react_graph_answer", model)(undefined, answerCallback(state))
  const answerConfig = buildRunnableConfig({project: "react_graph", id: "react_graph_answer_node", name: "React Graph Answer Node", version: "1.0.0"})
  const answerNode = answer(answerSequence, answerConfig)
  
  // Tool node setup
  const toolSequence = await buildSequence("react_graph_tool", model)(undefined, toolCallback(state, tools))
  const toolConfig = buildRunnableConfig({project: "react_graph", id: "react_graph_tool_node", name: "React Graph Tool Node", version: "1.0.0"})
  const toolNode = tool(toolSequence, toolConfig, tools)
  
  // Create the graph
  const workflow = new StateGraph<AgentState>({
    channels: {
      question: {
        value: (x: string) => x,
        default: "",
      },
      history: {
        value: (x: BaseMessage[]) => x,
        default: [],
      },
      tool: {
        value: (x: string) => x,
        default: "",
      },
      toolInput: {
        value: (x: ToolMap) => x,
        default: {},
      },
      toolCallId: {
        value: (x: string) => x,
        default: "",
      },
      error: {
        value: (x: string) => x,
        default: "",
      },
      agentResponse: {
        value: (x: string) => x,
        default: "",
      },
      answer: {
        value: (x: string) => x,
        default: "",
      },
      review: {
        value: (x: string) => x,
        default: "",
      },
      finalAnswer: {
        value: (x: string) => x,
        default: "",
      },
      toolResult: {
        value: (x: ToolMap) => x,
        default: {},
      },
    },
  });
  
  // Add nodes to the graph
  workflow.addNode("tool_node", toolNode);
  workflow.addNode("answer_node", answerNode);
  workflow.addNode("review_node", reviewNode);
  
  // Define the edges between nodes
  workflow.addEdge("tool_node", "agent_node");
  workflow.addEdge("agent_node", "tool_node");
  workflow.addEdge("agent_node", "answer_node");
  workflow.addEdge("answer_node", "review_node");
  workflow.addEdge("review_node", "answer_node");
  
  // Set the entry point
  workflow.setEntryPoint("agent_node");
  
  // Set conditional edges
  workflow.addConditionalEdges(
    "review_node",
    (state: AgentState) => {
      if (state.review) {
        const review = JSON.parse(state.review);
        return review.score > 7 ? "end" : "answer_node";
      }
      return "answer_node";
    }
  );
  
  return workflow.compile();
}