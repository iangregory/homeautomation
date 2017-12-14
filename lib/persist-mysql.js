#!/usr/bin/env node
/* 
 * Extract data from an MQTT topic and save it to a sql database
 * 
 * Currently supports temperature and humidity data from topic 'events/temperature_sensor/#'
 *  and power information from topic 'events/power_meter/#'
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * @license ISC
 * 
 */

/* jshint latedef:nofunc */

/* Modules */
var mysql = require('mysql'),
    config = require('../config/config.json'),
    Decimal = require('decimal.js-light');

/* Variables */
var subscribe_topics = ['events/temperature_sensor/#', 'events/power_meter/#', 'events/heating/#'];
var measurements_to_record = ['temperature', 'humidity', 'currentWatts', 'totalWatts'];
var cache_flush_interval = 10;

// Local data cache
var latestReading = {};
var skipCount = {};

/* Create a database connection pool */
var pool = mysql.createPool({
    host: config.persist_mysql.host,
    user: config.persist_mysql.user,
    password: config.persist_mysql.pass,
    database: config.persist_mysql.db
});

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Handle ctrl-c
Driver.prototype.sigint = function (callback) {
    ha.warn('Closing database connections');
    if (pool !== undefined) {
        pool.end(function (err) {
            // all connections in the sql connection pool have ended
            return callback(err);
        });
    }
};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('Database persistence driver started');
};

// Driver startup
Driver.prototype.run = function () {
    ha.subscribe(subscribe_topics);
    
    ha.on('message', function (topic, message) {
        try {
          message = JSON.parse(message);
        } catch (e) {
          // If the message isn't JSON, just ignore it
          return;
        }
        var topicsplit = topic.split(/\//);
        topicsplit.shift();
        ha.debug('Processing %s message: ', topicsplit[1], message);
        if (topicsplit[1] == 'temperature_sensor') {
            updateCache('weather', topicsplit[2], 'temperature', message.temperature, 0.1, 20);
            updateCache('weather', topicsplit[2], 'humidity', message.humidity, 1, 20);
            updateCache('weather', topicsplit[2], 'battery', message.battery);
            updateCache('weather', topicsplit[2], 'signal', message.signal);
            updateCache('weather', topicsplit[2], 'timestamp', message.timestamp);
        }
        if (topicsplit[1] == 'power_meter') {
            if (typeof message.currentWatts !== 'undefined' && message.currentWatts !== 0) { 
                // Message from OWL driver
                ha.debug('Updating cache with OWL value %s', message.currentWatts);
                updateCache('power', topicsplit[2], 'currentWatts', message.currentWatts, 5, 5);
                updateCache('power', topicsplit[2], 'timestamp', message.timestamp);
            } else if (typeof message.Power!== 'undefined' && message.Power !== 0) {
                // Message from Sonoff POW
                ha.debug('Updating cache with Sonoff value %s', message.Power);
                updateCache('power', topicsplit[2], 'currentWatts', message.Power, 2, 5);
                updateCache('power', topicsplit[2], 'timestamp', message.Time);
            }
        }
        if (topicsplit[1] == 'heating') {
            data = {
               timestamp: message.timestamp,
							 tags : 'heating',
               value: 'heat_' + message.status,
            };

           pool.getConnection(function (err, conn) {
               if (err) { ha.warn('Database error:', err); return; }
               conn.query("INSERT INTO events SET ?", data, function (err) {
                   conn.release(); // always put connection back in pool after query
                   if (err) {
                       ha.warn('Database error: ' + err + '(Query: ' + this.sql + ')');
                       return;
                   }
							 });
					 });

        }
    });
};

/**
 * Save any 'dirty' measurements to the database
 */
setInterval(function () {
    Object.keys(latestReading).forEach(function (key) {
        var type = key;
        Object.keys(latestReading[key]).forEach(function (key) {
            
            var data = {};
            var item = latestReading[type][key];
            if (item.state === 'dirty') {
                ha.debug("Saving", key, item);
                
                // Format data for inserting into the database
                
                if (type == 'weather') {
                    data = {
                        sensor_id: key,
                        datetime: item.timestamp,
                        temperature: item.temperature,
                        humidity: item.humidity,
                        battery: item.battery,
                        signal_level: item.signal,
                    };
                } else if (type == 'power') {
                    data = {
                        sensor_id: key,
                        datetime: item.timestamp,
                        power: item.currentWatts,
                    };
                } else {
                    return;
                }
                
                latestReading[type][key].state = 'saving';
                
                pool.getConnection(function (err, conn) {
                    if (err) { ha.warn('Database error:', err); return; }
                    conn.query("INSERT INTO " + type + " SET ?", data, function (err) {
                        conn.release(); // always put connection back in pool after query
                        if (err) {
                            latestReading[type][key].state = 'dirty';
                            ha.warn('Database error: ' + err + '(Query: ' + this.sql + ')');
                            return;
                        }
                        
                        latestReading[type][key].state = 'saved';
                        ha.debug("Saved", key);
                    });
                });
            }
        });
    });
}, cache_flush_interval * 1000);

/**
 * Check to see if a measurement has changed, store it in the local cache and mark the cache as dirty
 *
 * @param  {string} device      The source of the measurement
 * @param  {string} measurement The dimension being measured
 * @param  {string} value       The value of the measurement
 * @param  {string} min_change  The minimum change in the value to persist
 */
function updateCache(type, device, measurement, value, min_change, max_skipcount) {
    // Set max_skipcount = 0 if undefined
    max_skipcount += 0;

    // Deal with null measurements
    if (latestReading[type] === undefined) {
        latestReading[type] = {};
    }
    
    if (latestReading[type][device] === undefined) {
        latestReading[type][device] = {};
    }
    
        // Mark the cache as dirty if a measurement that we care about has changed
        if ((measurements_to_record.indexOf(measurement) !== -1) && (latestReading[type][device][measurement] !== undefined)) {
            
            // Is the change greater than min_change?
            if (min_change !== undefined && (new Decimal(latestReading[type][device][measurement]).minus(value).absoluteValue().lt(min_change)) && skipCount[type + '-' + device + '-' + measurement] < max_skipcount) {
              skipCount[type + '-' + device + '-' + measurement]++;
              ha.info(device + ":" + measurement + ": " + latestReading[type][device][measurement] + " -> " + value + " (skipped, delta too small " + skipCount[type + '-' + device + '-' + measurement] + "/" + max_skipcount + ")");
              return;   
            }

            latestReading[type][device].state = 'dirty';
            ha.info(device + ":" + measurement + ": " + latestReading[type][device][measurement] + " -> " + value);
        }
        
        // Save the measurement to the cache
        latestReading[type][device][measurement] = value;
        skipCount[type + '-' + device + '-' + measurement] = 0;
}

module.exports = new Driver();
