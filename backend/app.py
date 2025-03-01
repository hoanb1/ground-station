import random
import logging
from flask import Flask, jsonify, request
from models import db, TLE, User
from flask_socketio import SocketIO
from auth import auth_bp
from sgp4.api import Satrec
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///satellites.db'
db = SQLAlchemy(app)

app.register_blueprint(auth_bp, url_prefix='/auth')

socketio = SocketIO(app)


@socketio.on('connect')
def handle_connect():
    logging.info('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    logging.info('Client disconnected')


logging.basicConfig(level=logging.INFO)

# Example function to emit satellite position updates
def emit_satellite_updates():
    while True:
        # Fetch and emit satellite position data
        socketio.emit('satellite_update', {'id': 1, 'position': [51.505, -0.09]})
        socketio.sleep(5)  # Emit every 5 seconds

def emit_satellite_notifications():
    while True:
        # Randomly generate a satellite event
        event = random.choice(['Solar Flare', 'Orbital Adjustment', 'Signal Loss'])
        socketio.emit('satellite_event', {'event': event})
        socketio.sleep(30)  # Emit every 30 seconds

# Start the background task for notifications
socketio.start_background_task(emit_satellite_notifications)
# Start the background task
socketio.start_background_task(emit_satellite_updates)


@app.route('/satellite-position/<int:id>', methods=['GET'])
def get_satellite_position(id):
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404

    satellite = Satrec.twoline2rv(tle.line1, tle.line2)
    now = datetime.utcnow()
    error, position, velocity = satellite.sgp4(now.year, now.timetuple().tm_yday + now.hour/24.0 + now.minute/(24.0*60) + now.second/(24.0*3600))

    if error != 0:
        return jsonify({'message': 'Error calculating position'}), 500
    else:
        return jsonify({'position': position, 'velocity': velocity})


@app.route('/satellite-historical/<int:id>', methods=['GET'])
def get_satellite_historical(id):
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404

    satellite = Satrec.twoline2rv(tle.line1, tle.line2)
    now = datetime.utcnow()
    historical_data = []
    for i in range(-60, 0):  # Calculate path for the past 60 minutes
        time = now + timedelta(minutes=i)
        error, position, _ = satellite.sgp4(time.year, time.timetuple().tm_yday + time.hour/24.0 + time.minute/(24.0*60) + time.second/(24.0*3600))
        if error == 0:
            historical_data.append(position[0])

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    return jsonify(historical_data)


@app.route('/satellite-data/<int:id>', methods=['GET'])
def get_satellite_data(id):
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404

    satellite = Satrec.twoline2rv(tle.line1, tle.line2)
    now = datetime.utcnow()
    error, position, velocity = satellite.sgp4(now.year, now.timetuple().tm_yday + now.hour/24.0 + now.minute/(24.0*60) + now.second/(24.0*3600))

    if error != 0:
        return jsonify({'message': 'Error calculating data'}), 500


@app.route('/user-tles', methods=['GET'])
def get_user_tles():
    user_id = request.args.get('user_id')
    user = User.query.get(user_id)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    tles = TLE.query.filter_by(user_id=user_id).all()
    return jsonify([{'id': tle.id, 'name': tle.name, 'line1': tle.line1, 'line2': tle.line2} for tle in tles])
    altitude = position[2]  # Example altitude calculation
    speed = (velocity[0]**2 + velocity[1]**2 + velocity[2]**2)**0.5  # Example speed calculation

    return jsonify({'altitude': altitude, 'speed': speed})
    line1 = db.Column(db.String(70), nullable=False)


@app.route('/satellite-path/<int:id>', methods=['GET'])
def get_satellite_path(id):
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404

    satellite = Satrec.twoline2rv(tle.line1, tle.line2)
    now = datetime.utcnow()
    path = []
    for i in range(0, 60):  # Calculate path for the next 60 minutes
        time = now + timedelta(minutes=i)
        error, position, _ = satellite.sgp4(time.year, time.timetuple().tm_yday + time.hour/24.0 + time.minute/(24.0*60) + time.second/(24.0*3600))
        if error == 0:
            path.append((position[0], position[1]))

    line2 = db.Column(db.String(70), nullable=False)
    return jsonify({'path': path})


@app.route('/tle', methods=['GET'])
def get_tles():
    tles = TLE.query.all()
    return jsonify([{'id': tle.id, 'name': tle.name, 'line1': tle.line1, 'line2': tle.line2} for tle in tles])


@app.route('/tle', methods=['POST'])
def add_tle():
    data = request.get_json()
    new_tle = TLE(name=data['name'], line1=data['line1'], line2=data['line2'])
    db.session.add(new_tle)
    db.session.commit()
    return jsonify({'message': 'TLE added successfully'}), 201


@app.route('/tle/<int:id>', methods=['PUT'])
def update_tle(id):
    data = request.get_json()
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404
    tle.name = data['name']
    tle.line1 = data['line1']
    tle.line2 = data['line2']
    db.session.commit()
    return jsonify({'message': 'TLE updated successfully'})


@app.route('/tle/<int:id>', methods=['DELETE'])
def delete_tle(id):
    tle = TLE.query.get(id)
    if not tle:
        return jsonify({'message': 'TLE not found'}), 404
    db.session.delete(tle)
    db.session.commit()
    return jsonify({'message': 'TLE deleted successfully'})


if __name__ == '__main__':
    db.create_all()
    app.run(host='0.0.0.0', port=51212)
