"""
Waterfall generation background task.

This task generates waterfall spectrograms from SigMF IQ recordings.
It's designed to run as a background task with progress reporting.
"""

import logging
from multiprocessing import Queue
from pathlib import Path
from typing import Optional

from processing.waterfallgenerator import WaterfallConfig, WaterfallGenerator

logger = logging.getLogger("waterfall-task")


def generate_waterfall_task(
    recording_path: str, config_path: Optional[str] = None, _progress_queue: Optional[Queue] = None
):
    """
    Generate waterfall spectrogram from a SigMF recording.

    Args:
        recording_path: Path to the recording (without extension)
        config_path: Optional path to waterfall config JSON file
        _progress_queue: Queue for sending progress updates (injected by manager)

    Returns:
        Dict with generation results
    """
    try:
        recording_path_obj = Path(recording_path)

        if _progress_queue:
            _progress_queue.put(
                {
                    "type": "output",
                    "output": f"Starting waterfall generation for: {recording_path_obj.name}",
                    "stream": "stdout",
                    "progress": 0,
                }
            )

        # Load configuration
        if config_path:
            config = WaterfallConfig.load_from_file(Path(config_path))
        else:
            # Use default config path
            default_config_path = Path("backend/data/configs/waterfall_config.json")
            config = WaterfallConfig.load_from_file(default_config_path)

        # Create generator
        generator = WaterfallGenerator(config)

        # Monkey-patch the logger to send progress updates
        if _progress_queue:
            original_info = generator.logger.info

            def progress_info(msg):
                original_info(msg)
                # Parse progress from message if it contains "Progress: XX%"
                if "Progress:" in msg and "%" in msg:
                    try:
                        # Extract percentage from "Progress: 50%"
                        progress_str = msg.split("Progress:")[1].split("%")[0].strip()
                        progress = float(progress_str)
                        _progress_queue.put(
                            {
                                "type": "output",
                                "output": msg,
                                "stream": "stdout",
                                "progress": progress,
                            }
                        )
                    except (ValueError, IndexError):
                        _progress_queue.put({"type": "output", "output": msg, "stream": "stdout"})
                else:
                    _progress_queue.put({"type": "output", "output": msg, "stream": "stdout"})

            generator.logger.info = progress_info

        # Generate waterfall
        success = generator.generate_from_sigmf(recording_path_obj)

        if success:
            if _progress_queue:
                _progress_queue.put(
                    {
                        "type": "output",
                        "output": "Waterfall generation completed successfully!",
                        "stream": "stdout",
                        "progress": 100,
                    }
                )

            return {
                "status": "completed",
                "recording_path": str(recording_path_obj),
                "waterfall_path": str(recording_path_obj.with_suffix(".png")),
            }
        else:
            error_msg = f"Waterfall generation failed for {recording_path_obj.name}"
            if _progress_queue:
                _progress_queue.put({"type": "error", "error": error_msg, "stream": "stderr"})
            raise RuntimeError(error_msg)

    except Exception as e:
        error_msg = f"Error generating waterfall: {str(e)}"
        logger.error(error_msg)
        if _progress_queue:
            _progress_queue.put({"type": "error", "error": error_msg, "stream": "stderr"})
        raise
