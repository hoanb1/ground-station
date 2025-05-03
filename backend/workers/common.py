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
