'use strict';

const Path = require('path');
const StripAnsi = require('strip-ansi');
const Serverless = require('serverless');
const ServerlessConfigFile = require('serverless/lib/utils/getServerlessConfigFile');
const Offline = require('serverless-offline');

exports.Hapi = require('@hapi/hapi');

exports.makeServerless = (servicePath, argv) => {

    servicePath = Path.join(__dirname, 'closet', servicePath);

    const serverless = new Serverless({ servicePath });

    const { CLI } = serverless.classes;

    serverless.classes.CLI = class MockCLI extends CLI {

        constructor(sls) {

            super(sls, argv);

            this.output = '';
        }

        consoleLog(msg) {

            this.output += `${msg}\n`;
        }

        printDot() {

            this.output += '.';
        }
    };

    const { run } = serverless;

    serverless.run = async () => {

        // Make non-interactive, e.g. setup AWS creds
        serverless.processedInput.commands = serverless.processedInput.commands
            .filter((c) => c !== 'interactiveCli');

        try {
            await run.call(serverless);
        }
        finally {

            // Something between serverless 1.77.1 and 1.78.0 made this cache clear necessary.
            // When reusing closet/offline-canvas the parsed serverless.yaml object is being
            // reused each time, which caused lambda functions from earlier tests to show-up
            // in later tests (serverless.config.functions).  Super odd!  In serverless v1 and
            // v2 the cache can be accessed, but in slightly different ways:
            const cache = ServerlessConfigFile.getServerlessConfigFile.cache || ServerlessConfigFile.getServerlessConfigFile;
            cache.clear();
        }

        return StripAnsi(serverless.cli.output);
    };

    return serverless;
};

exports.offline = (serverless, withOffline) => {

    const offline = serverless.pluginManager.plugins
        .find((p) => p.constructor.name === 'OfflineMock');

    offline.ready = async () => await withOffline(offline);

    return serverless;
};

exports.getLalalambdaServer = async (serverless) => {

    const lalalambda = serverless.pluginManager.plugins
        .find((p) => p.constructor.name === 'LalalambdaServerlessPlugin');

    await lalalambda.initialize();

    return lalalambda.server;
};

exports.useServer = (servicePath, server) => {

    const serviceServerPath = Path.join(__dirname, 'closet', servicePath, 'server');

    const serviceServer = require(serviceServerPath);

    const { deployment } = serviceServer;

    serviceServer.deployment = () => server;

    return () => Object.assign(serviceServer, { deployment });
};

exports.OfflineMock = class OfflineMock extends Offline {

    constructor(sls, opts) {

        super(sls, { ...opts, noPrependStageInUrl: true });

        // Make this hook lazy so that we can override ready() inside offline() helper
        this.hooks['offline:start:ready'] = () => this.ready();
    }

    get server() {

        return super.getApiGatewayServer();
    }

    async _createHttp(events) {

        // Silence logging of route summary
        const { log: origLog } = console;
        Object.assign(console, { log: () => null });

        try {
            await super._createHttp(events, true);
        }
        finally {
            Object.assign(console, { log: origLog });
        }

        this.server.ext('onPreHandler', (request, h) => {

            // Account for serverless-offline issue where multiValueHeaders are not set when using inject()

            request.raw.req.rawHeaders = Object.entries(request.headers)
                .flatMap(([key, vals]) => {

                    return [].concat(vals).flatMap((val) => [key, val]);
                });

            return h.continue;
        });
    }

    async _createLambda(lambdas) {

        await super._createLambda(lambdas, true);
    }

    async end() {

        await super.end(true);
    }
};
