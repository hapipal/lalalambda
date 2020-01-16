'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'runtime-per-lambda-lambda',
        handler: () => ({ success: 'runtime-per-lambdaed' })
    });

    return server;
};
