#!/usr/bin/env node
/* 
 * vim: set ft=javascript:
 *
 * Driver to send data to Adafruit.IO. Currently hardcoded to temp/hum data
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * 
 */
'use strict';

var mqtt = require('mqtt');

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {}, args, adafruit_client;

// Driver setup
Driver.prototype.init = function (ha_local, args_local) {
    ha = ha_local;
    args = args_local;
};

Driver.prototype.run = function () {
    ha.info('Adafruit Driver started');
    
    adafruit_client = mqtt.connect({
        host: args.adafruit_driver.io_host,
        port: args.adafruit_driver.io_port,
        username: args.adafruit_driver.io_user,
        password: args.adafruit_driver.io_key,
        connectTimeout: 60 * 1000,
        keepalive: 3600
    });
    
    adafruit_client.on("error", function (err) {
        if (err) {
            ha.error("Error with connection to Adafruit MQTT server", err);
            ha.close();
            process.exit(99);
        };
    });

    ha.subscribe(['events/temperature_sensor/#', 'events/power_meter/power_meter'], function (err, granted) {
        if (err) {
            ha.error('Subscription error', err);
            ha.close();
            process.exit(99);
        }
    });
    
    /* Log MQTT messages received */
    ha.on('message', function (topic, message, packet) {
        ha.log('info', 'IN  %s: %s', topic, message.toString());
        var topicsplit = topic.split("/");
        topicsplit.shift();
        
        if (topicsplit[2] === "") return;

        if (topicsplit[1] === "temperature_sensor") {
            var send_topic = args.adafruit_driver.io_user + "/feeds/" + topicsplit[2] + "_temperature";        
            var value = JSON.parse(message).temperature;
            ha.log('info', 'OUT %s: %s', send_topic, value);
            adafruit_client.publish(send_topic, value);

            var send_topic = args.adafruit_driver.io_user + "/feeds/" + topicsplit[2] + "_humidity";
            var value = JSON.parse(message).humidity;
            ha.log('info', 'OUT %s: %s', send_topic, value);
            adafruit_client.publish(send_topic, value);

        } else if  (topicsplit[1] === "power_meter") {
            var send_topic = args.adafruit_driver.io_user + "/feeds/" + topicsplit[2] + "_power";        
            var value = JSON.parse(message).currentWatts;
            ha.log('info', 'OUT %s: %s', send_topic, value);
            adafruit_client.publish(send_topic, value);
        }

    });
};

module.exports = new Driver();

