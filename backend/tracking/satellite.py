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


import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from sgp4.api import Satrec, jday

from common.skyfieldts import ts


def get_satellite_az_el(
    home_lat: float,
    home_lon: float,
    satellite_tle_line1: str,
    satellite_tle_line2: str,
    observation_time: datetime,
) -> Tuple[float, float]:
    """
    Given a home location (latitude, longitude), a satellite TLE (two-line element),
    and a specific observation time, this function returns the
    azimuth and elevation of the satellite in degrees.

    Parameters:
    - home_lat: Latitude of the home location in degrees
    - home_lon: Longitude of the home location in degrees
    - satellite_tle_line1: First line of the satellite's TLE
    - satellite_tle_line2: Second line of the satellite's TLE
    - observation_time: A Python datetime representing the observation time (UTC)

    Returns:
    - (azimuth, elevation): Tuple (in degrees)
    """
    t = ts.from_datetime(observation_time)
    theta = t.gmst * (math.pi / 12.0)
    jd, fr = jday(
        int(t.utc.year),
        int(t.utc.month),
        int(t.utc.day),
        int(t.utc.hour),
        int(t.utc.minute),
        float(t.utc.second),
    )

    sat = Satrec.twoline2rv(satellite_tle_line1.strip(), satellite_tle_line2.strip())
    err, pos, vel = sat.sgp4(jd, fr)
    if err != 0:
        # Fallback to Skyfield if SGP4 error occurs
        from skyfield.api import EarthSatellite as E_Sat
        from skyfield.api import wgs84 as w_84

        satellite = E_Sat(satellite_tle_line1, satellite_tle_line2)
        observer = w_84.latlon(home_lat, home_lon)
        difference = satellite - observer
        alt, az, _ = difference.at(t).altaz()
        return round(az.degrees, 4), round(alt.degrees, 4)

    # TEME to ECEF rotation
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    x_ecef = pos[0] * cos_theta + pos[1] * sin_theta
    y_ecef = -pos[0] * sin_theta + pos[1] * cos_theta
    z_ecef = pos[2]

    # Observer ECEF (WGS-84)
    a = 6378.137  # km
    b = 6356.7523142  # km
    esq = 1.0 - (b**2) / (a**2)
    phi = math.radians(home_lat)
    lam = math.radians(home_lon)
    N = a / math.sqrt(1.0 - esq * (math.sin(phi) ** 2))
    x_obs = N * math.cos(phi) * math.cos(lam)
    y_obs = N * math.cos(phi) * math.sin(lam)
    z_obs = N * (1.0 - esq) * math.sin(phi)

    # Relative ECEF vector
    rx = x_ecef - x_obs
    ry = y_ecef - y_obs
    rz = z_ecef - z_obs

    # Local SEZ coordinates
    sin_phi = math.sin(phi)
    cos_phi = math.cos(phi)
    sin_lam = math.sin(lam)
    cos_lam = math.cos(lam)

    s = sin_phi * cos_lam * rx + sin_phi * sin_lam * ry - cos_phi * rz
    e = -sin_lam * rx + cos_lam * ry
    z = cos_phi * cos_lam * rx + cos_phi * sin_lam * ry + sin_phi * rz

    range_val = math.sqrt(s**2 + e**2 + z**2)
    if range_val < 1e-9:
        return 0.0, 90.0

    el_rad = math.asin(z / range_val)
    az_rad = math.atan2(e, -s)

    az_deg = math.degrees(az_rad)
    if az_deg < 0:
        az_deg += 360.0
    el_deg = math.degrees(el_rad)

    return round(az_deg, 4), round(el_deg, 4)


