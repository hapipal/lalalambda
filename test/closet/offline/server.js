'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda([
        {
            id: 'offline-lambda-one',
            options: {
                events: [{
                    http: {
                        method: 'get',
                        path: '/one'
                    }
                }],
                handler: () => ({
                    statusCode: 200,
                    body: JSON.stringify({
                        success: 'offlined-one'
                    })
                })
            }
        },
        {
            id: 'offline-lambda-two',
            options: {
                events: [{
                    http: {
                        method: 'get',
                        path: '/two'
                    }
                }],
                handler: () => ({
                    statusCode: 200,
                    body: JSON.stringify({
                        success: 'offlined-two'
                    })
                })
            }
        }
    ]);

    return server;
};
