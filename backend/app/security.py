from fastapi import Security, HTTPException
from fastapi.security.api_key import APIKeyHeader
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("SECURITY_API_KEY")
API_KEY_NAME = "x-api-key"
print("KEY", API_KEY)

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def require_api_key(api_key_header_value: str = Security(api_key_header)):
    if api_key_header_value == API_KEY:
        return api_key_header_value
    raise HTTPException(status_code=403, detail="Forbidden")