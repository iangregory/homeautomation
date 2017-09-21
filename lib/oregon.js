/* 
 * vim: set ft=javascript:
 *
 * Driver for Oregon Scientific temperature/humidity monitoring and OWL-compatible power monitoring devices 
 *  on the HAP platform
 * 
 * Sensor configuration taken from config.json in the current working directory
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * @license ISC
 * 
 */

/* jshint latedef:nofunc */

'use strict';

// Variables 
var rfxcom_topic = 'devices/rfxcom/data';
var publish_topic_path = {
    temperature: 'events/temperature_sensor/',
    power: 'events/power_meter/'
};

/* Modules */
var rfxcom = require('rfxcom'), // We use the RFXCom module to decode messages from the MQTT topic    
    hautil = require('../lib/ha-util.js');

/* Sensor configuration */
var config = require('../config/config.json');

// Fake serial port to allow us to send data to the rfxcom module without it actually coming from an RFXTRX443
var DataSource = require('../lib/datasource.js');
var dataSource = new DataSource();

// Open a fake (virtual) RFXTRX
var rfxtrx = new rfxcom.RfxCom("/dev/ttyU0", {
    port: dataSource,
    debug: false
});
rfxtrx.open();

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('Orgeon Scientific sensor/OWL power meter driver started');
};

// Driver startup
Driver.prototype.run = function () {
    ha.subscribe(rfxcom_topic);
    
    // When a message arrives, send it to our virtual serial port to allow it to be decoded
    ha.on('message', function (topic, message) {
        dataSource.emit("data", JSON.parse(message));
    });
};

// Handle "temperature1" events
rfxtrx.on("th1", function (evt) {
    publishEvent('temperature', evt);
});

// Handle "temperature2" events
rfxtrx.on("th2", function (evt) {
    publishEvent('temperature', evt);
});

// Handle "elec3" events
rfxtrx.on("elec3", function (evt) {
    publishEvent('power', evt);
});


/**
 * Publishes a received event to the message bus
 * 
 * @param {String} type Type of message to publish (currently either 'temperature' or 'power'
 * @param {Object} evt The event as received from the message decoder in the RFXcom module
 */
function publishEvent(type, evt) {
    // Reject event if we can't identify the source device
    if (evt.id === undefined) {
        ha.error('Undefined event source ID for event', evt);
        return;
    }
    
    // Lookup the friendly name of the source from the config file
    var sensor = getSensorName(evt.id);
    if (sensor === undefined) {
        ha.error("Ignoring message for unknown device %s", evt.id);
        return;
    }
    
    // Publish the event 
    var message = {};
    if (type === 'temperature') {
        message = {
            temperature: evt.temperature.toString(),
            humidity: evt.humidity.toString(),
            battery: evt.batteryLevel.toString(),
            signal: evt.rssi.toString(),
            timestamp: hautil.toIsoString(new Date())
        };
    } else if (type === 'power') {
        message = {
            currentWatts: evt.power.toString(),
            timestamp: hautil.toIsoString(new Date())
        };
        if (evt.count === 0) {
          message.totalWatts = evt.energy.toString();
        }
    } else {
        ha.error('Unknown message type %s', type);
        return;
    }
    
    ha.publish(publish_topic_path[type] + sensor, message, { retain: true });
    
    ha.log('info', "%s:", sensor, evt);
}


/*
 * Lookup the name of a sensor from it's hardware ID
 * 
 * @param {String} id Hardware ID in hex
 * @returns {String} Friendly name of the sensor
 * 
 */
function getSensorName(id) {
    var sensor = '';
    if (config.sensors[id] !== undefined && config.sensors[id].name !== undefined) {
        sensor = config.sensors[id].name;
    }
    return sensor;
}

module.exports = new Driver();
