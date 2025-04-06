import asyncio
from typing import Callable, Any, List, Union, Coroutine, Optional


class StateTracker:
    def __init__(self, initial_state: Any = None):
        self.state = initial_state
        self.sync_callbacks: List[Callable[[Any, Any], None]] = []
        self.async_callbacks: List[Callable[[Any, Any], Coroutine[Any, Any, None]]] = []

    def register_callback(self, callback: Callable[[Any, Any], None]) -> None:
        """Register a synchronous callback function."""
        self.sync_callbacks.append(callback)

    def register_async_callback(self, callback: Callable[[Any, Any], Coroutine[Any, Any, None]]) -> None:
        """Register an asynchronous callback function."""
        self.async_callbacks.append(callback)

    async def update_state(self, new_state: Any) -> bool:
        """
        Update the state and trigger callbacks if the state has changed.
        Returns True if state changed, False otherwise.
        """
        if new_state != self.state:
            old_state = self.state
            self.state = new_state

            # Handle synchronous callbacks
            for callback in self.sync_callbacks:
                callback(old_state, new_state)

            # Handle asynchronous callbacks
            if self.async_callbacks:
                # Create tasks for all async callbacks
                tasks = [
                    asyncio.create_task(callback(old_state, new_state))
                    for callback in self.async_callbacks
                ]

                # Wait for all async callbacks to complete
                if tasks:
                    await asyncio.gather(*tasks)

            return True
        return False

    def get_state(self) -> Any:
        """Get the current state."""
        return self.state
