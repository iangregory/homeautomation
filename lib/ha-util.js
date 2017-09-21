/*
 * Convert a Date to an ISO formatted string
 * 
 * @param {Date} d Date to convert
 * @returns {String} Formatted date string
 * 
 */
module.exports = {
    
    toIsoString: function (d) {
        function padZeros(value, desiredStringLength) {
            var num = value + "";
            while (num.length < desiredStringLength) {
                num = "0" + num;
            }
            return num;
        }
        
        return d.getUTCFullYear() + '-' + padZeros(d.getUTCMonth() + 1, 2) + '-' + padZeros(d.getUTCDate(), 2) + 'T' + padZeros(d.getUTCHours(), 2) + ':' + padZeros(d.getUTCMinutes(), 2) + ':' + padZeros(d.getUTCSeconds(), 2) + '.' + padZeros(d.getUTCMilliseconds(), 3) + 'Z';
    }

};