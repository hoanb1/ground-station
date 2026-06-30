import numpy as np


def require_complex64(samples, source: str = "unknown") -> np.ndarray:
    """
    Enforce the in-memory IQ contract used across the pipeline.

    Contract:
    - numpy.ndarray
    - complex dtype
    - normalized/stored as complex64
    """
    if not isinstance(samples, np.ndarray):
        raise TypeError(
            f"{source}: expected numpy.ndarray IQ samples, got {type(samples).__name__}"
        )

    if samples.ndim != 1:
        samples = samples.reshape(-1)

    if not np.issubdtype(samples.dtype, np.complexfloating):
        raise TypeError(f"{source}: expected complex IQ dtype, got {samples.dtype}")

    samples = samples.astype(np.complex64, copy=False)
    if not samples.flags.c_contiguous:
        samples = np.ascontiguousarray(samples, dtype=np.complex64)
    return samples


class DCOffsetRemover:
    """
    Stateful first-order IIR high-pass filter to remove DC offset.
    Maintains filter state (zi) across successive chunks of samples
    to prevent block-to-block discontinuities (striping/banding on waterfall).
    """

    def __init__(self, alpha: float = 0.9999):
        # Alpha of 0.9999 provides a narrow notch (cutoff ~30 Hz at 2 MSPS)
        # to prevent a wide visual dip/notch in the center of the FFT spectrum
        # while still effectively blocking DC bias and slowly-drifting offset.
        self.alpha = alpha
        self.zi = None
        self.b = np.array([1.0, -1.0])
        self.a = np.array([1.0, -alpha])

    def remove(self, samples: np.ndarray) -> np.ndarray:
        from scipy.signal import lfilter

        if samples is None or len(samples) == 0:
            return samples

        if self.zi is None:
            # Estimate the initial DC offset from the first chunk to avoid startup transient
            initial_dc = np.mean(samples)
            if not np.isfinite(initial_dc):
                initial_dc = 0.0 + 0.0j
            self.zi = np.array([-initial_dc], dtype=np.complex64)

        y, self.zi = lfilter(self.b, self.a, samples, zi=self.zi)
        return y.astype(np.complex64, copy=False)
