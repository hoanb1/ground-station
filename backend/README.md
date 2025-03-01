# Satellite Tracking Backend

This is the backend part of the Satellite Tracking Application, built with Flask.

## Getting Started

### Prerequisites
- Python 3.x

### Setup
1. Navigate to the backend directory:
   ```bash
### Database Setup
1. Ensure SQLite is installed on your system.
2. The database will be automatically created when you run the backend server for the first time.
3. If you need to manually create or reset the database, you can delete the existing `satellites.db` file and restart the server.
   cd satellite-tracking-backend
   ```
2. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the backend server:
   ```bash
   python app.py
   ```
   The backend will be available at `http://localhost:51212`.

## Usage
- The backend handles API requests and provides data to the frontend.

## Technologies Used
- Flask
- SQLite
- Socket.IO

## License
This project is licensed under the MIT License.