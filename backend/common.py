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

def is_geostationary(tle):
    """
    Determines whether a satellite is geostationary based on its TLE.

    :param tle: A list or tuple of two TLE lines [line1, line2].
    :return: True if the orbit is approximately geostationary, False otherwise.
    """
    if not isinstance(tle, (list, tuple)) or len(tle) < 2:
        raise ValueError("TLE must be a list or tuple containing two lines of valid TLE data.")

    line2 = tle[1]

    # According to the standard TLE format, the fields are at fixed character positions:
    # - Inclination (degrees):    columns 8-15
    # - RA of ascending node:     columns 17-24
    # - Eccentricity:            columns 26-32 (implied decimal point at the start)
    # - Argument of perigee:     columns 34-41
    # - Mean anomaly:            columns 43-50
    # - Mean motion (rev/day):   columns 52-62
    # - Revolution number:       columns 63-68

    # Extract inclination
    inclination_str = line2[8:16].strip()
    inclination_deg = float(inclination_str)

    # Extract eccentricity (the TLE format stores eccentricity as '0001234' => 0.0001234)
    eccentricity_str = line2[26:33].strip()
    eccentricity = float(f"0.{eccentricity_str}") if eccentricity_str else 0.0

    # Extract mean motion (revs per day)
    mean_motion_str = line2[52:63].strip()
    mean_motion = float(mean_motion_str)

    # Typical checks for geostationary orbit:
    # 1. Mean motion ~ 1 revolution per sidereal day (~1.0027 rev/day);
    #    we allow a small tolerance around 1.0 to 1.005 rev/day.
    # 2. Inclination near 0° (equatorial orbit)
    # 3. Eccentricity near 0 (circular orbit)

    # Define thresholds (these can be adjusted for stricter or looser checks)
    MEAN_MOTION_LOWER = 0.995    # Lower bound on mean motion
    MEAN_MOTION_UPPER = 1.005    # Upper bound on mean motion
    INCLINATION_MAX    = 3.0     # Degrees
    ECCENTRICITY_MAX   = 0.01    # Allowed eccentricity

    # Check each parameter
    is_mean_motion_ok = (MEAN_MOTION_LOWER <= mean_motion <= MEAN_MOTION_UPPER)
    is_inclination_ok = (inclination_deg <= INCLINATION_MAX)
    is_eccentricity_ok = (eccentricity <= ECCENTRICITY_MAX)

    return is_mean_motion_ok and is_inclination_ok and is_eccentricity_ok
