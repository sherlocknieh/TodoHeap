import json

import openai
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)

NUMBER = 5
SYSTEM_PROMPT = f"""You are an AI assistant helping with task breakdown. 
Generate exactly {NUMBER} an appropriate number of subtasks based on the provided prompt and context.

IMPORTANT: Your response MUST be a JSON object with a "subtasks" property containing an array of subtask objects. 
Each subtask must include ALL of the following fields:
- title: A clear, actionable title (5-200 characters)
- description: A detailed description (minimum 10 characters)
- details: Implementation details (minimum 20 characters)

You may optionally include a \"metadata\" object. Do not include any other top-level properties.
"""


class BreakdownTask:
    def __init__(self, base_url: str, model: str, api_key: str):
        self.base_url = base_url
        self.model = model
        self.api_key = api_key

        self.client = openai.Client(base_url=self.base_url, api_key=self.api_key)

    def prompt(
        self,
        goal: str,
        system_prompt: str = SYSTEM_PROMPT,
        model: str = "",
    ):
        if model == "":  # 如果没有指定模型，则使用默认模型
            model = self.model

        messages: list[ChatCompletionMessageParam] = [
            ChatCompletionSystemMessageParam(
                role="system",
                content=system_prompt,
            ),
            ChatCompletionUserMessageParam(
                role="user",
                content=goal,
            ),
        ]

        response = (
            self.client.chat.completions.create(
                model=model,
                messages=messages,
            )
            .choices[0]
            .message.content
        )

        if response is None:
            return None
        else:
            response = self._clean_text(response)
            try:
                return json.loads(response)
            except json.JSONDecodeError as e:
                return {"error": str(e)}

    def _list_models(self):
        response = self.client.models.list()
        return response

    def _clean_text(self, text: str) -> str:  # 清理ai的回复
        text = text.replace("```json\n", "")
        text = text.replace("```", "")
        text = text.replace("\n", "")
        return text


def main():
    base_url = "https://api.deepseek.com/v1"
    model = "deepseek-chat"

    import os

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if api_key is None:
        print("Please set the DEEPSEEK_API_KEY environment variable.")
        return
    bdt = BreakdownTask(base_url, model, api_key)

    response = bdt.prompt("学习线性代数")
    print(response)


if __name__ == "__main__":
    main()
