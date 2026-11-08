AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_repository",
            "description": (
                "Search the selected GitHub repository "
                "for relevant code, files, functions, "
                "and implementation details."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "The search query describing "
                            "what code or implementation to find."
                        ),
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    }
]