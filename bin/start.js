#!/usr/bin/env node
/* 
 * vim: set ft=javascript:
 *
 * Wrapper for HAP drivers 
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * @license ISC
 * 
 */
'use strict';

/* Modules */
var h = require('../lib/ha'),
    util = require('util'),
    path = require('path'),
    is_there = require('is-there'),
    merge = require('merge');

/* Variables */
var log_level = 'info';
var lib_dir = path.resolve(path.dirname(require.main.filename) + '/../lib/');
var driver_name, driver, driver_id;

/* Load configuration */
var config = require('../config/config.json');

/* Read command line arguments */
var args = require('yargs')
    .usage('Usage: $0 <DRIVER_NAME>')
    .demand(1)
    .example('$0 bar --driverid=foo1', 'Load driver "bar" with driver_id "foo1"')
    .example('$0 bar --debug', 'Load driver "bar" in debug mode')
    .alias('d', 'debug')
    .boolean('d')
    .check(function (argv) {
    /* Validate requested driver library exists and provides the expected functionbs */
    driver_name = argv._[0];
    
    if (!is_there(lib_dir + '/' + driver_name + '.js')) {
        throw new Error(util.format("Error: %s.js does not exist as a driver library in %s", driver_name, lib_dir));
    }
    
    /* Load the driver library */
    driver = require(lib_dir + '/' + driver_name + '.js');
    
    /* Check that the driver defines an init() function */
    if (typeof driver.init != 'function') {
        throw new Error(util.format("Error: %s.js does not define an init() function (function %s)", driver_name, typeof driver.init));
    }
    
    return true;
});

// Set debug if requested
if (args.argv.d) {
  log_level = 'debug';
}

// Check the driver ID has been provided, or generate one using the name of the application
if (args.argv.driver_id !== undefined) {
    driver_id = config.global.house_id + "-" + args.argv.driver_id;
} else {
    driver_id = config.global.house_id + "-" + args.argv._[0];
}

/* Set up the home automation library */
var ha = new h({
    log_level: log_level,
    mqtt_url: config.global.mqtt_url,
    driver_id: driver_id, 
    topic_prefix: config.global.house_id
});

ha.connect();

driver.init(ha, merge(args, config));

/* Handle ctrl-c */
process.on('SIGINT', function () {
    ha.warn('Interrupted - cleaning up and closing down');
    
    if (typeof driver.sigint === 'function') {
        ha.debug('Calling driver-specific handler');
        driver.sigint(function (err) {
            ha.close();
            process.exit();
        });
    } else {
        ha.close();
        process.exit();
    }
});

/* Handle break */
process.on('SIGHUP', function () {
    if (driver.sighup == 'function') driver.sighup();
});

/* Connect to the message bus */
ha.once('connect', function () {
    ha.debug('Connected to the message bus...');
    
    driver.run();
});


