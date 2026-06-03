import numpy as np
import pytest

from common.iqsamples import require_complex64


def test_require_complex64_accepts_complex_array():
    samples = np.array([1 + 2j, -0.25 + 0.5j], dtype=np.complex64)
    out = require_complex64(samples, source="test")
    assert out.dtype == np.complex64
    np.testing.assert_allclose(out, samples)


def test_require_complex64_casts_complex128_to_complex64():
    samples = np.array([1 + 2j, -0.25 + 0.5j], dtype=np.complex128)
    out = require_complex64(samples, source="test")
    assert out.dtype == np.complex64
    np.testing.assert_allclose(out, samples.astype(np.complex64))


def test_require_complex64_rejects_non_complex_input():
    samples = np.array([0, 255, 128, 127], dtype=np.uint8)
    with pytest.raises(TypeError):
        require_complex64(samples, source="test")


def test_dc_offset_remover():
    from common.iqsamples import DCOffsetRemover
    
    # 1. Basic test: check that DC is removed
    remover = DCOffsetRemover(alpha=0.99)
    dc = 2.0 + 3.0j
    samples = np.ones(1000, dtype=np.complex64) * dc
    # First chunk: the mean is dc, zi initialized to -dc
    out = remover.remove(samples)
    # The output should be 0 because steady state is reached immediately with initial_dc
    np.testing.assert_allclose(out, np.zeros(1000, dtype=np.complex64), atol=1e-5)
    
    # 2. Check that it doesn't distort high-frequency signals
    t = np.arange(1000)
    sig = np.exp(2j * np.pi * 0.1 * t).astype(np.complex64)  # High frequency
    samples = sig + dc
    
    remover = DCOffsetRemover(alpha=0.999)
    out1 = remover.remove(samples[:500])
    out2 = remover.remove(samples[500:])
    out = np.concatenate([out1, out2])
    
    # Check that output is close to the original signal without DC
    np.testing.assert_allclose(out[100:], sig[100:], atol=1e-2)

