'use strict';

const { Hapi } = require('../../../helpers');
const Lalalambda = require('../../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'invoke-lambda',
        handler: () => ({ success: 'invoked' })
    });

    return server;
};
