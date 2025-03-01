from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class TLE(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    line1 = db.Column(db.String(70), nullable=False)
    line2 = db.Column(db.String(70), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    tles = db.relationship('TLE', backref='user', lazy=True)