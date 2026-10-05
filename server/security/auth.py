import os
from typing import Optional

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import credentials, auth as firebase_auth
from dotenv import load_dotenv

load_dotenv()

# Build absolute path to the JSON key file located in the same directory (security/)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Find any firebase-adminsdk JSON file in this directory automatically
json_files = [f for f in os.listdir(CURRENT_DIR) if f.endswith(".json")]
if not json_files:
    raise RuntimeError("No Firebase service account JSON key found in security/ directory")

KEY_PATH = os.path.join(CURRENT_DIR, json_files[0])

# Initialize Firebase Admin SDK with the service account key
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)

# Reads the "Authorization: Bearer <token>" header
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_uid(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (firebase_auth.InvalidIdTokenError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    return decoded["uid"]