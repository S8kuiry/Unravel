from dotenv import load_dotenv
load_dotenv()

import asyncio
from services.agent.groq_client import generate_title  # adjust to your real path

async def main():
    for text in [
        "how does the email scheduler work",
        "explain the project structure",
        "hi",
    ]:
        print(repr(text), "->", repr(await generate_title(text)))

asyncio.run(main())