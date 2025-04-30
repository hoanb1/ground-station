import asyncio
import concurrent.futures
import numpy as np
import rtlsdr
import logging
from functools import partial

logger = logging.getLogger('rtlsdr-data-process')

# Create a dedicated thread pool executor for RTL-SDR operations
# Using a single worker thread can help prevent concurrency issues
rtlsdr_executor = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="rtlsdr_worker")


class AsyncRtlSdr:
    """
    An asynchronous wrapper for RTL-SDR operations
    """

    def __init__(self, serial=None, host=None, port=None):
        self.serial = serial
        self.sdr = None

        self.hostname = host
        self.port = port

        self._bias_tee = False
        self._rtl_agc = False
        self._tuner_agc = False

        if host is not None and port is not None:
            self._is_tcp = True
        else:
            self._is_tcp = False

    async def connect(self):
        """Connect to the RTL-SDR device"""
        if self.sdr is not None:
            return

        try:
            if self._is_tcp:
                connect_func = partial(rtlsdr.RtlSdrTcpClient, hostname=self.hostname, port=self.port)
            else:
                connect_func = partial(rtlsdr.RtlSdr, serial_number=self.serial)

            # Run the connection in the executor
            self.sdr = await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, connect_func)
            logger.info(
                f"Connected to RTL-SDR device {self.serial if not self._is_tcp else f'TCP {self.hostname}:{self.port}'}")

        except Exception as e:
            logger.error(f"Failed to connect to RTL-SDR: {str(e)}")
            raise

    async def connect_tcp(self, hostname='127.0.0.1', port=1234):
        """Connect to an RTL-SDR TCP server"""
        self._is_tcp = True
        self.hostname = hostname
        self.port = port
        await self.connect()

    async def read_samples(self, num_samples):
        """Read samples from the device asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        read_func = partial(self.sdr.read_samples, num_samples)
        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, read_func)

    async def set_sample_rate(self, rate):
        """Set a sample rate asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_rate():
            self.sdr.sample_rate = rate
            return self.sdr.sample_rate

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_rate)

    async def set_center_freq(self, freq):
        """Set center frequency asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_freq():
            self.sdr.center_freq = freq
            return self.sdr.center_freq

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_freq)

    async def set_gain(self, gain):
        """Set gain asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_gain():
            self.sdr.gain = gain
            return self.sdr.gain

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_gain)

    async def close(self):
        """Close the device connection asynchronously"""
        if self.sdr:
            await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, self.sdr.close)
            self.sdr = None
            logger.info(
                f"Disconnected from RTL-SDR device {self.serial if not self._is_tcp else f'TCP {self.hostname}:{self.port}'}")

    async def set_bias_tee(self, enabled):
        """Set bias tee mode asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_bias_tee():
            self.sdr.set_bias_tee(enabled)
            self._bias_tee = enabled
            return enabled

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_bias_tee)

    async def set_rtl_agc(self, enabled):
        """Set RTL AGC mode asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_rtl_agc():
            self.sdr.set_agc_mode(enabled)
            self._rtl_agc = enabled
            return enabled

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_rtl_agc)

    async def set_tuner_agc(self, enabled):
        """Set tuner AGC mode asynchronously"""
        if not self.sdr:
            raise RuntimeError("Device not connected")

        def _set_tuner_agc():
            self.sdr.set_manual_gain_enabled(not enabled)
            self._tuner_agc = enabled
            return enabled

        return await asyncio.get_event_loop().run_in_executor(rtlsdr_executor, _set_tuner_agc)

    @property
    def sample_rate(self):
        return self.sdr.sample_rate if self.sdr else None

    @property
    def center_freq(self):
        return self.sdr.center_freq if self.sdr else None

    @property
    def gain(self):
        return self.sdr.gain if self.sdr else None

    @property
    def bias_tee(self):
        return self._bias_tee if self.sdr else None

    @property
    def rtl_agc(self):
        return self._rtl_agc if self.sdr else None

    @property
    def tuner_agc(self):
        return not self._tuner_agc if self.sdr else None