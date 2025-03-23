import jwt
import bcrypt
import json
import datetime
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import Users
from arguments import arguments
from models import ModelEncoder

# Replace these placeholders with your actual secret key and algorithm
JWT_ALGORITHM = "HS256"


def verify_password(password: str, passwordhash: str) -> bool:
    """
    Compare the provided password with the stored bcrypt hash using python-bcrypt.
    """
    return bcrypt.hashpw(
        password.encode("utf-8"),  # Convert plain password to bytes
        passwordhash.encode("utf-8")  # Convert stored hash to bytes
    ) == passwordhash.encode("utf-8")


def generate_jwt_token(user: Users) -> str:
    """
    Generate a JWT token with an expiration time.
    """
    payload = {
        "id": str(user.id),
        "fullname": user.fullname,
        "email": user.email,
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1)  # 1 hour expiry
    }
    token = jwt.encode(payload, arguments.secret_key, algorithm=JWT_ALGORITHM)
    return token


async def authenticate_user(dbsession: AsyncSession, email: str, password: str) -> Optional[dict]:
    """
    Attempt to authenticate user credentials against the database using an AsyncSession.
    Return a JWT token if authentication succeeds, otherwise None.
    """
    query = select(Users).where(Users.email == email)
    result = await dbsession.execute(query)
    user_record = result.scalars().first()

    if user_record and verify_password(password, user_record.password):
        user = json.loads(json.dumps(user_record, cls=ModelEncoder))
        del user["password"]

        return {'token': generate_jwt_token(user_record), 'user': user}

    else:
        return None


def verify_jwt_token(token: str) -> Optional[str]:
    """
    Verify the JWT token and return the email if valid.
    """
    try:
        decoded = jwt.decode(token, arguments.secret_key, algorithms=[JWT_ALGORITHM])
        return decoded.get("sub")
    except jwt.ExpiredSignatureError:
        # Token has expired
        return None
    except jwt.InvalidTokenError:
        # Token is invalid
        return None
