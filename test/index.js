'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Util = require('util');
const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Bounce = require('bounce');
const Serverless = require('serverless');
const Lalalambda = require('..');

// Test shortcuts

const { describe, it, before } = exports.lab = Lab.script();
const { expect } = Code;

describe('Lalalambda', () => {

    const run = async (servicePath, argv) => {

        servicePath = Path.join(__dirname, 'closet', servicePath);

        const serverless = new Serverless({ servicePath });

        const { CLI } = serverless.classes;

        let output = '';

        serverless.classes.CLI = class MockCLI extends CLI {

            constructor(sls) {

                super(sls, argv);
            }

            consoleLog(msg) {

                output += `${msg}\n`;
            }

            printDot() {

                output += '.';
            }
        };

        await serverless.init();
        await serverless.run();

        return output;
    };

    const symlink = Util.promisify(Fs.symlink);

    before(async () => {

        try {
            // Necessary so that handler() can require lalalambda
            await symlink('..', Path.resolve(__dirname, '..', 'node_modules/lalalambda'));
        }
        catch (err) {
            Bounce.ignore(err, { code: 'EEXIST' });
        }
    });

    it('can invoke a basic lambda.', async () => {

        const output = await run('basic', ['invoke', 'local', '--function', 'basic']);

        expect(output).to.contain(`"success": "basic"`);
    });

    describe('the hapi plugin', () => {

        it('can be registered multiple times.', async () => {

            const server = Hapi.server();

            const registerTwice = async () => {

                await server.register(Lalalambda);
                await server.register(Lalalambda);
            };

            await expect(registerTwice()).to.not.reject();
        });

        it('can register a lambda with unknown options.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            server.lambda({
                id: 'x',
                options: {
                    handler: () => 'success',
                    anything: [{ can: (go) => 'here' }]
                }
            });

            const lambda = server.plugins.lalalambda.lambdas.get('x');

            expect(lambda.id).to.equal('x');
            expect(Object.keys(lambda.settings)).to.equal(['anything']);
            expect(lambda.settings.anything[0].can('go')).to.equal('here');
            expect(lambda.handler()).to.equal('success');
        });

        it('can register a lambda with handler defined outside of options.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            server.lambda({
                id: 'x',
                handler: () => 'success'
            });

            const lambda = server.plugins.lalalambda.lambdas.get('x');

            expect(lambda.id).to.equal('x');
            expect(lambda.settings).to.equal({});
            expect(lambda.handler()).to.equal('success');
        });

        it('can register multiple lambdas at once.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            server.lambda([
                {
                    id: 'x',
                    handler: () => 'successX'
                },
                {
                    id: 'y',
                    handler: () => 'successY'
                }
            ]);

            const lambdaX = server.plugins.lalalambda.lambdas.get('x');

            expect(lambdaX.id).to.equal('x');
            expect(lambdaX.settings).to.equal({});
            expect(lambdaX.handler()).to.equal('successX');

            const lambdaY = server.plugins.lalalambda.lambdas.get('y');

            expect(lambdaY.id).to.equal('y');
            expect(lambdaY.settings).to.equal({});
            expect(lambdaY.handler()).to.equal('successY');
        });

        it('requires registered lambdas to have an id and a handler.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            expect(() => server.lambda({ handler: () => null })).to.throw(/"id" is required/);
            expect(() => server.lambda({ id: 'x' })).to.throw(/must contain at least one of \[handler, options.handler\]/);
        });

        it('does not allow multiple lambdas with the same id.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            server.lambda({ id: 'x', handler: () => null });

            expect(() => server.lambda({ id: 'x', handler: () => null })).to.throw('Lambda "x" has already been registered.');
        });
    });
});
