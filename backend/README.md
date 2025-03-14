# Instructions to Start up the Application

This guide will help you run the `app.py` using Python.

## Prerequisites

1. **Python**: Ensure that Python 3.12.3 or higher is installed on your
   system. [Download Python](https://www.python.org/).
2. **Pip**: The Python package manager should already be installed with Python. Verify it by running:
   ```bash
   pip --version
   ```
3. **Required Packages**: The application uses the following Python packages:
   - Flask
   - SQLAlchemy
   - Jinja2
   - Werkzeug
   - click

   Install the dependencies by running:
   ```bash
   pip install -r requirements.txt
   ```
   (Make sure the `requirements.txt` file is in the project directory. If it does not exist, manually install the
   mentioned packages using `pip install [package_name]`.)

## Steps to Start the App

1. **Navigate to the Project Directory**:
   Open a terminal or command prompt and navigate to the folder where `app.py` is located:
   ```bash
   cd /path/to/your/project
   ```

2. **Run the Application**:
   Use Python to run the `app.py` file:
   ```bash
   python app.py
   ```

3. **Access the Application**:
   Once the app starts successfully, you should see output in the terminal indicating that the Flask development server
   is running. By default, it will look something like this:
   ```
   Running on http://127.0.0.1:5000/ (Press CTRL+C to quit)
   ```
   Open a web browser and visit the URL `http://127.0.0.1:5000/` to access the application.

## Notes

- If the application relies on any environment variables or configuration files, ensure that they are properly set up
  before running the app.
- For detailed logs or errors, check the terminal output while the app runs.
- Use a virtual environment for managing dependencies to avoid conflicts with other projects. You can set it up as
  follows:
   ```bash
   python -m venv venv
   source venv/bin/activate    # On macOS/Linux
   .\venv\Scripts\activate     # On Windows
   ```
  Then install the packages using `pip`.

That’s it! Your application should now be up and running.