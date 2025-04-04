class SynchronizationErrorMainTLESource(Exception):

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message  # Additional storage for convenience

    def __str__(self):
        base_str = f"SynchronizationErrorMainTLESource: {self.message}"
        return base_str


class AzimuthOutOfBounds(Exception):

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self):
        base_str = f"AzimuthOutOfBounds: {self.message}"
        return base_str


class ElevationOutOfBounds(Exception):

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self):
        base_str = f"ElevationOutOfBounds: {self.message}"
        return base_str


class MinimumElevationError(Exception):

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self):
        base_str = f"MinimumElevationError: {self.message}"
        return base_str


