# lalalambda
Serverless functions powered by hapijs

[![Build Status](https://travis-ci.org/hapipal/lalalambda.svg?branch=master)](https://travis-ci.org/hapipal/lalalambda) [![Coverage Status](https://coveralls.io/repos/hapipal/lalalambda/badge.svg?branch=master&service=github)](https://coveralls.io/github/hapipal/lalalambda?branch=master)

Lead Maintainer - [Devin Ivy](https://github.com/devinivy)

## Usage
> See also the [API Reference](API.md)
>
> **Note**
>
> Lalalambda is intended for use with hapi v17+ and nodejs v8+.  Currently only deployments to [AWS Lambda](https://aws.amazon.com/lambda/) are supported, but we are open to [expand](https://github.com/hapipal/lalalambda/issues/1) [support](https://github.com/hapipal/lalalambda/issues/2) with your help!
>
> You can skip down the page if you're looking for [installation instructions](#installation).

Lalalambda offers three core features integrating [hapi](https://hapijs.com) with the [Serverless framework](https://github.com/serverless/serverless):

1. :mount_fuji: The ability to deploy an entire hapi server as a lambda function.

2. :sunrise_over_mountains: The ability to deploy individual hapi routes as lambda functions.

3. :sunrise: The ability to deploy arbitrary lambda functions triggered by cloud events, authored similarly to how you'd create a standard hapi route.

Let's take a quick look at a code example for each of these features.

### Examples

#### Lambda-ify an entire server
##### `server.js`
```js
'use strict';

const Hapi = require('@hapi/hapi');
const Lalalambda = require('lalalambda');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register({
        plugin: Lalalambda,
        options: {
            lambdaify: true // Creates a lambda named "server" by default
        }
    });

    server.route({
        method: 'get',
        path: '/hello/{name?}',
        handler: ({ params }) => {

            return {
                hello: params.name || 'world'
            };
        }
    });

    return server;
};
```

Assuming you've already followed [installation](#installation), now just deploy to get a URL to your hapi server deployed as a lambda function!
```sh
npx serverless deploy
```

#### Lambda-ify a single hapi route
##### `server.js`
```js
'use strict';

const Hapi = require('@hapi/hapi');
const Lalalambda = require('lalalambda');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.route({
        method: 'get',
        path: '/hello/{name?}',
        options: {
            // By default the route id is used to name your lambda
            id: 'hello',
            plugins: {
                lalalambda: true
            },
            handler: ({ params }) => {

                return {
                    hello: params.name || 'world'
                };
            }
        }
    });

    return server;
};
```

Assuming you've already followed [installation](#installation), now just deploy to get a URL to your hapi route deployed as a lambda function!
```sh
npx serverless deploy
```

#### Create an arbitrary lambda function
Here we'll create a lambda that is scheduled to log the most recent earthquake on Earth each minute.

##### `server.js`
```js
'use strict';

const Hapi = require('@hapi/hapi');
const Wreck = require('@hapi/wreck');
const Lalalambda = require('lalalambda');

exports.deployment = async () => {

    const server = Hapi.server({
        debug: {
            // These hapi server logs will show-up in your lambda's logs
            log: ['earthquake']
        }
    });

    await server.register(Lalalambda);

    // Just as simple as configuring a route!

    server.lambda({
        id: 'earthquakes',
        options: {
            events: [{
                schedule: 'rate(1 minute)'
            }],
            handler: async (event, context) => {

                const { payload } = await Wreck.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson');

                const { features: [earthquake] } = JSON.parse(payload.toString());

                if (earthquake) {
                    // You have access to the server on the event's context
                    context.server.log('earthquake', earthquake.properties.title);
                }
            }
        }
    });

    return server;
};
```

Assuming you've already followed [installation](#installation), now just deploy to start logging earthquake data!  You can then view these logs in realtime from your terminal.
```sh
npx serverless deploy
npx serverless logs --tail --function earthquakes
```


### Installation
Lalalambda is one package that doubles as 1. a hapi plugin and 2. a [Serverless framework](https://github.com/serverless/serverless) plugin.  These two plugins work together to allow you to define lambda functions in hapi that can be packaged and deployed using the Serverless framework to AWS Lambda.  A basic installation has just a few steps.

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

   const Hapi = require('@hapi/hapi');
   const Lalalambda = require('lalalambda');
   const AppPlugin = require('./app');

   // Lalalambda will look for and use exports.deployment()
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
