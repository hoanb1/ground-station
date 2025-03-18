class SynchronizationErrorMainTLESource(Exception):

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message  # Additional storage for convenience

    def __str__(self):
        """
        Return a string representation of the error.
        If code is set, include it in the output.
        """
        base_str = f"SynchronizationErrorMainTLESource: {self.message}"
        return base_str

