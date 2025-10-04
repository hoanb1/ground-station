# Copyright (c) 2025 Efstratios Goudelis
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.


import datetime
import json
from typing import Optional

import bcrypt
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.arguments import arguments
from common.common import ModelEncoder
from db.models import Users

# Replace these placeholders with your actual secret key and algorithm
JWT_ALGORITHM = "HS256"


def verify_password(password: str, passwordhash: str) -> bool:
    """
    Compare the provided password with the stored bcrypt hash using python-bcrypt.
    """
    return bcrypt.hashpw(
        password.encode("utf-8"),  # Convert plain password to bytes
        passwordhash.encode("utf-8"),  # Convert stored hash to bytes
    ) == passwordhash.encode("utf-8")


def generate_jwt_token(user: Users) -> str:
    """
    Generate a JWT token with an expiration time.
    """
    payload = {
        "id": str(user.id),
        "fullname": user.fullname,
        "email": user.email,
        "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=1),  # 1 hour expiry
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

        return {"token": generate_jwt_token(user_record), "user": user}

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
