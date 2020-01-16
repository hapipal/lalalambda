'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'bad-runtime-version-lambda',
        handler: () => ({ success: 'bad-runtime-versioned' })
    });

    return server;
};
