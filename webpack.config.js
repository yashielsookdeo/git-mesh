const path = require('path');

const extensionConfig = {
  target: 'node',
  entry: './src/extension/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out', 'extension'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json'
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  devtool: 'source-map',
  performance: {
    hints: false
  }
};

const webviewConfig = {
  entry: './src/webview/src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'out', 'webview'),
    filename: 'bundle.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webview.json'
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'source-map',
  performance: {
    hints: false
  }
};

module.exports = [extensionConfig, webviewConfig];
