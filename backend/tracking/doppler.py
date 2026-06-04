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


from typing import Tuple

from common.skyfieldts import ts


def calculate_range_rate(
    tle_line1,
    tle_line2,
    observer_lat,
    observer_lon,
    observer_elevation,
    time=None,
) -> float:
    """
    Calculate the range rate (radial velocity) of a satellite relative to the observer in km/s.
    """
    import math

    from sgp4.api import Satrec, jday

    if time is None:
        time = ts.now()

    theta = time.gmst * (math.pi / 12.0)
    jd, fr = jday(
        int(time.utc.year),
        int(time.utc.month),
        int(time.utc.day),
        int(time.utc.hour),
        int(time.utc.minute),
        float(time.utc.second),
    )

    sat = Satrec.twoline2rv(tle_line1.strip(), tle_line2.strip())
    err, pos, vel = sat.sgp4(jd, fr)
    if err != 0:
        # Fallback to Skyfield if SGP4 error occurs
        from skyfield.api import EarthSatellite as E_Sat
        from skyfield.api import Topos as T_Pos

        satellite = E_Sat(tle_line1, tle_line2, name="Satellite", ts=ts)
        topos = T_Pos(
            latitude_degrees=observer_lat,
            longitude_degrees=observer_lon,
            elevation_m=observer_elevation,
        )
        difference = satellite - topos
        topocentric = difference.at(time)
        pos, vel = topocentric.position.km, topocentric.velocity.km_per_s
        pos_mag = math.sqrt(pos[0] ** 2 + pos[1] ** 2 + pos[2] ** 2)
        if pos_mag < 1e-9:
            return 0.0
        range_rate = (pos[0] * vel[0] + pos[1] * vel[1] + pos[2] * vel[2]) / pos_mag
        return float(range_rate)

    # TEME to ECEF rotation
    cos_theta = math.cos(theta)
    sin_theta = math.sin(theta)
    x_ecef = pos[0] * cos_theta + pos[1] * sin_theta
    y_ecef = -pos[0] * sin_theta + pos[1] * cos_theta
    z_ecef = pos[2]

    omega_e = 7.292115e-5  # rad/s
    vx_ecef = vel[0] * cos_theta + vel[1] * sin_theta + omega_e * y_ecef
    vy_ecef = -vel[0] * sin_theta + vel[1] * cos_theta - omega_e * x_ecef
    vz_ecef = vel[2]

    # Observer ECEF (WGS-84)
    a = 6378.137  # km
    b = 6356.7523142  # km
    esq = 1.0 - (b**2) / (a**2)
    phi = math.radians(observer_lat)
    lam = math.radians(observer_lon)
    h = observer_elevation / 1000.0  # to km
    N = a / math.sqrt(1.0 - esq * (math.sin(phi) ** 2))
    x_obs = (N + h) * math.cos(phi) * math.cos(lam)
    y_obs = (N + h) * math.cos(phi) * math.sin(lam)
    z_obs = (N * (1.0 - esq) + h) * math.sin(phi)

    # Relative ECEF vector
    rx = x_ecef - x_obs
    ry = y_ecef - y_obs
    rz = z_ecef - z_obs

    range_val = math.sqrt(rx**2 + ry**2 + rz**2)
    if range_val < 1e-9:
        return 0.0

    range_rate = (rx * vx_ecef + ry * vy_ecef + rz * vz_ecef) / range_val
    return float(range_rate)


def calculate_doppler_shift_from_range_rate(
    range_rate: float,
    transmitted_freq_hz: float,
) -> Tuple[float, float]:
    """
    Calculate the Doppler shift from a pre-calculated range rate in km/s.
    """
    # Speed of light in km/s
    c = 299792.458  # speed of light in km/s

    # Calculate Doppler shift
    doppler_factor = 1.0 - (range_rate / c)

    # Calculate observed frequency
    observed_freq_hz = transmitted_freq_hz * doppler_factor

    # Calculate the shift in Hz
    doppler_shift_hz = observed_freq_hz - transmitted_freq_hz

    return round(float(observed_freq_hz), 0), round(float(doppler_shift_hz), 0)


def calculate_doppler_shift(
    tle_line1,
    tle_line2,
    observer_lat,
    observer_lon,
    observer_elevation,
    transmitted_freq_hz,
    time=None,
):
    """
    Calculate the Doppler shift for a satellite at a given time.
    """
    range_rate = calculate_range_rate(
        tle_line1,
        tle_line2,
        observer_lat,
        observer_lon,
        observer_elevation,
        time,
    )
    return calculate_doppler_shift_from_range_rate(range_rate, transmitted_freq_hz)
