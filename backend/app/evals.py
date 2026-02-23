import os
from dotenv import load_dotenv
from langsmith import client
from langsmith import evaluate
from openevals.llm import create_llm_as_judge
from openevals.prompts import (
    CORRECTNESS_PROMPT,
    CONCISENESS_PROMPT,
    HALLUCINATION_PROMPT,
    RAG_HELPFULNESS_PROMPT,
)
from agent import build_agent
import uuid


load_dotenv()

# craete agent 
agent = build_agent()

# create a target fucntion
# This is what langsmith calls for each exampe in your dataset
def aayushmaan_target(inputs: dict) -> dict:
    question = inputs["question"]
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}

    response = agent.invoke(
            {"messages": [{"role": "user", "content": question}]},
            config=config,
            context={"is_voice": False}
        )

    last_message = response["messages"][-1]
    return {"answer": last_message.content}

    
# ---- Evaluators using openevals prebuilt prompts ----

# 1. Correctness — compares against reference answer
def correctness_evaluator(inputs: dict, outputs: dict, reference_outputs: dict):
    evaluator = create_llm_as_judge(
        prompt=CORRECTNESS_PROMPT,
        model="openai:gpt-4o-mini",
        feedback_key="correctness",
    )
    return evaluator(inputs=inputs, outputs=outputs, reference_outputs=reference_outputs)


# 2. Conciseness — no reference needed, just checks if response is concise
def conciseness_evaluator(inputs: dict, outputs: dict):
    evaluator = create_llm_as_judge(
        prompt=CONCISENESS_PROMPT,
        model="openai:gpt-4o-mini",
        feedback_key="conciseness",
    )
    return evaluator(inputs=inputs, outputs=outputs)


# 3. Hallucination — uses reference answer as context
def hallucination_evaluator(inputs: dict, outputs: dict, reference_outputs: dict):
    evaluator = create_llm_as_judge(
        prompt=HALLUCINATION_PROMPT,
        model="openai:gpt-4o-mini",
        feedback_key="hallucination",
    )
    return evaluator(
        inputs=inputs,
        outputs=outputs,
        context=reference_outputs,   # reference answer acts as the ground truth context
        reference_outputs=""
    )


# 4. Helpfulness — no reference needed, checks if response answers the question well
def helpfulness_evaluator(inputs: dict, outputs: dict):
    evaluator = create_llm_as_judge(
        prompt=RAG_HELPFULNESS_PROMPT,
        model="openai:gpt-4o-mini",
        feedback_key="helpfulness",
    )
    return evaluator(inputs=inputs, outputs=outputs)

# 5. Relevance — custom prompt, no reference needed
RELEVANCE_PROMPT = """
You are an expert evaluator. Does the answer directly and relevantly address the question asked?

<input>
{inputs}
</input>

<output>
{outputs}
</output>

Score 1 if the answer is relevant and on-topic, 0 if it goes off-topic or ignores the question.
"""

def relevance_evaluator(inputs: dict, outputs: dict):
    evaluator = create_llm_as_judge(
        prompt=RELEVANCE_PROMPT,
        model="openai:gpt-4o-mini",
        feedback_key="relevance",
    )
    return evaluator(inputs=inputs, outputs=outputs)


# ---- Run Evaluation ----
if __name__ == "__main__":
    results = evaluate(
        aayushmaan_target,
        data="aayushbot-eval-dataset",      # your exact dataset name in LangSmith
        evaluators=[
            correctness_evaluator,
            conciseness_evaluator,
            hallucination_evaluator,
            helpfulness_evaluator,
            relevance_evaluator,
        ],
        experiment_prefix="aayushbot-eval-v1",
        metadata={"version": "v1.0"}
    )
    print("\nDone. View results at https://smith.langchain.com")