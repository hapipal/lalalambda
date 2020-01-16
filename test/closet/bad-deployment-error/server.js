'use strict';

const DoesNotExist = require('does-not-exist');
const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(DoesNotExist);
    await server.register(Lalalambda);

    return server;
};
