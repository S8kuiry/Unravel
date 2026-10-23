import os
from typing import Optional
import requests
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "unravel-subharthy")
bearer_scheme = HTTPBearer(auto_error=False)

# Google's official public keys endpoint for Firebase Auth ID tokens
GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"


def get_current_uid(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        # Fetch Google's public signing keys
        resp = requests.get(GOOGLE_CERTS_URL, timeout=5)
        public_keys = resp.json()

        # Extract the key ID from the token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid or kid not in public_keys:
            raise HTTPException(status_code=401, detail="Invalid token signature key")

        pem_cert = public_keys[kid]

        # Verify token signature, expiration, audience, and issuer securely
        decoded = jwt.decode(
            token,
            pem_cert,
            algorithms=["RS256"],
            audience=PROJECT_ID,
            issuer=f"https://securetoken.google.com/{PROJECT_ID}",
        )

        return decoded["sub"]

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")