from services.context.token_counter import TokenCounter

counter = TokenCounter()

messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Where is the authentication code?"},
]

print("Message tokens:", counter.count_messages(messages))
print("Request tokens:", counter.count_request(messages))