/* 
 * xmas_auto.js
 *
 * Driver for automatically switching christmas lights on/off
 *
 * Turns lights on <delay_minutes> mins after darkness, if darkness happens between
 * <earliest_hour> and <latest_hour>
 *
 * As fallback, turns lights on at time_on as well
 *
 * Turns lights off at <time_off>
 *
 */
var cronJob = require('cron').CronJob;

// Settings
var delay_minutes = 30;
var daylight_sensor = 'events/lighting/external_daylight';
var outdoor_lights = 'events/salvo/outdoor_christmas_lights';
var earliest_hour = 15;
var latest_hour = 22;
var time_on = '00 30 16 * * *'; // Every day at 16:30pm
var time_off = '00 06 22 * * *'; // Every day at 22:06pm 



// Wrapper for exported module
var Driver = function () { };

// Holder for reference to ha framework
var ha = {};

// Driver setup
Driver.prototype.init = function (ha_local, args) {
  ha = ha_local;
  ha.info('Christmas Lights driver started');

  // subscribe to the dusk event 
  ha.on('message', function (topic, message, packet) {
    if (message == 'Off') {
      ha.info('Dawn reached');
      return;
    }

    // Check the time
    var current_hour = new Date().getHours();

    // If it's dark, but not late, don't turn the lights on
    if (current_hour <= earliest_hour || current_hour >= latest_hour) {
      ha.info('Dusk reached at unusual time of day - ignoring');
      return;
    }

    // Turn the lights on after a pre-defined delay
    ha.info('Dusk reached. Starting %d minute timer', delay_minutes);

    setTimeout(function () {
      ha.info('Timer reached, turning on lights');

      ha.publish(outdoor_lights, 'on', { retain: true });
    }, delay_minutes * 60 * 1000);
  });
};

Driver.prototype.run = function () {
  ha.subscribe(daylight_sensor);

  // Timed event - turn on lights even if the dusk event has not fired
  var on_job = new cronJob(time_on, function () {
    ha.info('Timer reached, turning on lights');
    ha.publish(outdoor_lights, 'on', { retain: true });
  });
  on_job.start();

  // Timed event - turn off lights
  var off_job = new cronJob(time_off, function () {
    ha.info('Timer reached, turning off lights');
    ha.publish(outdoor_lights, 'off', { retain: true });
  });
  off_job.start();
};

module.exports = new Driver();
