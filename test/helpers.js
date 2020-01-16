'use strict';

const Path = require('path');
const StripAnsi = require('strip-ansi');
const Serverless = require('serverless');
const Offline = require('serverless-offline');
const Somever = require('@hapi/somever');

exports.Hapi = Somever.match(process.version, '>=12') ? require('@hapi/hapi-19') : require('@hapi/hapi');

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

        await run.call(serverless);

        return StripAnsi(serverless.cli.output);
    };

    return serverless;
};

exports.offline = (serverless, withOffline) => {

    const offline = serverless.pluginManager.plugins
        .find((p) => p.constructor.name === 'OfflineMock');

    offline._listenForTermination = async () => await withOffline(offline);

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

    constructor(...args) {

        super(...args);

        // Allows useServer() helper to work
        this.options.skipCacheInvalidation = true;

        this.serverlessLog = (...logs) => this.serverless.cli.log(...logs);
    }

    async _listen() {

        this.server.ext('onPreHandler', (request, reply) => {

            // Account for serverless-offline issue where multiValueHeaders are not set when using inject()

            request.multiValueHeaders = Object.entries(request.headers)
                .reduce((collect, [header, value]) => ({
                    ...collect,
                    [header]: [].concat(value)
                }), {});

            return reply.continue();
        });

        await this.server.initialize();

        return this.server;
    }

    async end() {

        return await this.server.stop();
    }

    printBlankLine() {

        this.serverlessLog();
    }
};
