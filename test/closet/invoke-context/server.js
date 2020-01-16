'use strict';

const { Hapi } = require('../../helpers');
const Lalalambda = require('../../..');

exports.deployment = async () => {

    const server = Hapi.server();

    await server.register(Lalalambda);

    server.lambda({
        id: 'invoke-context-lambda',
        handler(event, { server: srv, ...ctx }) {

            return {
                event,
                plugins: Object.keys(srv.registrations),
                bind: this,
                ctx
            };
        }
    });

    server.bind({
        some: 'data'
    });

    return server;
};
