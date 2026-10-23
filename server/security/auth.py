import os
import logging
from typing import Optional
import requests
import jwt
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

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
        # 1. Fetch Google's public signing keys
        resp = requests.get(GOOGLE_CERTS_URL, timeout=5)
        resp.raise_for_status()
        public_keys = resp.json()

        # 2. Extract the key ID from the token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid or kid not in public_keys:
            logger.error(f"Token verification failed: kid '{kid}' not found in Google public keys.")
            raise HTTPException(status_code=401, detail="Invalid token signature key")

        pem_cert_str = public_keys[kid]

        # 3. Explicitly parse the X.509 certificate and extract the public key using cryptography
        cert = x509.load_pem_x509_certificate(pem_cert_str.encode("utf-8"), default_backend())
        public_key = cert.public_key()

        # 4. Verify token signature, expiration, audience, and issuer securely
        decoded = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=PROJECT_ID,
            issuer=f"https://securetoken.google.com/{PROJECT_ID}",
        )

        return decoded["sub"]

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.PyJWTError as e:
        logger.error(f"PyJWT error during validation: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error in get_current_uid: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal auth error: {str(e)}")