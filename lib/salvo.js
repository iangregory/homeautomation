/* 
 * salvo.js
 *
 */
/* jshint latedef:nofunc */
'use strict';

/* Configuration */
var config = require('../config/config.json'),
    hautil = require('../lib/ha-util.js');

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
  ha = ha_local;
  ha.info('Salvo driver started');

  ha.on('message', function (topic, message, packet) {
    ha.debug("Message \"%s\" received on %s", message, topic);

    var topic_without_prefix = topic.split('/').slice(1).join('/');
    ha.debug(topic_without_prefix);


    for (var value in config.salvos[topic_without_prefix]) {
      if (value == message) {
        ha.info("Matched salvo \"%s\" on topic %s", value, topic_without_prefix);

        // For each of the defined actions, set the MQTT topic to the desired value
        for (var action in config.salvos[topic_without_prefix][value].actions) {
          ha.debug("Action %s => \"%s\"", action, config.salvos[topic_without_prefix][value].actions[action].value);
          ha.publish(action, config.salvos[topic_without_prefix][value].actions[action].value);
        }

        // Send a revertive
        ha.publish(config.salvos[topic_without_prefix][value].revertive, { status: value, timestamp: hautil.toIsoString(new Date()) });
      }
    }
  });
};

Driver.prototype.run = function () {
  for (var key in config.salvos) {
    ha.subscribe(key);
  };

};

module.exports = new Driver();
