import uuid
from typing import List


def convert_strings_to_uuids(string_uuids: List[str]) -> List[uuid.UUID]:
    """
    Converts a list of string UUIDs to a list of UUID objects.

    Parameters:
      string_uuids (List[str]): A list of strings representing UUIDs.

    Returns:
      List[uuid.UUID]: A list of UUID objects.
    """
    return [uuid.UUID(u) for u in string_uuids]
