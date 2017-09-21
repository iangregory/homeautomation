var events = require("events"),
    util = require("util");

var DataSource = function () {
    var self = this;
    events.EventEmitter.call(this);
};
util.inherits(DataSource, events.EventEmitter);

module.exports = DataSource;

