import time
import functools
from app import logger


def timeit(func):
    """Decorator that reports the execution time of the decorated function."""

    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        logger.info(f"Function '{func.__name__}' executed in {elapsed_time:.6f} seconds.")
        return result

    return wrapper

def async_timeit(func):
    """
    Async decorator that reports the execution time of the decorated coroutine.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        result = await func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed_time = end_time - start_time
        logger.info(f"Function '{func.__name__}' executed in {elapsed_time:.6f} seconds.")
        return result

    return wrapper
