/**
 * HAP core library
 * 
 * @author Ian Gregory
 * @license ISC
 * 
 */

/* Modules */
var util = require('util'),
    events = require('events'),
    mqtt = require('mqtt'),
    url = require('url'),
    logger = require('winston'),
    path = require('path'),
    hautil = require('../lib/ha-util.js');

module.exports = Ha;

function Ha(params) {
    var self = this;
    self.client = {};

    events.EventEmitter.call(this);

    // Check the URL of the MQTT server has been provided
    if (!params.mqtt_url) {
        throw new Error("HA MQTT broker url not defined");
    }
    self.mqtt_url = url.parse(params.mqtt_url);

    // If log level is not defined, assume "info"
    if (typeof params.log_level == "undefined") params.log_level = "info";

    // Should we add a logging handler for unhandled exceptions?
    if (!params.handle_exceptions) {
        params.handle_exceptions = true;
    }

    // Check the driver ID has been provided
    if (params.driver_id === undefined) {
        throw new Error("No driver_id defined");
    } else {
        self.driver_id = params.driver_id;
    }

    self.topic_prefix = params.topic_prefix || "";

    // Setup Logging
    logger.remove(logger.transports.Console);
    logger.add(logger.transports.Console, {
        timestamp: true,
        colorize: true,
        //prettyPrint: true,
        level: params.log_level,
        //handleExceptions: params.handle_exceptions,
        humanReadableUnhandledException: true,
        label: self.driver_id
    });

    logger.info('Initialising HA library, driver_id=\'%s\', log_level=\'%s\'', self.driver_id, params.log_level);

    this.close = function () {
        self.warn('Disconnecting from HA MQTT broker');
        self.client.end();
    };

    this.connect = function () {
        self.log('info', 'Connecting to HA MQTT broker at %s', self.mqtt_url.href);
        self.client = mqtt.connect(self.mqtt_url, {
            // protocolId: 'MQIsdp',       // Only required for older MQTT servers
            // protocolVersion: 3,
            clientId: self.driver_id,
            will: {
                topic: self.topic_prefix + '/system/status/' + self.driver_id,
                payload: JSON.stringify({ status: 'down', timestamp: hautil.toIsoString(new Date()) }),
                retain: true,
                qos: 0,
                clean: true
            }
        });

        self.client
            .on('connect', function (connack) {
                self.connected = true;
                self.info("Connected to HA MQTT broker");
                if (connack && connack.sessionPresent) {
                    self.info("Restored existing session");
                }
                self.emit('connect');
                self.publish('system/status/' + self.driver_id, { status: 'up', timestamp: hautil.toIsoString(new Date()) }, { retain: true });
            })
            .on('close', function () {
                // Event captured when the application closes the connection to the MQTT server intentionally
                self.error('HA MQTT broker connection closed');
            })
            .on('reconnect', function () {
                self.debug('HA MQTT broker connection reconnecting');
            })
            .on('offline', function () {
                // Event captured when the application loses the connection to the MQTT server unexpectedly
                self.debug('HA MQTT broker has gone offline, attempting to reconnect...');
            })
            .on('error', function (error) {
                self.error('HA MQTT broker error: %s', error);
                self.emit('connection_error', error);
            })
            .on('message', function (topic, message, packet) {
                self.debug("Received message", {
                    topic: topic,
                    message: message.toString(),
                });
                self.emit('message', topic, message, packet);
            });
    };


    /**
     * subscribe - subscribe to <topic>
     *
     * @param {String} topic - topic(s) to subscribe to
     * @param {Object} [opts] - optional subscription options, includes:
     *    {Number} qos - subscribe qos level
     * @param {Function} [callback] - function(err, granted){} where:
     *    {Error} err - subscription error (none at the moment!)
     *    {Array} granted - array of {topic: 't', qos: 0}     
     * @api public
     * @example client.subscribe('topic');
     * @example client.subscribe('topic', {qos: 1});
     * @example client.subscribe({'topic': 0, 'topic2': 1}, console.log);
     * @example client.subscribe('topic', console.log);
     */
    this.subscribe = function () {
        var
            args = Array.prototype.slice.call(arguments),
            topic_string = args.shift(),
            callback = args.pop(),
            opts = args.pop();

        if (topic_string instanceof Array) {
            topic =
                topic_string.map(function (el) {
                    return self.topic_prefix + '/' + el;
                });
        } else {
            topic = self.topic_prefix + '/' + topic_string;
        }

        self.debug("Topics to subscribe", { topics: topic });

        // If the second parameter is not a function, then the caller has missed the optional opts parameter. 
        // So use the second parameter as opts instead of the callback
        if ('function' !== typeof callback) {
            callback = function (err, granted) {
                if (err) {
                    self.err(err);
                }
                else {
                    self.debug('Successfully subscribed to ', { granted: granted });
                }
            };
        }

        self.debug("Subscribing to topic", {
            topic: topic,
            opts: opts,
            callback: callback
        });
        self.client.subscribe(topic, opts, callback);
    };

    this.publish = function (topic, payload, ops, callback) {
        topic = self.topic_prefix + "/" + topic;

        // If the payload isn't a string, convert it to one using JSON encoding
        if (typeof payload !== 'string') {
          payload = JSON.stringify(payload);
        }

        self.debug("Publishing mesage", { topic: topic, payload: payload, ops: ops });

        self.client.publish(topic.toString(), payload, ops, callback);
    };

    this.publishRaw = function (topic, payload, ops, callback) {
        topic = self.topic_prefix + "/" + topic;

        self.debug("Publishing mesage", { topic: topic, payload: payload, ops: ops });

        self.client.publish(topic.toString(), payload, ops, callback);
    };

    this.revertive = function (topic, payload, callback) {
        topic = self.topic_prefix + "/" + topic;

        // If the payload isn't a object, throw an error
        if (typeof payload !== 'object') {
          throw new Error("Revertive payload must be an object");
        }

        payload.timestamp = hautil.toIsoString(new Date());

        self.debug("Publishing revertive", { topic: topic, payload: payload });

        self.client.publish(topic.toString(), JSON.stringify(payload), { retain: true }, callback);
    };

    /*
     * Helper functions to allow drivers to log without importing winston themselves
     */
    this.log = logger.log;
    this.info = logger.info;
    this.warn = logger.warn;
    this.error = logger.error;
    this.debug = logger.debug;

    this.log_level = params.log_level;
}

util.inherits(Ha, events.EventEmitter);


