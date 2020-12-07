# API

Serverless functions powered by hapijs

> **Note**
>
> Lalalambda is intended for use with hapi v19+, serverless v1 and v2, and nodejs v12+ (see v1 for lower support).

Lalalambda is one package that doubles as 1. a hapi plugin and 2. a [Serverless framework](https://github.com/serverless/serverless) plugin.  These two plugins work together to allow you to define lambda functions in hapi that can be packaged and deployed using the Serverless framework to [AWS Lambda](https://aws.amazon.com/lambda/).

## The hapi plugin
The hapi plugin is responsible for the interface to,

1. Configure an entire hapi server for deployment as a lambda function using [plugin registration](#registration) options.
2. Configure individual hapi routes for deployment as lambda functions using [route configuration](#route-configuration).
3. Configure arbitrary lambda functions triggered by cloud events using [`server.lambda()`](#serverlambdalambda).


### Registration
Lalalambda may be registered multiple times—it should be registered in any plugin that would like to use any of its features.

It only has one plugin registration option, which is used to configure the entire hapi server as a lambda function.  Although lalalambda may be registered multiple times, it may only be registered once using this option.

 - `lambdaify` - a `lambda` configuration as described in [`server.lambda(lambda)`](#serverlambdalambda) below.  Alternatively, may be a string serving as the lambda config `id`.  Note that the lambda config `events` may also be a function that receives the default configuration and returns the desired configuration.  When this option is set to `true` it defaults to the lambda config `{ id: 'server' }`.

**Example**
```js
await server.register({
    plugin: require('@hapipal/lalalambda'),
    options: {
        lambdaify: true
    }
})
```

### Route configuration
Individual hapi routes can be configured as lambda functions.

#### `route.options.plugins.lalalambda`
A `lambda` configuration as described in [`server.lambda(lambda)`](#serverlambdalambda) below.  Alternatively, may be a string serving as the lambda config `id`.  Note that the lambda config `events` may also be a function that receives the default configuration and returns the desired configuration.  When this option is set to `true` it defaults to the lambda config with `id` matching the hapi route's [`route.options.id`](https://github.com/hapijs/hapi/blob/master/API.md#route.options.id).

**Example**
```js
server.route({
    method: 'get',
    path: '/hello/{name?}',
    options: {
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
```

### `server.lambda(lambda)`
Defines a lambda function to be merged into the project's [Serverless functions config](https://serverless.com/framework/docs/providers/aws/guide/functions/) where,

 - `lambda` - a lambda configuration object or an array of configuration objects where each object contains:
   - `id` - (required) the lambda id.
   - `handler` - (required when `options.handler` is not set) an alternative to using `options.handler`, described below.
   - `options` - the lambda configuration:
     - `events`, `runtime`, etc. - any configuration item described in the [Serverless functions config](https://serverless.com/framework/docs/providers/aws/guide/functions/).
     - `handler` - (required) the lambda function's handler `async function(event, context)`:

       - The `event` and `context` arguments are described in the [AWS Lambda docs](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html).  The `context` object also contains `context.server` referencing the hapi `server` in which the lambda was defined.  If [`server.bind()`](https://github.com/hapijs/hapi/blob/master/API.md#server.bind()) was called, the handler will be bound to the provided context via `this`.  Note that handlers never use callbacks.

**Example**
```js
const Wreck = require('@hapi/wreck');

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
```

## The Serverless plugin
Currently the plugin only supports the [`aws` Serverless provider](https://serverless.com/framework/docs/providers/aws/), and each function deployed via lalalambda must use the `nodejs8.10` runtime or newer (`nodejs12.x` is recommended).  The plugin is responsible for:

1. Configuring the project's Serverless service based upon relevant lambda and route configurations made within hapi.

2. Writing lambda handler files during packaging, deployment, local invocation, etc., and later cleaning them up.  These files will be written in your project root's `_lalalambda/` directory.

In order to interoperate with your hapi server, it is expected that `server.js` or `server/index.js` export an async function named `deployment` returning your configured hapi server.  This server should have the [lalalambda hapi plugin](#the-hapi-plugin) registered, and it may be [initialized](https://hapi.dev/api/#server.initialize()) but should not be [started](https://hapi.dev/api/#server.start()).  The path to `server.js` can also be customized through the `custom.lalalambda` config section as shown below.

A minimal Serverless [config](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/) utilizing lalalambda will look like this:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs12.x

plugins:
  - '@hapipal/lalalambda'

# optional
custom:
  lalalambda:
    serverPath: some/relative/path/to/server.js
```
