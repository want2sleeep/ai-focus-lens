const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevelopment = argv.mode === 'development';
  
  return {
    entry: {
      'service-worker': './src/service-worker.ts',
      'content-script': './src/content-script.ts',
      'popup': './src/popup.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
      // Ensure compatibility with Chrome extension environment
      environment: {
        arrowFunction: false,
        bigIntLiteral: false,
        const: false,
        destructuring: false,
        dynamicImport: false,
        forOf: false,
        module: false
      }
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.json',
                transpileOnly: isDevelopment,
                compilerOptions: {
                  sourceMap: true,
                  // Ensure ES5 compatibility for older Chrome versions
                  target: isProduction ? 'ES2018' : 'ES2020'
                }
              }
            }
          ],
          exclude: /node_modules/
        },
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name].[hash:8][ext]'
          }
        }
      ]
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@types': path.resolve(__dirname, 'src/types'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@api': path.resolve(__dirname, 'src/api')
      }
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'src/manifest.json',
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              
              if (isProduction) {
                // Update version and optimize for production
                manifest.version = process.env.npm_package_version || manifest.version;
                
                // Remove development-specific permissions
                if (manifest.permissions) {
                  manifest.permissions = manifest.permissions.filter(
                    permission => !['tabs', 'debugger'].includes(permission)
                  );
                }
                
                // Optimize content security policy for production
                if (manifest.content_security_policy) {
                  manifest.content_security_policy.extension_pages = 
                    "script-src 'self'; object-src 'self'";
                }
              }
              
              return JSON.stringify(manifest, null, 2);
            }
          },
          {
            from: 'src/icons',
            to: 'icons',
            noErrorOnMissing: true
          },
          {
            from: 'README.md',
            to: 'README.md',
            noErrorOnMissing: true
          },
          {
            from: 'LICENSE',
            to: 'LICENSE',
            noErrorOnMissing: true
          }
        ]
      }),
      new HtmlWebpackPlugin({
        template: './src/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true
        } : false
      })
    ],
    optimization: {
      minimize: isProduction,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            enforce: true
          }
        }
      }
    },
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    mode: argv.mode || 'development',
    
    // Performance optimizations
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },
    
    // Development server configuration (for testing)
    devServer: isDevelopment ? {
      static: {
        directory: path.join(__dirname, 'dist')
      },
      compress: true,
      port: 9000,
      hot: false,
      liveReload: false
    } : undefined,
    
    // Watch options for development
    watchOptions: isDevelopment ? {
      ignored: /node_modules/,
      poll: 1000
    } : undefined
  };
};