'use strict';

const Hapi = require('@hapi/hapi');
const DoesNotExist = require('does-not-exist');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(DoesNotExist);
    await server.register(Lalalambda);

    return server;
};
