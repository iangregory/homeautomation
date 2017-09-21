#!/usr/bin/env node
/* 
 * Pseudo driver for HAP which exposes the latest value of matching MQTT topics as a HTTP REST API
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * @license ISC
 * 
 */
'use strict';

/* Modules */
var http = require('http');

/* Local data cache */
var latestReading = {};

// Local data cache
var latestReading = {};

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('API driver started');
};

// Start driver
Driver.prototype.run = function () {
    ha.subscribe('events/+/+');
    
    ha.on('message', function (topic, message) {
      try {
        message = JSON.parse(message);
      } catch (e) {
        ha.error("Error parsing message");
      }
        var topicsplit = topic.split(/\//);
        topicsplit.shift();
        if (topicsplit[1] === 'temperature_sensor') {
            saveReading(topicsplit[2], 'temperature', message.temperature);
            saveReading(topicsplit[2], 'humidity', message.humidity);
        } else if (topicsplit[1] === 'power_meter') {
            saveReading(topicsplit[2], 'temperature', message.temperature);
            saveReading(topicsplit[2], 'humidity', message.humidity);
        }
    });
    
    ha.info('Listening for HTTP requests on port 5050...');

};

function saveReading(device, measurement, value) {
    if (latestReading[device] === undefined) {
        latestReading[device] = {};
    }
    
    if (latestReading[device][measurement] !== value) {
        latestReading[device][measurement] = value;
    }
}

http.createServer(function (req, res) {
    if (req === undefined) {
        ha.error('req is undefined');
        return;
    }
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write(JSON.stringify(latestReading, null, 4));
    ha.log('info', 'Responding to HTTP request from %s', ip);
    ha.debug('Response data: %s', JSON.stringify(latestReading));
    res.end();
}).listen(5050);

module.exports = new Driver();

