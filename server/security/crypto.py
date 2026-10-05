import os
from cryptography.fernet import Fernet
from dotenv import load_dotenv

load_dotenv()

# Generate once with: Fernet.generate_key().decode()  -> put in env, never in code
_fernet = Fernet(os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY").encode())


def encrypt_token(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(token_encrypted: str) -> str:
    return _fernet.decrypt(token_encrypted.encode()).decode()