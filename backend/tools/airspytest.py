import SoapySDR
from SoapySDR import SOAPY_SDR_RX, SOAPY_SDR_CF32, SOAPY_SDR_CS16
import numpy as np
import time
import sys


def test_connection(device_args):
    """Test basic connection to the device"""
    print(f"Testing connection to: {device_args}")
    try:
        # Just create a device and print info
        sdr = SoapySDR.Device(device_args)
        print(f"Connected successfully:")
        print(f"  Driver: {sdr.getDriverKey()}")
        print(f"  Hardware: {sdr.getHardwareKey()}")
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False


def list_all_formats(sdr, direction=SOAPY_SDR_RX, channel=0):
    """Print all supported stream formats"""
    try:
        formats = sdr.getStreamFormats(direction, channel)
        print(f"Supported formats: {formats}")
        for fmt in formats:
            print(f"  Format {fmt}:")
            try:
                native = sdr.getNativeStreamFormat(direction, channel, fmt)
                print(f"    Native: {native}")
            except Exception as e:
                print(f"    Error getting native info: {e}")
    except Exception as e:
        print(f"Error getting formats: {e}")


def try_direct_CS16(device_args):
    """Try using CS16 format directly"""
    print("\nAttempting stream with CS16 format (native)...")
    try:
        sdr = SoapySDR.Device(device_args)

        # Basic setup
        channel = 0
        sdr.setSampleRate(SOAPY_SDR_RX, channel, 2.5e6)
        sdr.setFrequency(SOAPY_SDR_RX, channel, 100e6)

        # Try to set gain mode to manual
        try:
            sdr.setGainMode(SOAPY_SDR_RX, channel, False)
        except:
            pass

        # Set reasonable gain
        sdr.setGain(SOAPY_SDR_RX, channel, 20)

        # Setup with minimal stream args and native CS16 format
        stream_args = {"remote:prot": "tcp"}
        rx_stream = sdr.setupStream(SOAPY_SDR_RX, SOAPY_SDR_CS16, [channel], stream_args)

        # Get MTU
        mtu = sdr.getStreamMTU(rx_stream)
        print(f"Stream MTU: {mtu}")

        # Activate with minimal flags
        sdr.activateStream(rx_stream)

        # Create buffer for int16 samples (complex = 2 values per sample)
        buffer_size = mtu
        buffer = np.zeros(buffer_size * 2, dtype=np.int16)

        # Try to read
        print("Reading samples...")
        for i in range(3):
            print(f"Attempt {i+1}...")
            sr = sdr.readStream(rx_stream, [buffer], buffer_size, timeoutUs=5000000)
            print(f"Result: ret={sr.ret}, flags={sr.flags}")

            if sr.ret > 0:
                print(f"Success! Read {sr.ret} samples")
                # Convert to complex values
                complex_data = (
                    buffer[: sr.ret * 2].view(np.int16).astype(np.float32).view(np.complex64)
                )
                print(f"First few samples: {complex_data[:5]}")
                return True

        # Cleanup
        sdr.deactivateStream(rx_stream)
        sdr.closeStream(rx_stream)
        return False

    except Exception as e:
        print(f"Error in CS16 test: {e}")
        import traceback

        traceback.print_exc()
        return False


def try_all_args_combinations(device_args):
    """Try different combinations of stream args"""
    print("\nTrying different stream args combinations...")

    protocols = ["tcp", "udp"]
    mtus = ["1500", "4096", "8192"]
    formats = [SOAPY_SDR_CF32, SOAPY_SDR_CS16]

    for protocol in protocols:
        for mtu in mtus:
            for fmt in formats:
                fmt_name = "CF32" if fmt == SOAPY_SDR_CF32 else "CS16"
                print(f"\nTrying: protocol={protocol}, mtu={mtu}, format={fmt_name}")

                try:
                    sdr = SoapySDR.Device(device_args)
                    channel = 0

                    # Basic setup
                    sdr.setSampleRate(SOAPY_SDR_RX, channel, 2.5e6)
                    sdr.setFrequency(SOAPY_SDR_RX, channel, 100e6)
                    sdr.setGain(SOAPY_SDR_RX, channel, 20)

                    # Setup stream with current args
                    stream_args = {"remote:prot": protocol, "remote:mtu": mtu}

                    print(f"Setting up stream with args: {stream_args}")
                    rx_stream = sdr.setupStream(SOAPY_SDR_RX, fmt, [channel], stream_args)

                    # Get MTU
                    mtu_actual = sdr.getStreamMTU(rx_stream)
                    print(f"Stream MTU: {mtu_actual}")

                    # Activate with minimal flags
                    print("Activating stream...")
                    sdr.activateStream(rx_stream)

                    # Create appropriate buffer
                    buffer_size = mtu_actual
                    if fmt == SOAPY_SDR_CS16:
                        buffer = np.zeros(buffer_size * 2, dtype=np.int16)
                    else:
                        buffer = np.zeros(buffer_size, dtype=np.complex64)

                    # Try to read
                    print("Reading samples...")
                    sr = sdr.readStream(rx_stream, [buffer], buffer_size, timeoutUs=5000000)
                    print(f"Result: ret={sr.ret}, flags={sr.flags}")

                    if sr.ret > 0:
                        print(
                            f"SUCCESS! Found working configuration: protocol={protocol}, mtu={mtu}, format={fmt_name}"
                        )
                        print(f"Read {sr.ret} samples")

                        # Cleanup
                        sdr.deactivateStream(rx_stream)
                        sdr.closeStream(rx_stream)
                        return True

                    # Cleanup
                    sdr.deactivateStream(rx_stream)
                    sdr.closeStream(rx_stream)

                except Exception as e:
                    print(f"Error with this combination: {e}")

    return False


def main():
    # Use the same device args string
    device_args = "remote=tcp://192.168.60.98:55132,driver=remote,remote:driver=airspy,serial=b58069dc394c1413"
    # device_args = "remote=tcp://192.168.60.98:55132,driver=remote,remote:driver=uhd"

    # Test basic connection first
    if not test_connection(device_args):
        print("Basic connection failed. Please check if the server is running and accessible.")
        return

    # Create device and get information
    sdr = SoapySDR.Device(device_args)

    # List supported formats
    list_all_formats(sdr)

    # Try native CS16 format first
    if try_direct_CS16(device_args):
        print("\nCS16 format worked successfully!")
        return

    # Try combinations of args
    if try_all_args_combinations(device_args):
        print("\nFound a working configuration!")
        return

    print("\nAll attempts failed. Additional troubleshooting suggestions:")
    print("1. Verify the server is running with: SoapySDRServer --bind=0.0.0.0:55132")
    print("2. Check firewall settings on both client and server")
    print("3. Try a direct connection between the machines if possible")
    print("4. Check if another application is using the Airspy device")
    print(
        "5. Run the server with debug logging: SoapySDRServer --bind=0.0.0.0:55132 --logLevel=trace"
    )


if __name__ == "__main__":
    main()