def get_satellite_position_from_tle(tle_lines):
    """
    Computes the position and velocity of a satellite from its Two-Line Element (TLE) data.

    This function parses the provided TLE lines to create a satellite object and calculates
    its current geocentric position and velocity. It then determines the subpoint of the
    satellite (its latitude, longitude, and altitude above Earth's surface) and computes
    its velocity in kilometers per second.

    :param tle_lines: List of strings containing the TLE data for the satellite. The TLE must
        include exactly three lines: the satellite name, followed by two TLE lines.
    :type tle_lines: list[str]
    :return: A dictionary containing the latitude, longitude, altitude, and velocity of the satellite.
    :rtype: dict[str, float]
    """

    name = tle_lines[0].strip()
    line1 = tle_lines[1].strip()
    line2 = tle_lines[2].strip()

    t = ts.now()
    theta = t.gmst * (math.pi / 12.0)
    jd, fr = jday(
        int(t.utc.year),
        int(t.utc.month),
        int(t.utc.day),
        int(t.utc.hour),
        int(t.utc.minute),
        float(t.utc.second),
    )

    sat = Satrec.twoline2rv(line1, line2)
    err, pos, vel = sat.sgp4(jd, fr)
    if err != 0:
        # Fallback to Skyfield if SGP4 error occurs
        from skyfield.api import EarthSatellite as E_Sat

        satellite = E_Sat(line1, line2, name, ts)
        geocentric = satellite.at(t)
        subpoint = geocentric.subpoint()
        vx, vy, vz = geocentric.velocity.km_per_s
        return {
            "lat": float(subpoint.latitude.degrees),
            "lon": float(subpoint.longitude.degrees),
            "alt": float(subpoint.elevation.m),
            "vel": float(math.sqrt(vx * vx + vy * vy + vz * vz)),
        }

    # TEME to ECEF rotation
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    x_ecef = pos[0] * cos_theta + pos[1] * sin_theta
    y_ecef = -pos[0] * sin_theta + pos[1] * cos_theta
    z_ecef = pos[2]

    # Geodetic coordinates (WGS-84) using Bowring's method
    a = 6378.137  # km
    b = 6356.7523142  # km
    esq = 1.0 - (b**2) / (a**2)
    epsq = (a**2) / (b**2) - 1.0
    p = math.sqrt(x_ecef**2 + y_ecef**2)
    if p < 1e-9:
        lat_deg = 90.0 if z_ecef > 0 else -90.0
        lon_deg = 0.0
        alt_m = abs(z_ecef) - b
    else:
        u = math.atan2(z_ecef * a, p * b)
        lat = math.atan2(z_ecef + epsq * b * (math.sin(u) ** 3), p - esq * a * (math.cos(u) ** 3))
        lon = math.atan2(y_ecef, x_ecef)
        N = a / math.sqrt(1.0 - esq * (math.sin(lat) ** 2))
        alt = p / math.cos(lat) - N
        lat_deg = math.degrees(lat)
        lon_deg = math.degrees(lon)
        alt_m = alt * 1000.0

        # Normalize longitude to [-180, 180]
        if lon_deg > 180:
            lon_deg -= 360
        elif lon_deg < -180:
            lon_deg += 360

    # Velocity in km/s (magnitude of TEME velocity is invariant under rotation)
    velocity_km_s = math.sqrt(vel[0] ** 2 + vel[1] ** 2 + vel[2] ** 2)

    return {
        "lat": float(lat_deg),
        "lon": float(lon_deg),
        "alt": float(alt_m),
        "vel": float(velocity_km_s),
    }


