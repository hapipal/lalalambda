'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.typo = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    return server;
};
