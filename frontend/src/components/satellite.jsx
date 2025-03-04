import * as satelliteJs from 'satellite.js';
import * as d3 from "d3";

/**
 * Satellite factory function that wraps satellitejs functionality
 * and can compute footprints based on TLE and date
 *
 * @param {string[][]} tle two-line element
 * @param {Date} date date to propagate with TLE
 */
export function Satellite(tle, date) {
    this._satrec = satelliteJs.twoline2satrec(tle[0], tle[1]);
    this._satNum = this._satrec.satnum; // NORAD Catalog Number

    this.RADIANS = Math.PI / 180;
    this.DEGREES = 180 / Math.PI;
    this.R_EARTH = 6378.137; // equatorial radius (km)

    this._altitude; // km
    this._position = {
        lat: null,
        lng: null
    };
    this._halfAngle; // degrees
    this._date;
    this._gmst;

    this.setDate(date);
    this.update();
    this._orbitType = this.orbitTypeFromAlt(this._altitude); // LEO, MEO, or GEO
};

/**
 * Updates satellite position and altitude based on current TLE and date
 */
Satellite.prototype.update = function () {
    let positionAndVelocity = satelliteJs.propagate(this._satrec, this._date);
    let positionGd = satelliteJs.eciToGeodetic(positionAndVelocity.position, this._gmst);

    this._position = {
        lat: positionGd.latitude * this.DEGREES,
        lng: positionGd.longitude * this.DEGREES
    };
    this._altitude = positionGd.height;
    return this;
};

/**
 * @returns {GeoJSON.Polygon} GeoJSON describing the satellite's current footprint on the Earth
 */
Satellite.prototype.getFootprint = function () {
    let theta = this._halfAngle * this.RADIANS;

    let coreAngle = this._coreAngle(theta, this._altitude, this.R_EARTH) * this.DEGREES;

    return d3.geoCircle()
        .center([this._position.lng, this._position.lat])
        .radius(coreAngle)();
};

/**
 * A conical satellite with half angle casts a circle on the Earth. Find the angle
 * from the center of the earth to the radius of this circle
 * @param {number} theta: Satellite half angle in radians
 * @param {number} altitude Satellite altitude
 * @param {number} r Earth radius
 * @returns {number} core angle in radians
 */
Satellite.prototype._coreAngle = function (theta, altitude, r) {
    // if FOV is larger than Earth, assume it goes to the tangential point
    if (Math.sin(theta) > r / (altitude + r)) {
        return Math.acos(r / (r + altitude));
    }
    return Math.abs(Math.asin((r + altitude) * Math.sin(theta) / r)) - theta;
};

Satellite.prototype.halfAngle = function (halfAngle) {
    if (!arguments.length) return this._halfAngle;
    this._halfAngle = halfAngle;
    return this;
};

Satellite.prototype.satNum = function (satNum) {
    if (!arguments.length) return this._satNum;
    this._satNum = satNum;
    return this;
};

Satellite.prototype.altitude = function (altitude) {
    if (!arguments.length) return this._altitude;
    this._altitude = altitude;
    return this;
};

Satellite.prototype.position = function (position) {
    if (!arguments.length) return this._position;
    this._position = position;
    return this;
};

Satellite.prototype.getOrbitType = function () {
    return this._orbitType;
};

/**
 * sets both the date and the Greenwich Mean Sidereal Time
 * @param {Date} date
 */
Satellite.prototype.setDate = function (date) {
    this._date = date;
    this._gmst = satelliteJs.gstime(date);
    return this;
};

/**
 * Maps an altitude to a type of satellite
 * @param {number} altitude (in KM)
 * @returns {'LEO' | 'MEO' | 'GEO'}
 */
Satellite.prototype.orbitTypeFromAlt = function (altitude) {
    this._altitude = altitude || this._altitude;
    return this._altitude < 1200 ? 'LEO' : this._altitude > 22000 ? 'GEO' : 'MEO';
};



