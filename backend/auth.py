import jwt
import bcrypt
import datetime
from typing import Optional
from models import Users
from arguments import arguments

# Replace these placeholders with your actual secret key and algorithm
JWT_SECRET_KEY = "YOUR_RANDOM_SECRET_KEY"
JWT_ALGORITHM = "HS256"


def verify_password(password: str, passwordhash: str) -> bool:
    """
    Compare the provided password with the stored bcrypt hash using python-bcrypt.
    """
    return bcrypt.hashpw(
        password.encode("utf-8"),  # Convert plain password to bytes
        passwordhash.encode("utf-8")  # Convert stored hash to bytes
    ) == passwordhash.encode("utf-8")


def generate_jwt_token(user_id: str, user_email: str) -> str:
    """
    Generate a JWT token with an expiration time.
    """
    payload = {
        "id": user_id,
        "sub": user_email,
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1)  # 1 hour expiry
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token


def authenticate_user(email: str, password: str, db_session) -> Optional[str]:
    """
    Attempt to authenticate user credentials against the database.
    Return a JWT token if authentication succeeds, otherwise None.
    """
    # Fetch user record. Adjust this query for your real database logic.
    user_record = db_session.query(Users).filter(Users.email == email).first()

    if user_record and verify_password(password, user_record.password):
        # Successfully authenticated, return a signed JWT token
        return generate_jwt_token(user_record.id, user_record.email)
    else:
        return None


def verify_jwt_token(token: str) -> Optional[str]:
    """
    Verify the JWT token and return the email if valid.
    """
    try:
        decoded = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return decoded.get("sub")
    except jwt.ExpiredSignatureError:
        # Token has expired
        return None
    except jwt.InvalidTokenError:
        # Token is invalid
        return None
