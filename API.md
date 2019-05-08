# API
Lalalambda is one package that doubles as 1. a hapi plugin and 2. a [Serverless framework](https://github.com/serverless/serverless) plugin.  These two plugins work together to allow you to define lambda functions in hapi that can be packaged and deployed using the Serverless framework to [AWS Lambda](https://aws.amazon.com/lambda/).

## The hapi plugin
### Registration
### Route configuration
### `server.lambda(lambda)`

## The Serverless plugin
Lalalambda takes no options when used as a Serverless plugin.  Currently the plugin only supports the `aws` Serverless provider, and each function deployed via lalalambda must use the `nodejs8.10` runtime or newer.  The plugin is responsible for:

1. Configuring the project's Serverless service based upon relevant lambda and route configurations made within hapi.

2. Writing lambda handler files during packaging, deployment, local invocation, etc., and later cleaning them up.  These files will be written in your project root's `_lalalambda/` directory.

In order to interoperate with your hapi server, it is expected that `server.js` or `server/index.js` export an async function named `deployment` returning your configured hapi server.  This server should have the [lalalambda hapi plugin](#the-hapi-plugin) registered.

A minimal Serverless [config](https://serverless.com/framework/docs/providers/aws/guide/serverless.yml/) utilizing lalalambda will look like this:

```yaml
# serverless.yml
service: my-service

provider:
  name: aws
  runtime: nodejs8.10

plugins:
  - lalalambda
```
