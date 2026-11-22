import asyncio

from services.llm.gateway import LLMGateway


async def main():
    gateway = LLMGateway()

    # Test normal (non-streaming) generation.
    # response = await gateway.generate(
    #     messages=[
    #         {
    #             "role": "user",
    #             "content": "Explain what an API is in one sentence.",
    #         }
    #     ]
    # )

    # print("\nLLM Response:")
    # print(response.content)

    # Test streaming generation.
    print("\nLLM Stream Response:")
    chunks = []
    async for chunk in gateway.generate_stream(
        messages=[
            {
                "role": "user",
                "content": "Explain what an API is in one sentence.",
            }
        ]
    ):
        print(chunk, end="", flush=True)
        chunks.append(chunk)
    print()

    # Test title generation.
    title = await gateway.generate_title(
        "I want to build an AI-powered repository assistant "
        "that can search codebases and explain their structure."
    )

    print("\nGenerated Title:")
    print(title)


if __name__ == "__main__":
    asyncio.run(main())