import { RunnableSequence, RunnableConfig} from "@langchain/core/runnables";
import { AgentState } from "../index";
import { BaseMessage, AIMessage } from "@langchain/core/messages";

export interface AnswerNodeOutput {
    next: string;
    answer?: string;
    error?: string;
    history?: BaseMessage[];
}

export const answerCallback = (state: AgentState) => (messages: BaseMessage[]) => {
  const history = state.history || [];
  messages.push(...history);
  if(state.agentResponse) {
    messages.push(new AIMessage(state.agentResponse));
  }
};


export const answer = (chain: RunnableSequence, config: RunnableConfig) => async ({ state }: { state: AgentState }): Promise<AnswerNodeOutput> => {
    try {

      const response: string = await chain.invoke({}, config)

      return {
        next: "review_node",
        answer: response,
        history: state.history,
      }

    } catch (error) {
      console.error("Error in answer node:", error);
      return {
        next: "review_node",
        answer: `I encountered an error while formulating your answer. Here's what I know: ${state.agentResponse || 'I could not proces your request sussfully.'}`,
        error: (error as Error).message,
        history: state.history
      };
    }

}