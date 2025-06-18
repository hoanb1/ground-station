import numpy as np
import time
from bridge import SDRVFODemodulatorBridge
from manager import StreamingDemodulatorManager
from vfos.state import VFOManager

# Example usage
def main():
    print("Multi-Mode VFO-Aware Streaming Demodulator Demo")

    # Import here to avoid circular imports in main usage
    from bridge import SDRVFODemodulatorBridge

    # Create bridge
    bridge = SDRVFODemodulatorBridge(
        sdr_center_freq=14.0e6,   # 14 MHz (good for AM/SSB)
        sdr_sample_rate=2048000   # 2.048 MSPS
    )

    # Get the VFO manager and configure different modulation modes
    vfo_manager = VFOManager()

    # Configure VFO 1 for AM broadcast
    vfo_manager.update_vfo_state(
        vfo_id=1,
        center_freq=int(14.205e6),  # 14.205 MHz
        bandwidth=10000,            # 10 kHz
        modulation="AM",
        active=True,
        selected=True
    )

    # Configure VFO 2 for USB
    vfo_manager.update_vfo_state(
        vfo_id=2,
        center_freq=int(14.230e6),  # 14.230 MHz
        bandwidth=3000,             # 3 kHz
        modulation="USB",
        active=True
    )

    # Configure VFO 3 for NFM
    vfo_manager.update_vfo_state(
        vfo_id=3,
        center_freq=int(14.100e6),  # 14.100 MHz
        bandwidth=25000,            # 25 kHz
        modulation="NFM",
        active=True
    )

    bridge.start()

    # Simulate SDR samples
    print("Simulating SDR sample stream...")
    for i in range(30):
        # Generate test samples
        samples = np.random.randn(8192) + 1j * np.random.randn(8192)
        samples = samples.astype(np.complex64)

        # Feed to demodulator
        bridge.on_sdr_samples(samples)

        # Test VFO changes
        if i == 10:
            print("Changing VFO 1 to LSB...")
            vfo_manager.update_vfo_state(1, modulation="LSB", bandwidth=3000)

        elif i == 20:
            print("Changing VFO 3 to WFM...")
            vfo_manager.update_vfo_state(3, modulation="WFM", bandwidth=200000)

        # Get web audio for active VFOs
        all_audio = bridge.get_all_web_audio()
        for vfo_id, audio in all_audio.items():
            if audio:
                print(f"VFO {vfo_id} audio: {len(audio['samples'])} samples")

        time.sleep(0.05)  # 50ms chunks

    # Final status
    status = bridge.get_status()
    print(f"Final status:")
    print(f"Active VFOs: {status['active_demodulators']}")
    print(f"Demodulator types: {status['demodulator_types']}")
    print(f"Samples processed: {status['statistics']['samples_processed']}")
    print(f"VFO updates: {status['statistics']['vfo_updates']}")

    bridge.stop()
    print("Demo complete!")


if __name__ == "__main__":
    main()