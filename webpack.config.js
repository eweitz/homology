const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const babelJest = require('babel-jest');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'homology.min.js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist',
    libraryTarget: 'umd',
    umdNamedDefine: true,
    publicPath: '/dist',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }

    ]
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: (
        'Homology.js, version ' + version + '.  ' +
        'Developed by Eric Weitz.  https://github.com/eweitz/homology.  ' +
        'Public domain (CC0 1.0).'
      ),
      entryOnly: true
    })
  ]
};
