import { AgentState } from '../index';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableConfig, RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";

interface ReviewResult {
  score: number;
  reasoning: string;
  improvements?: string;
}

export const ReviewResultSchema = z.object({
  score: z.number().int().min(0).max(10).describe('A score from 0 to 10 indicating how good the answer is.'),
  reasoning: z.string().describe('A string explaining why the answer is good or bad.'),
  improvements: z.string().optional().describe('A string suggesting ways to improve the answer. This is optional.'),
}).describe('Review result');


export interface ReviewNodeOutput {
    next: string;
    review?: string;
    finalAnswer?: string;
    history?: BaseMessage[];
}

export const reviewCallback = (state: AgentState) => (messages: BaseMessage[]) => {
  const history = state.history || [];
  messages.push(...history);
  if(state.suggestedAnswer) {
    messages.push(new AIMessage(state.suggestedAnswer));
  }
};
  
// Review node - checks the answer for quality and correctness
export const review = (chain: RunnableSequence, config: RunnableConfig) => async ({ state }: { state: AgentState }): Promise<ReviewNodeOutput> => {
    try {

      const response: ReviewResult = await chain.invoke({}, config)

      const reviewText = JSON.stringify(response, null, 2);
      if(response.score <= 7){

        return {
          next: "answer_node",
          review: reviewText,
          history: [
            ...state.history || [],
            new AIMessage(`Review Feedback: {reviewText}`)
          ],
        }
      } else {
        return {
          next: "end",
          finalAnswer: state.suggestedAnswer,
          review: reviewText,
        }
      }

    } catch (error) {
      console.error("Error in review node:", error);
      return {
        next: "end",
        finalAnswer: state.suggestedAnswer,
        review: `Error during review: ${(error as Error).message}`,
      };
    }
  }
  