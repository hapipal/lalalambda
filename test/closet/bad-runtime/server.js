'use strict';

const Hapi = require('@hapi/hapi');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'bad-runtime-lambda',
        handler: () => ({ success: 'bad-runtimed' })
    });

    return server;
};
