'use strict';

const Hapi = require('@hapi/hapi');
const Lalalambda = require('../../../lib');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    return server;
};
