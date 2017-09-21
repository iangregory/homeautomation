/* 
 * vim: set ft=javascript:
 *
 * RFXTRF443 & RFXTRX443E driver for HAP
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * @license ISC
 * 
 */

'use strict';

/* Variables */
var protocol_data = [];
var protocol_list = [];

var types = {
    0x01: "status",
    0x02: "message",
    0x10: "lighting1",
    0x11: "lighting2",
    0x14: "lighting5",
    0x16: "chime",
    0x5a: "power",
    0x20: "security",
    0x50: "temp",
    0x52: "temphumidity",
    0x54: "tempbaro",
    0x5D: "weight",
    0x70: "rfxsensor",
    0x71: "rfxmeter"
};

/* Modules */
var rfxcom = require('rfxcom'), util = require('util');

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};
var argv;
var rfxtrx;
var lighting2;

/* Handle ctrl-c */
Driver.prototype.sigint = function (callback) {
    ha.warn('Flushing RFXcom');
    rfxtrx.flush();
    return callback();
};

/* Handle break */
Driver.prototype.sighup = function (callback) {
    ha.warn('HUP - reconnecting to rfxcom');
    rfxtrx.reset(function () {
        rfxtrx.getStatus();
        ha.info('Reset complete');
        return callback();
    });
};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
    ha = ha_local;
    ha.info('RFXCom driver started');

    argv = args
        .usage('Usage: $0 rfxcom --port=<serial port> --protcols=<enabled protocols>')
        .demand('port')
        .example('--port=/dev/ttyU0', 'connect to an RFXTRX433 using serial port /dev/ttyU0')
        .demand('protocols')
        .example('--protocols=OREGON,AC,ARC', 'enable decoding of the OREGON, AC and ARC protocols')
        .example('--driverid=rfxcom1', 'id of driver')
        .check(function (argv) {
            /* Validate supplied protocols are supported by RFXCom */
            var supported = rfxcom.protocols;
            argv.protocols.split(',').sort().forEach(function (item) {
                if (!(item in supported)) {
                    throw new Error(util.format("Error: %s is not supported by RFXCOM", item));
                }
                protocol_list.push(item);
                protocol_data.push(supported[item]);
            });
            return true;
        })
        .argv;

    /* Set up RFXCom */
    rfxtrx = new rfxcom.RfxCom(argv.port, {
        debug: (ha.log_level === 'debug')
    });

    lighting2 = new rfxcom.Lighting2(rfxtrx, rfxcom.lighting2.AC);
};

// Start driver
Driver.prototype.run = function () {
    rfxtrx.initialise(function (error) {
        if (error) {
            throw new Error("Unable to initialise the rfx device");
        }
    });

    rfxtrx.on("connectfailed", function () {
        ha.error("Failed to connect to RFXTRX at %s", argv.port); 
        ha.close();
        process.exit();
    });

    rfxtrx.on("connecting", function () {
        ha.info("Connecting to RFXTRX at %s", argv.port);
    });

    rfxtrx.on("ready", function () {
        ha.info("RFXTRX at %s ready", argv.port);

        ha.subscribe('events/rfxcom/lighting1/transmit');
    });

    rfxtrx.on("status", function (evt) {
        ha.info("RFXTRX status", { evt: evt });
        var evt_protocols = evt.enabledProtocols.sort();

        var is_same = (protocol_list.length == evt_protocols.length) && protocol_list.every(function(element, index) {
                return element === evt_protocols[index]; 
        });

        if (!is_same) {
            ha.info("Configuring for protocol(s) %s", argv.protocols);
            rfxtrx.enable(protocol_data);
        } else {
            ha.info("Configured protocol(s) are correct");
        }
    });

    rfxtrx.on("response", function (message) {
        ha.info(message);
    });

    rfxtrx.on("receive", function (data) {
        var type = types[data[1]];
        var hex = rfxtrx.dumpHex(data).toString();
        ha.log('info', '%s message received: %s', type, hex);

        ha.publish('devices/rfxcom/data', data);
    });

    rfxtrx.on("end", function () {
        ha.log('error', "Serial port closed");
        ha.close();
        process.exit();
    });

    ha.on('message', function (topic, message, packet) {
        var message = JSON.parse(message);
        var device = message.device.replace('-','/');

        ha.log('info', 'Setting %s to %s %s', device, message.command, message.value);

        try {
            switch (message.command) {
                case 'on':
                    lighting2.switchOn(device);
                    break;
                case 'off':
                    lighting2.switchOff(device);
                    break;
                default:
                    lighting2.setLevel(device, message.value);
            }
        } catch (e) {
            ha.log('error', 'Error when setting lighting level: %s', e.message);
        }
    });

};

module.exports = new Driver();
