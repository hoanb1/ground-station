from datetime import datetime, timezone

# Create a state manager class for satellite synchronization
class SatelliteSyncState:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SatelliteSyncState, cls).__new__(cls)
            cls._instance.reset()
        return cls._instance

    def reset(self):
        self.state = {
            "status": "idle",  # idle, inprogress, complete
            "progress": 0,      # 0-100 percentage
            "message": "",      # Current operation message
            "success": None,    # None, True, False
            "last_update": None, # Timestamp of last update
            "active_sources": [], # Currently processing sources
            "completed_sources": [], # Successfully processed sources
            "error": None,      # Last error message if any
            "stats": {          # Statistics about the sync
                "satellites_processed": 0,
                "transmitters_processed": 0,
                "groups_processed": 0
            }
        }

    def get_state(self):
        return self.state

    def update(self, **kwargs):
        # Update the state with the provided key-value pairs
        for key, value in kwargs.items():
            if key in self.state:
                self.state[key] = value

        # Update the timestamp when state changes
        self.state["last_update"] = datetime.now(timezone.utc).isoformat()

        return self.state

    def update_stats(self, **kwargs):
        # Update the stats dictionary with the provided key-value pairs
        for key, value in kwargs.items():
            if key in self.state["stats"]:
                self.state["stats"][key] = value

        # Update the timestamp when state changes
        self.state["last_update"] = datetime.now(timezone.utc).isoformat()

        return self.state

    def set_state(self, new_state):
        """
        Replace the entire state with a new state object.

        Parameters:
            new_state (dict): The new state dictionary to use

        Returns:
            dict: The updated state
        """
        # Only set valid keys that exist in self.state
        for key in new_state:
            if key in self.state:
                self.state[key] = new_state[key]

        # Always update the timestamp when state changes
        self.state["last_update"] = datetime.now(timezone.utc).isoformat()

        return self.state


# Create a singleton instance
sync_state_manager = SatelliteSyncState()

# For backwards compatibility, expose the state directly
sync_state = sync_state_manager.state
