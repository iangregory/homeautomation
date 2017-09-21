/* 
 * Driver for LC Technology relay boards
 *
 */
var net = require('net');

// Settings
var port = 234;
var cmd_off = new Buffer("A00100A1", "hex");
var cmd_on = new Buffer("A00101A2", "hex");

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

/* Sensor configuration */
var config = require('../config/config.json');

// Driver setup
Driver.prototype.init = function (ha_local, args) {
  ha = ha_local;
  ha.info('LC Technology relay driver started');

  ha.on('message', function (topic, message, packet) {
    // Ignore clearing of retained topics
    if (message.toString() == "null") {
      return;
    }

    // Topic is 'events/switch/+/set' - i.e. a set command to a homeeasy device
    var splitTopic = topic.split('/');
    var deviceName = splitTopic[3];
    var device = config['lctech-relay-driver'].relays[deviceName];

    if (device === undefined) {
      ha.log('error', "Ignoring message \"%s\" for unknown device %s", message.toString(), deviceName);
      return;
    }

    if (message.toString().toLowerCase() === "on") {
      ha.log('info', 'Relay on command received for %s', deviceName);
      send(device, cmd_on);

      // Send a revertive
      ha.revertive('devices/relay/' + deviceName, { status: 'on' });

    } else if (message.toString().toLowerCase() === "off") {
      ha.log('info', 'Relay off command received for %s', deviceName);
      send(device, cmd_off);

      // Send a revertive
      ha.revertive('devices/relay/' + deviceName, { status: 'off'} );

    } else {
      ha.log('error', 'Invalid command %s, clearing topic', message.toString());
      ha.publish(splitTopic.slice(1).join('/'), null, { retain: true });
    }
  });
};

function send(device, msg) {
  // TCP connection to ESP
  var client = new net.Socket();

  client.on('end', () => {
    ha.log('error', 'esp8266 has disconnected');
  });

  client.on('close', function (err) {
    if (err) {
      ha.log('error', 'TCP socket closed due to transmission error');
    } else {
      ha.log('debug', 'TCP socket closed');
    }
  });

  client.on('error', function (e) {
    ha.log('error', e);
  });


  client.connect({ host: device.ip, port: port }, function () {
    ha.log('debug', 'TCP connection established');

    ha.log('debug', 'Sending \'0x%s\'', msg.toString('hex'));
    client.write(msg, function () {
      ha.log('info', ' Completed sending command to relay on %s', device.ip);
      client.destroy();
      client = null;    
    });
  });

};

Driver.prototype.run = function () {
  ha.subscribe('devices/relay/+/set');
};

module.exports = new Driver();
