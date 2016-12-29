var webpack = require('webpack');
var configuration = require('./../webpack.config.js');

webpack(configuration, report);

//private
function report(err, stats) {
    console.log('Error:', err);
    console.log('Stats:', stats);
}
