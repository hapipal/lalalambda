'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'config-merge-lambda-one',
        options: {
            memorySize: 512,
            exclude: ['exclude.js'],
            include: ['include.js'],
            events: [{
                http: {
                    method: 'get',
                    path: '/one'
                }
            }],
            handler: () => ({ success: true })
        }
    });

    server.lambda({
        id: 'config-merge-lambda-two',
        options: {
            runtime: 'nodejs12.x',
            memorySize: 512,
            exclude: ['exclude.js'],
            include: ['include.js'],
            events: [{
                http: {
                    method: 'get',
                    path: '/two'
                }
            }],
            handler: () => ({ success: true })
        }
    });

    return server;
};
