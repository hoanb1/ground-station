# Copyright (c) 2024 Efstratios Goudelis
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


import numpy as np
import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32


# Map window function names to numpy functions
window_functions = {
    'hanning': np.hanning,
    'hamming': np.hamming,
    'blackman': np.blackman,
    'kaiser': lambda n: np.kaiser(n, beta=8.6),
    'bartlett': np.bartlett
}


class FFTAverager:
    def __init__(self, logger, averaging_factor=4, ):
        self.averaging_factor = averaging_factor
        self.accumulated_ffts = []
        self.fft_count = 0
        self.logger = logger

    def add_fft(self, fft_data):
        """Add FFT data to the accumulator and return averaged result if ready."""
        self.accumulated_ffts.append(fft_data.copy())
        self.fft_count += 1

        if len(self.accumulated_ffts) >= self.averaging_factor:
            # Average the accumulated FFTs
            averaged_fft = np.mean(self.accumulated_ffts, axis=0)

            # Clear the accumulator
            self.accumulated_ffts = []

            self.logger.debug(f"Averaged {self.averaging_factor} FFTs, total processed: {self.fft_count}")
            return averaged_fft
        return None

    def update_averaging_factor(self, new_factor):
        """Update averaging factor and clear accumulator."""
        if new_factor != self.averaging_factor:
            self.averaging_factor = new_factor
            self.accumulated_ffts = []
            self.logger.info(f"Updated FFT averaging factor to: {new_factor}")