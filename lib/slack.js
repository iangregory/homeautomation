/* 
 * Driver for Slack messages 
 *
 */
var Slack = require('slack-node');

// Settings
var webhookUri = "<uri>";

// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
  ha = ha_local;
  ha.info('Slack driver started');

  slack = new Slack();
  slack.setWebhook(webhookUri);

  ha.on('message', function (topic, message, packet) {
    // Ignore clearing of retained topics
    if (message.toString() == "null") {
      return;
    }

    try {
      message = JSON.parse(message);
    } catch (e) {
      ha.error("Message was not valid JSON: %s", message);
      ha.publish('notify/slack/output',"Message was not valid JSON");
      return;
    }

    ha.info("Posting message to %s", message.channel);

    slack.webhook({
      channel: message.channel,
      username: "mqttbot",
      text: message.text,
      icon_emoji: message.emoji

    }, function(err, response) {
      if (err) {
        ha.error("Error sending message: %s", response.response);
      } else {
        ha.info(response.response);
      }
      ha.publish('notify/slack/output', response.response);
    });
  });
};

Driver.prototype.run = function () {
  ha.subscribe('notify/slack');
};

module.exports = new Driver();
