/*
 * Driver for HomeEasy devices on the HAP platform
 *
 * Supports decoding of the following protocols:
 *   X10, ARC, ELRO, Waveman, EMW200, IMPULS, RisingSun, Philips, Energenie, GDR2  (via RFXcom Lighting1)
 *    AC, HomeEasy EU, ANSLUT, Kambrook (via RFXcom Lighting2)
 *
 * Sensor configuration taken from config.json in the current working directory
 *
 * @author Ian Gregory
 * @license ISC
 *
 */

/* jshint latedef:nofunc */
'use strict';

/* Variables */
var rfxcom_topic = 'devices/rfxcom/data';
var publish_topic_path = {
    lighting: 'events/lighting/',
};

var last_level = {};

/* Modules */
var rfxcom = require('rfxcom'), hautil = require('../lib/ha-util.js');

/* Sensor configuration */
var config = require('../config/config.json');

// Fake serial port to allow us to send data to the rfxcom module without it actually coming from an RFXTRX443
var DataSource = require('../lib/datasource.js');
var dataSource = new DataSource();
var rfxtrx = new rfxcom.RfxCom("/dev/ttyU0", { port: dataSource, debug: false });
rfxtrx.open();

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('HomeEasy driver initialised');

    // when a message arrives, do something with it
    ha.on('message', function (topic, message, packet) {
        // FIXME - house code is hardcoded
        if (topic === config.global.house_id + '/' + rfxcom_topic) {
            // ha.log('debug', "Data from rfxcom: %s", rfxtrx.dumpHex(JSON.parse(message)).toString());

            // When a message arrives, send it to our virtual serial port to allow it to be decoded
            dataSource.emit("data", JSON.parse(message));
        } else {

            // Ignore clearing of retained topics
            if (message.toString() == "null") {
                return;
            }

            // Topic is 'events/switch/+/set' - i.e. a set command to a homeeasy device
            var splitTopic = topic.split('/');
            var deviceId = getSensorId(splitTopic[3]);

            if (deviceId === '') {
                ha.log('error', "Ignoring message for unknown device %s (%s)", deviceId, message);
                return;
            }

            var deviceObject = getSensorObjectById(deviceId);
            if (packet.retain) {
                ha.log('info', "Clearing retained command for device %s (%s)", deviceObject.name, message);

                ha.publish(splitTopic.slice(1).join('/'), null, {retain: true});
                return;
            }

            // Handle the message appropriately depending on whether the device supports dimming or is a simple switch
            var command = '', value = '', status = '';
            if (message.toString().toLowerCase() == "on") {
                // Simple "ON" command"
                // Dim causes a nice fade but isn't supported by plain switches
                if (deviceObject.dimming) {
                  command = 'dim';
                } else {
                  command = 'on';
                }
                value = 15;
                status = 'on';
            } else if (message.toString().toLowerCase() == "off" || message.toString() == "0") {
                // Simple "OFF" command or dim command with zero level
                command = 'off';
                value = '0';
                status = 'off';
            } else if (isValidDimCommand(message.toString())) {
                command = 'dim';
                value = parseInt(message.toString());
                status = 'on';
            } else {
              ha.log('error', 'Invalid command %s for device %s, clearing topic', message.toString(), deviceObject.name);
              ha.publish(splitTopic.slice(1).join('/'), null, {retain: true});
            }
            // Store the level
            last_level[deviceObject.name] = value;

            ha.log('info', "Setting status of device %s to %s (level: %s)", deviceObject.name, command, value);

            // Send command to rfxcom to change the status of the device
            ha.publish('events/rfxcom/lighting1/transmit', { device: deviceId, command: command, value: value });

            // Send a revertive to the bus to indicate the state has changed
            // FIXME: We should only do this once we've seen an ACK from rfxcom
            ha.publish(publish_topic_path['lighting'] + deviceObject.name,
            {
                status: status,
                level: value,
                timestamp: hautil.toIsoString(new Date())
            },
            { retain: true });

            ha.log('info', "Revertive sent. %s: %s (level %s)",  deviceObject.name, status, value);
        }
    });
}

Driver.prototype.run = function () {
    // Subscribe to messages from RFXCom and topics with instructions on changing device states
    ha.subscribe([rfxcom_topic, 'events/switch/+/set']);

    rfxtrx.on("lighting1", function (evt) {
        publishEvent('lighting', evt);
    });

    rfxtrx.on("lighting2", function (evt) {
        publishEvent('lighting', evt);
    });
}

/**
 * Publishes a received event to the message bus
 *
 * @param {String} type Type of message to publish
 * @param {Object} evt The event as received from the message decoder in the RFXcom module
 */
function publishEvent(type, evt) {

    // Reject event if we can't identify the source device
    if (evt.id === undefined) {
        ha.error('Undefined event source ID for event', evt);
        return;
    }

    // Lookup the friendly name of the source from the config file
    var sensor = getSensorObjectById(evt.id + '-' + evt.unitcode);
    if (sensor.name === '') {
        ha.error("Ignoring message for unknown device %s-%s", evt.id, evt.unitcode);
        return;
    }

    // Reject event if key parameters are not defined
    if (evt.id === undefined || evt.command === undefined) {
        ha.log('error', "Corrupt message for device %s: %s", sensor.name, evt.command);
        return;
    }

    // We only expect lighting events
    if (type !== 'lighting') {
        ha.error('Unknown message type %s', type);
        return;
    }
    var sensors = [];

    // Handle group messages
    var re = /Group\s(.+)/;
    var group_action = re.exec(evt.command);
    if (group_action) {
        for (var key in config.switches) {
            if (config.switches[key].group === sensor.group) {
                sensors.push(config.switches[key]);
            }
            evt.command = group_action[1];
        }
        ha.info("Group %s has been changed to %s", sensor.group, group_action[1]);
    } else {
        sensors.push(sensor);
    }

    var value = undefined;
    sensors.forEach(function (sensor) {

        // Send a status. Treat the "On" command as restoring the last known level
        if (evt.command.toLowerCase() == "off") {
            value = 0;
        } else {
            value = last_level[sensor.name];
        }

        // Publish the event
        ha.publish(
            publish_topic_path[type] + sensor.name,
            {
                status: evt.command,
                level: value,
                timestamp: hautil.toIsoString(new Date())
            },
            { retain: true });

        ha.log('info', "Device %s has been set to %s via RF remote (level: %s)", sensor.name, evt.command, value);
    });
}

/*
 * Lookup the a sensor from it's hardware ID
 *
 * @param {String} id Hardware ID in hex
 * @returns {String} Friendly name of the sensor
 *
 */
function getSensorObjectById(id) {
    var sensor = '';
    if (config.switches[id] !== undefined && config.switches[id].name !== undefined) {
        sensor = config.switches[id];
    }
    return sensor;
}

/*
 * Lookup the hardware ID of a sensor from it's name
 *
 * @param {String} name Friendly name of the sensor
 * @returns {String} Hardware ID in hex
 *
 */
function getSensorId(name) {
    for (var id in config.switches) {
        if (config.switches[id].name === name) {
            return id;
        }
    }
    return '';
}

/*
 * Confirm a string contains a valid dim value, i.e. a number between 0 and 15
 *
 * @param {String} string The value to parse
 * @returns {bool} Whether the received value is valid
 *
 */
function isValidDimCommand(string) {
  if (!isNaN(string)) {
    var val = parseInt(string);
    return val >= 0 && val <= 15;
  }
  return false;
}


module.exports = new Driver();

