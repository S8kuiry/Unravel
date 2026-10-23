import os
from typing import Optional

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import credentials, auth as firebase_auth
from dotenv import load_dotenv

load_dotenv()

# Initialize Firebase Admin SDK using application default credentials 
# or explicit project configuration via environment variables
try:
    firebase_admin.get_app()
except ValueError:
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    if project_id:
        # Initialize with project options directly—no credentials file needed for token verification
        firebase_admin.initialize_app(options={
            'projectId': project_id
        })
    else:
        # Fallback basic initialization
        firebase_admin.initialize_app()

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