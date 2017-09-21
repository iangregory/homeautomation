/* 
 * vim: set ft=javascript:
 *
 * Captain's log. Displays home automation MQTT messages on the console
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * 
 */

/* jshint latedef:nofunc */
'use strict';

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('Caplog started');

    /* Log MQTT messages received */
    ha.on('message', function (topic, message, packet) {
        ha.info('%s: %s', topic, message.toString());
    });

};

Driver.prototype.run = function () {
    /* Once connected, subscribe to all topics */
    ha.subscribe('#');
};

module.exports = new Driver();
