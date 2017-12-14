#!/usr/bin/env node
/* 
 * vim: set ft=javascript:
 *
 * Nest driver
 * 
 * @version 0.0.l
 * @author Ian Gregory
 * 
 */
'use strict'

var hautil = require('../lib/ha-util.js')
var diff = require('object-diff')

// Wrapper for exported module
var Driver = function () { }

// Holder for reference to ha framework
var ha = {}, config = {}, thermostat, ambientTemp, targetTemp, humidity, timer, status, lastObject = {}

var publishTopicPath = {
  temperature: 'events/temperature_sensor/'
}

const EventSource = require('eventsource')
const NEST_API_URL = 'https://developer-api.nest.com'

/**
 * Start REST streaming device events given a Nest token.
 */
function startStreaming (token) {
  var headers = {
    'Authorization': 'Bearer ' + token
  }
  var source = new EventSource(NEST_API_URL, {'headers': headers})

  source.addEventListener('put', function (event) {
    ha.debug('Message received from Nest API')
    var data = JSON.parse(event.data)
    thermostat = Object.keys(data.data.devices.thermostats)[0]

    ha.info(JSON.stringify(diff(lastObject, data.data.devices.thermostats[thermostat]), null, 2))
    lastObject = data.data.devices.thermostats[thermostat]

    ambientTemp = data.data.devices.thermostats[thermostat].ambient_temperature_c
    humidity = data.data.devices.thermostats[thermostat].humidity
    targetTemp = data.data.devices.thermostats[thermostat].target_temperature_c

    if (data.data.devices.thermostats[thermostat].hvac_state !== status) {
      ha.info('Status changed to: ' + data.data.devices.thermostats[thermostat].hvac_state)
      status = data.data.devices.thermostats[thermostat].hvac_state
      ha.publish('events/heating/' + config.nest.thermostats[thermostat].name, { status: status, timestamp: hautil.toIsoString(new Date()) }, { retain: true })
    }

    if (data.data.devices.thermostats[thermostat].hvac_mode === 'eco') {
      targetTemp = data.data.devices.thermostats[thermostat].eco_temperature_low_c
    }

    sendMessage()
  })

  function sendMessage () {
    if (timer) {
      clearTimeout(timer)
    }
    var message = {
      temperature: ambientTemp.toString(),
      humidity: humidity.toString(),
      timestamp: hautil.toIsoString(new Date())
    }

    ha.publish(publishTopicPath['temperature'] + config.nest.thermostats[thermostat].name, message, { retain: true })

    message = {
      temperature: targetTemp.toString(),
      timestamp: hautil.toIsoString(new Date())
    }

    ha.publish(publishTopicPath['temperature'] + config.nest.thermostats[thermostat].name + '_target', message, { retain: true })

    timer = setTimeout(sendMessage, 30 * 1000)
  };

  source.addEventListener('open', function (event) {
    ha.info('Connection opened!')
  })

  source.addEventListener('auth_revoked', function (event) {
    ha.info('Authentication token was revoked.')
    // Re-authenticate your user here.
  })

  source.addEventListener('error', function (event) {
    if (event.readyState === EventSource.CLOSED) {
      ha.error('Connection was closed!' + JSON.stringify(event))
    } else {
      ha.error('An unknown error occurred: ' + JSON.stringify(event))
    }
  }, false)
}

// Driver setup
Driver.prototype.init = function (haLocal, args) {
  ha = haLocal
  config = args
  ha.info('Nest driver started')
}

Driver.prototype.run = function () {
  startStreaming(config.nest.token)
}

module.exports = new Driver()
