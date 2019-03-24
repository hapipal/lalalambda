'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Util = require('util');
const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Bounce = require('bounce');
const Toys = require('toys');
const StripAnsi = require('strip-ansi');
const StreamZip = require('node-stream-zip');
const Serverless = require('serverless');
const Lalalambda = require('..');

// Test shortcuts

const { describe, it, before } = exports.lab = Lab.script();
const { expect } = Code;

describe('Lalalambda', () => {

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
            expect(() => server.lambda({ id: 'x' })).to.throw(/must contain at least one of \[handler, options\.handler\]/);
        });

        it('does not allow multiple lambdas with the same id.', async () => {

            const server = Hapi.server();
            await server.register(Lalalambda);

            server.lambda({ id: 'x', handler: () => null });

            expect(() => server.lambda({ id: 'x', handler: () => null })).to.throw('Lambda "x" has already been registered.');
        });
    });

    describe('the serverless plugin', () => {

        const makeServerless = (servicePath, argv) => {

            servicePath = Path.join(__dirname, 'closet', servicePath);

            const serverless = new Serverless({ servicePath });

            const { CLI } = serverless.classes;

            serverless.classes.CLI = class MockCLI extends CLI {

                constructor(sls) {

                    super(sls, argv);

                    this.output = '';
                }

                consoleLog(msg) {

                    this.output += `${msg}\n`;
                }

                printDot() {

                    this.output += '.';
                }
            };

            const { run } = serverless;

            serverless.run = async () => {

                await run.call(serverless);

                return StripAnsi(serverless.cli.output);
            };

            return serverless;
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

        it('can locally invoke a lambda registered by hapi.', async () => {

            const serverless = makeServerless('invoke', ['invoke', 'local', '--function', 'invoke-lambda']);

            await serverless.init();

            const output = await serverless.run();

            expect(output).to.contain(`"success": "invoked"`);
        });

        it('can provide info on lambdas registered by hapi.', async (flags) => {

            const serverless = makeServerless('info', ['info']);

            await serverless.init();

            const provider = serverless.getProvider('aws');

            const { request } = provider;

            flags.onCleanup = () => Object.assign(provider, { request });

            provider.request = async (service, method, ...args) => {

                if (service === 'CloudFormation' && method === 'describeStacks') {
                    return { Stacks: [{ Outputs: [] }] };
                }

                if (service === 'CloudFormation' && method === 'listStackResources') {
                    return {};
                }

                return await request.call(provider, service, method, ...args);
            };

            const output = await serverless.run();

            expect(output).to.contain('functions:\n  info-lambda: my-service-dev-info-lambda');
        });

        it('interoperates with the offline plugin.', { plan: 2 }, async () => {

            const serverless = makeServerless('offline', ['offline', 'start']);

            await serverless.init();

            const offline = serverless.pluginManager.plugins
                .find((p) => p.constructor.name === 'OfflineMock');

            offline._listenForTermination = async () => {

                const { result: result1 } = await offline.server.inject('/one');
                const { result: result2 } = await offline.server.inject('/two');

                expect(result1).to.contain(`"success":"offlined-one"`);
                expect(result2).to.contain(`"success":"offlined-two"`);
            };

            await serverless.run();
        });

        it('can package lambdas with proper handlers.', async (flags) => {

            const serverless = makeServerless('package', ['package']);

            await serverless.init();
            await serverless.run();

            const zip = new StreamZip({
                file: Path.join(__dirname, 'closet', 'package', '.serverless', 'my-service.zip'),
                storeEntries: true
            });

            flags.onCleanup = () => zip.close();

            await Toys.event(zip, 'ready');

            expect(Object.keys(zip.entries())).to.only.contain(['server.js', '_lalalambda/package-lambda.js']);

            const normalize = (x) => x.replace(/^\n/, '').replace(/^[ ]{16}/gm, '').replace(/[ ]{12}$/, '');
            const readFile = Util.promisify(Fs.readFile);

            const serverZipFile = zip.entryDataSync('server.js');
            const serverFile = await readFile(Path.join(__dirname, 'closet', 'package', 'server.js'));

            expect(serverZipFile.toString()).to.equal(serverFile.toString());

            const handlerZipFile = zip.entryDataSync('_lalalambda/package-lambda.js');

            expect(handlerZipFile.toString()).to.equal(normalize(`
                'use strict';

                const Path = require('path');
                const Lalalambda = require('lalalambda');

                exports.handler = Lalalambda.handler('package-lambda', Path.resolve(__dirname, '..'));
            `));

            const cfZipFile = await readFile(Path.join(__dirname, 'closet', 'package', '.serverless', 'cloudformation-template-update-stack.json'));
            const cfTemplate = JSON.parse(cfZipFile.toString());

            const lambdaTemplate = Object.values(cfTemplate.Resources)
                .find((resource) => resource.Type === 'AWS::Lambda::Function');

            expect(lambdaTemplate.Properties).to.contain({
                FunctionName: 'my-service-dev-package-lambda',
                Handler: '_lalalambda/package-lambda.handler',
                Runtime: 'nodejs8.10'
            });
        });
    });
});
