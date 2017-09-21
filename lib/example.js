#!/usr/bin/env node
/* 
 * vim: set ft=javascript:
 *
 * Example driver that doesn't really do anything 
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * 
 */
'use strict';

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('Example driver started');
};

Driver.prototype.run = function () {
    
    /* Once connected, subscribe to all topics */
    ha.subscribe('/topic/to/subscribe.to', function (err, granted) {
        if (err) {
            ha.error('Subscription error', err);
            ha.close();
            process.exit(99);
        }
    });
    
    /* Log MQTT messages received */
    ha.on('message', function (topic, message, packet) {
        ha.log('info', '%s: %s', topic, message.toString());
    });
};

module.exports = new Driver();

