'use strict';

const { Hapi } = require('../../../helpers');
const Lalalambda = require('../../../../lib');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    return server;
};
