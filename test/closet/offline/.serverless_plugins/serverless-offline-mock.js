'use strict';

const Offline = require('serverless-offline');

module.exports = class OfflineMock extends Offline {

    constructor(...args) {

        super(...args);

        this.serverlessLog = (...args) => this.serverless.cli.log(...args);
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
