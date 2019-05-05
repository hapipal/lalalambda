# lalalambda
serverless hapi

[![Build Status](https://travis-ci.org/devinivy/lalalambda.svg?branch=master)](https://travis-ci.org/devinivy/lalalambda) [![Coverage Status](https://coveralls.io/repos/devinivy/lalalambda/badge.svg?branch=master&service=github)](https://coveralls.io/github/devinivy/lalalambda?branch=master)

## Installation
Lalalambda is one package that doubles as 1. a hapi plugin and 2. a [Serverless framework](https://github.com/serverless/serverless) plugin.  These two plugins work together to allow you to define lambda functions in hapi that can be packaged and deployed using the Serverless framework to AWS.  A basic installation has just a few steps.

1. Install the lalalambda and serverless packages from npm.

   ```sh
   npm install lalalambda
   npm install --save-dev serverless
   ```

2. Setup a Serverless [config](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/) in the root of your project including lalalambda as a plugin.

   ```yaml
   # serverless.yml
   service: my-service

   provider:
     name: aws
     runtime: nodejs8.10

   plugins:
     - lalalambda
   ```

3. Register lalalambda to your hapi server.

   > If you're using [the pal boilerplate](https://github.com/hapipal/boilerplate) then simply add lalalambda to your [manifest's](https://github.com/hapipal/boilerplate/blob/pal/server/manifest.js) `plugins` section.

   ```js
   await server.register(require('lalalambda'));
   ```

4. Ensure `server.js` or `server/index.js` exports a function named `deployment` that returns your configured hapi server.

   > If you're using [the pal boilerplate](https://github.com/hapipal/boilerplate) then you can skip this step!

   Below is a very simple example of boilerplate code to configure a hapi server, and is not necessarily "production-ready."  For a more complete setup, consider using [the pal boilerplate](https://github.com/hapipal/boilerplate), or check-out its approach as seen [here](https://github.com/hapipal/boilerplate/blob/pal/server/index.js).

   ```js
   // server.js

   'use strict';

   const Hapi = require('hapi');
   const Lalalambda = require('lalalambda');
   const AppPlugin = require('./app');

   // lalalambda will look for and use exports.deployment()
   // as defined below to obtain a hapi server

   exports.deployment = async (start) => {

       const server = Hapi.server();

       await server.register(Lalalambda);

       // Assuming your application (its routes, lambdas, etc.) live in a plugin
       await server.register(AppPlugin);

       if (start) {
           await server.start();
           console.log(`Server started at ${server.info.uri}`);
       }

       return server;
   };

   // Start the server only when this file is
   // run directly from the CLI, i.e. "node ./server"

   if (!module.parent) {
       exports.deployment(true);
   }
   ```

Now you have the full expressiveness of the Serverless and hapi frameworks at your fingertips!

The rest of your setup depends on however you want to further configure Serverless and hapi.  We suggest checking-out the [Serverless AWS Guide](https://serverless.com/framework/docs/providers/aws/), continuing by taking a peek at the [Credentials](https://serverless.com/framework/docs/providers/aws/guide/credentials/) section so that the Serverless CLI will have access to deploy to your AWS account.  Going forward you can invoke the Serverless CLI for deployment, etc.:

```sh
npx serverless --help
# or, shorthand:
npx sls --help
```
