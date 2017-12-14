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
'use strict'

/* Modules */
var h = require('../lib/ha')
var util = require('util')
var path = require('path')
var isThere = require('is-there')
var merge = require('merge')

/* Variables */
var logLevel = 'info'
var libDir = path.resolve(path.dirname(require.main.filename) + '/../lib/')
var driverName, driver, driverId

/* Load configuration */
var config = require('../config/config.json')

/* Read command line arguments */
var args = require('yargs')
  .usage('Usage: $0 <DRIVER_NAME>')
  .demand(1)
  .example('$0 bar --driverid=foo1', 'Load driver "bar" with driverId "foo1"')
  .example('$0 bar --debug', 'Load driver "bar" in debug mode')
  .alias('d', 'debug')
  .boolean('d')
  .check(function (argv) {
    /* Validate requested driver library exists and provides the expected functionbs */
    driverName = argv._[0]

    if (!isThere(libDir + '/' + driverName + '.js')) {
      throw new Error(util.format('Error: %s.js does not exist as a driver library in %s', driverName, libDir))
    }

    /* Load the driver library */
    driver = require(libDir + '/' + driverName + '.js')

    /* Check that the driver defines an init() function */
    if (typeof driver.init !== 'function') {
      throw new Error(util.format('Error: %s.js does not define an init() function (function %s)', driverName, typeof driver.init))
    }

    return true
  })

// Set debug if requested
if (args.argv.d) {
  logLevel = 'debug'
}

// Check the driver ID has been provided, or generate one using the name of the application
if (args.argv.driverId !== undefined) {
  driverId = config.global.house_id + '-' + args.argv.driverId
} else {
  driverId = config.global.house_id + '-' + args.argv._[0]
}

/* Set up the home automation library */
var ha = new h({
  log_level: logLevel,
  mqtt_url: config.global.mqtt_url,
  driver_id: driverId,
  topic_prefix: config.global.house_id
})

ha.connect()

driver.init(ha, merge(args, config))

/* Handle ctrl-c */
process.on('SIGINT', function () {
  ha.warn('Interrupted - cleaning up and closing down')

  if (typeof driver.sigint === 'function') {
    ha.debug('Calling driver-specific handler')
    driver.sigint(function () {
      ha.close()
      process.exit()
    })
  } else {
    ha.close()
    process.exit()
  }
})

/* Handle break */
process.on('SIGHUP', function () {
  ha.warn('SIGHUP recieved')
  if (typeof driver.sighup === 'function') {
    driver.sighup()
  }
})

/* Connect to the message bus */
ha.once('connect', function () {
  ha.debug('Connected to the message bus...')

  driver.run()
})