def get_satellite_path(
    tle: List[str], duration_minutes: float, step_minutes: float = 1.0
) -> Dict[str, List[List[Dict[str, float]]]]:
    """
    Computes the satellite's past and future path coordinates from its TLE.
    The path is computed at a fixed time step and then split into segments so that
    no segment contains a line crossing the dateline (+180 or -180 longitude).

    Args:
        tle: A list containing two TLE lines [line1, line2]
        duration_minutes: The projection duration (in minutes) for both past and future
        step_minutes: The time interval in minutes between coordinate samples

    Returns:
        An object with two properties:
        {
            'past': [[{lat, lon}], ...],
            'future': [[{lat, lon}], ...]
        }
        Each segment is a list of coordinate points that don't cross the dateline
    """
    try:
        if len(tle) != 2:
            raise ValueError("TLE must contain exactly two lines")

        line1 = tle[0].strip()
        line2 = tle[1].strip()
        sat = Satrec.twoline2rv(line1, line2)

        now = datetime.now(timezone.utc)

        # Earth constants for Bowring's method (WGS-84)
        a = 6378.137  # km
        b = 6356.7523142  # km
        esq = 1.0 - (b**2) / (a**2)
        epsq = (a**2) / (b**2) - 1.0

        # Earth rotation rate in radians per second (GMST rate of change)
        omega_e = 7.2921158579e-5

        total_steps = int(duration_minutes / step_minutes)
        step_sec = step_minutes * 60.0
        jd_step = step_minutes / 1440.0

        # 1. Past path calculation
        past_start = now - timedelta(minutes=duration_minutes)
        t0_p = ts.from_datetime(past_start)
        theta_0_p = t0_p.gmst * (math.pi / 12.0)

        past_points = []
        jd0_p, fr0_p = jday(
            past_start.year,
            past_start.month,
            past_start.day,
            past_start.hour,
            past_start.minute,
            past_start.second + past_start.microsecond / 1e6,
        )

        for step in range(total_steps + 1):
            jd = jd0_p
            fr = fr0_p + step * jd_step

            err, pos, vel = sat.sgp4(jd, fr)
            if err == 0:
                dt_seconds = step * step_sec
                theta = (theta_0_p + omega_e * dt_seconds) % (2.0 * math.pi)

                cos_theta = math.cos(theta)
                sin_theta = math.sin(theta)
                x_ecef = pos[0] * cos_theta + pos[1] * sin_theta
                y_ecef = -pos[0] * sin_theta + pos[1] * cos_theta
                z_ecef = pos[2]

                p = math.sqrt(x_ecef**2 + y_ecef**2)
                if p < 1e-9:
                    lat_deg = 90.0 if z_ecef > 0 else -90.0
                    lon_deg = 0.0
                else:
                    u = math.atan2(z_ecef * a, p * b)
                    lat = math.atan2(
                        z_ecef + epsq * b * (math.sin(u) ** 3), p - esq * a * (math.cos(u) ** 3)
                    )
                    lon = math.atan2(y_ecef, x_ecef)
                    lat_deg = math.degrees(lat)
                    lon_deg = math.degrees(lon)
                past_points.append({"lat": lat_deg, "lon": normalize_longitude(lon_deg)})

        # 2. Future path calculation
        t0_f = ts.from_datetime(now)
        theta_0_f = t0_f.gmst * (math.pi / 12.0)

        future_points = []
        jd0_f, fr0_f = jday(
            now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1e6
        )

        for step in range(total_steps + 1):
            jd = jd0_f
            fr = fr0_f + step * jd_step

            err, pos, vel = sat.sgp4(jd, fr)
            if err == 0:
                dt_seconds = step * step_sec
                theta = (theta_0_f + omega_e * dt_seconds) % (2.0 * math.pi)

                cos_theta = math.cos(theta)
                sin_theta = math.sin(theta)
                x_ecef = pos[0] * cos_theta + pos[1] * sin_theta
                y_ecef = -pos[0] * sin_theta + pos[1] * cos_theta
                z_ecef = pos[2]

                p = math.sqrt(x_ecef**2 + y_ecef**2)
                if p < 1e-9:
                    lat_deg = 90.0 if z_ecef > 0 else -90.0
                    lon_deg = 0.0
                else:
                    u = math.atan2(z_ecef * a, p * b)
                    lat = math.atan2(
                        z_ecef + epsq * b * (math.sin(u) ** 3), p - esq * a * (math.cos(u) ** 3)
                    )
                    lon = math.atan2(y_ecef, x_ecef)
                    lat_deg = math.degrees(lat)
                    lon_deg = math.degrees(lon)
                future_points.append({"lat": lat_deg, "lon": normalize_longitude(lon_deg)})

        past_segments = split_at_dateline(past_points)
        future_segments = split_at_dateline(future_points)

        return {"past": past_segments, "future": future_segments}

    except Exception as e:
        print(f"Error computing satellite paths: {str(e)}")
        return {"past": [], "future": []}


def normalize_longitude(lon: float) -> float:
    """
    Normalize longitude to be in the range [-180, 180].

    Args:
        lon: The longitude value to normalize

    Returns:
        The normalized longitude value
    """
    while lon > 180:
        lon -= 360
    while lon < -180:
        lon += 360
    return lon


def split_at_dateline(points: List[Dict[str, float]]) -> List[List[Dict[str, float]]]:
    """
    Splits a list of coordinate points into segments so that no segment
    crosses the international date line (longitude ±180°).

    Args:
        points: A list of coordinate dictionaries with 'lat' and 'lon' keys

    Returns:
        A list of segments, where each segment is a list of coordinate points
    """
    if not points:
        return []

    segments = []
    current_segment = [points[0]]

    for i in range(1, len(points)):
        prev_point = points[i - 1]
        current_point = points[i]

        # Check if we cross the dateline (large longitude change)
        if abs(current_point["lon"] - prev_point["lon"]) > 180:
            # End the current segment
            segments.append(current_segment)
            # Start a new segment
            current_segment = [current_point]
        else:
            # Add point to the current segment
            current_segment.append(current_point)

    # Add the last segment if it's not empty
    if current_segment:
        segments.append(current_segment)

    return segments
