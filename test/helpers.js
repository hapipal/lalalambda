'use strict';

const Path = require('path');
const StripAnsi = require('strip-ansi');
const Serverless = require('serverless');
const Offline = require('serverless-offline');

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

exports.OfflineMock = class OfflineMock extends Offline {

    constructor(...args) {

        super(...args);

        this.serverlessLog = (...logs) => this.serverless.cli.log(...logs);
    }

    async _listen() {

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
