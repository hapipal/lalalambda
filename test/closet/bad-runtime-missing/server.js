'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'bad-runtime-missing-lambda',
        handler: () => ({ success: 'bad-runtime-missinged' })
    });

    return server;
};
