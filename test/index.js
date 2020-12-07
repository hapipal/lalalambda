'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Util = require('util');
const Zlib = require('zlib');
const Lab = require('@hapi/lab');
const Code = require('@hapi/code');
const Bounce = require('@hapi/bounce');
const Toys = require('@hapipal/toys');
const Rimraf = require('rimraf');
const StreamZip = require('node-stream-zip');
const { Hapi, ...Helpers } = require('./helpers');
const Lalalambda = require('..');

// Test shortcuts

const { describe, it, before, afterEach } = exports.lab = Lab.script();
const { expect } = Code;

describe('Lalalambda', () => {

    const rimraf = Util.promisify(Rimraf);
    const symlink = Util.promisify(Fs.symlink);
    const cwd = process.cwd();

    before(async () => {

        try {
            // Necessary so that handler() can require lalalambda
            await symlink('../..', Path.resolve(__dirname, '..', 'node_modules/@hapipal/lalalambda'));
        }
        catch (err) {
            Bounce.ignore(err, { code: 'EEXIST' });
        }
    });

    // Serverless likes to change the working directory, which screws-up coverage, etc.
    afterEach(() => process.chdir(cwd));

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

        describe('lambdaifies routes', () => {

            it('only when the route is configured.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        id: 'x',
                        handler: () => null
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda).to.not.exist();
            });

            it('using a route id.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        id: 'x',
                        plugins: {
                            lalalambda: true
                        },
                        handler: () => null
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda.id).to.equal('x');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('using a lambda id.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        id: 'x',
                        plugins: {
                            lalalambda: 'y'
                        },
                        handler: () => null
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('y');

                expect(lambda.id).to.equal('y');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('using a lambda config.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        id: 'x',
                        plugins: {
                            lalalambda: {
                                id: 'y',
                                options: {
                                    runtime: 'nodejs12.x'
                                }
                            }
                        },
                        handler: () => null
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('y');

                expect(lambda.id).to.equal('y');
                expect(lambda.settings).to.equal({
                    runtime: 'nodejs12.x',
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('with various methods.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route([
                    {
                        method: '*',
                        path: '/x',
                        options: {
                            plugins: {
                                lalalambda: 'x'
                            },
                            handler: () => null
                        }
                    },
                    {
                        method: 'patch',
                        path: '/y',
                        options: {
                            plugins: {
                                lalalambda: 'y'
                            },
                            handler: () => null
                        }
                    }
                ]);

                await server.initialize();

                const lambdaX = server.plugins.lalalambda.lambdas.get('x');

                expect(lambdaX.id).to.equal('x');
                expect(lambdaX.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'any',
                                path: '/x',
                                cors: false
                            }
                        }
                    ]
                });

                const lambdaY = server.plugins.lalalambda.lambdas.get('y');

                expect(lambdaY.id).to.equal('y');
                expect(lambdaY.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'patch',
                                path: '/y',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('erroring for unsupported path patterns.', async () => {

                const serverA = Hapi.server();
                await serverA.register(Lalalambda);

                serverA.route({
                    method: 'get',
                    path: '/a/{b*2}/c',
                    options: {
                        plugins: {
                            lalalambda: 'x'
                        },
                        handler: () => null
                    }
                });

                expect(serverA.initialize()).to.reject('Routes configured with lalalambda may not have multi-segment path params such as "get /a/{b*2}/c".');

                const serverB = Hapi.server();
                await serverB.register(Lalalambda);

                serverB.route({
                    method: 'get',
                    path: '/a/{b}.jpg',
                    options: {
                        plugins: {
                            lalalambda: 'x'
                        },
                        handler: () => null
                    }
                });

                expect(serverB.initialize()).to.reject('Routes configured with lalalambda may not have partial-segment path params such as "get /a/{b}.jpg".');
            });

            it('with an optional final param.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route([
                    {
                        method: 'get',
                        path: '/{a?}',
                        options: {
                            plugins: {
                                lalalambda: 'x'
                            },
                            handler: () => null
                        }
                    },
                    {
                        method: 'get',
                        path: '/a/{b}/c/{d?}',
                        options: {
                            plugins: {
                                lalalambda: 'y'
                            },
                            handler: () => null
                        }
                    }
                ]);

                await server.initialize();

                const lambdaX = server.plugins.lalalambda.lambdas.get('x');

                expect(lambdaX.id).to.equal('x');
                expect(lambdaX.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/{a}',
                                cors: false
                            }
                        },
                        {
                            http: {
                                method: 'get',
                                path: '/',
                                cors: false
                            }
                        }
                    ]
                });

                const lambdaY = server.plugins.lalalambda.lambdas.get('y');

                expect(lambdaY.id).to.equal('y');
                expect(lambdaY.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/a/{b}/c/{d}',
                                cors: false
                            }
                        },
                        {
                            http: {
                                method: 'get',
                                path: '/a/{b}/c',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('with a wildcard param.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route({
                    method: 'get',
                    path: '/a/{b}/c/{d*}',
                    options: {
                        plugins: {
                            lalalambda: 'x'
                        },
                        handler: () => null
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda.id).to.equal('x');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/a/{b}/c/{proxy+}',
                                cors: false
                            }
                        },
                        {
                            http: {
                                method: 'get',
                                path: '/a/{b}/c',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('with cors settings.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route([
                    {
                        method: 'get',
                        path: '/x',
                        options: {
                            plugins: {
                                lalalambda: 'x'
                            },
                            cors: true,
                            handler: () => null
                        }
                    },
                    {
                        method: 'get',
                        path: '/y',
                        options: {
                            plugins: {
                                lalalambda: 'y'
                            },
                            cors: {
                                origin: ['xyz.com'],
                                headers: ['x-one'],
                                additionalHeaders: ['x-two'],
                                maxAge: 420,
                                credentials: true
                            },
                            handler: () => null
                        }
                    }
                ]);

                await server.initialize();

                const lambdaX = server.plugins.lalalambda.lambdas.get('x');

                expect(lambdaX.id).to.equal('x');
                expect(lambdaX.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/x',
                                cors: {
                                    headers: [
                                        'Accept',
                                        'Authorization',
                                        'Content-Type',
                                        'If-None-Match'
                                    ],
                                    maxAge: 86400,
                                    origins: ['*'],
                                    withCredentials: false
                                }
                            }
                        }
                    ]
                });

                const lambdaY = server.plugins.lalalambda.lambdas.get('y');

                expect(lambdaY.id).to.equal('y');
                expect(lambdaY.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/y',
                                cors: {
                                    headers: [
                                        'x-one',
                                        'x-two'
                                    ],
                                    maxAge: 420,
                                    origins: ['xyz.com'],
                                    withCredentials: true
                                }
                            }
                        }
                    ]
                });
            });

            it('with a plugin route prefix.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                const plugin = {
                    name: 'my-plugin',
                    register: (srv) => {

                        srv.route([
                            {
                                method: 'get',
                                path: '/',
                                options: {
                                    plugins: {
                                        lalalambda: 'x'
                                    },
                                    handler: () => null
                                }
                            },
                            {
                                method: 'get',
                                path: '/a/{b}/c',
                                options: {
                                    plugins: {
                                        lalalambda: 'y'
                                    },
                                    handler: () => null
                                }
                            }
                        ]);
                    }
                };

                await server.register(plugin, {
                    routes: {
                        prefix: '/prefixed'
                    }
                });

                await server.initialize();

                const lambdaX = server.plugins.lalalambda.lambdas.get('x');

                expect(lambdaX.id).to.equal('x');
                expect(lambdaX.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/prefixed',
                                cors: false
                            }
                        }
                    ]
                });

                const lambdaY = server.plugins.lalalambda.lambdas.get('y');

                expect(lambdaY.id).to.equal('y');
                expect(lambdaY.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/prefixed/a/{b}/c',
                                cors: false
                            }
                        }
                    ]
                });
            });

            it('overriding event lambda config.', async () => {

                const server = Hapi.server();
                await server.register(Lalalambda);

                server.route([
                    {
                        method: 'get',
                        path: '/a/{b}',
                        options: {
                            plugins: {
                                lalalambda: {
                                    id: 'x',
                                    options: {
                                        events: [
                                            {
                                                http: {
                                                    method: 'get',
                                                    path: '/a/{x}'
                                                }
                                            }
                                        ]
                                    }
                                }
                            },
                            handler: () => null
                        }
                    },
                    {
                        method: 'get',
                        path: '/c/{d?}',
                        options: {
                            plugins: {
                                lalalambda: {
                                    id: 'y',
                                    options: {
                                        events: ([ev1, ev2]) => ([
                                            {
                                                http: {
                                                    ...ev1.http,
                                                    async: true
                                                }
                                            },
                                            {
                                                http: {
                                                    ...ev2.http,
                                                    async: true
                                                }
                                            }
                                        ])
                                    }
                                }
                            },
                            handler: () => null
                        }
                    }
                ]);

                await server.initialize();

                const lambdaX = server.plugins.lalalambda.lambdas.get('x');

                expect(lambdaX.id).to.equal('x');
                expect(lambdaX.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/a/{x}'
                            }
                        }
                    ]
                });

                const lambdaY = server.plugins.lalalambda.lambdas.get('y');

                expect(lambdaY.id).to.equal('y');
                expect(lambdaY.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'get',
                                path: '/c/{d}',
                                cors: false,
                                async: true
                            }
                        },
                        {
                            http: {
                                method: 'get',
                                path: '/c',
                                cors: false,
                                async: true
                            }
                        }
                    ]
                });
            });
        });

        describe('lambdaify plugin option', () => {

            it('cannot be used more than once.', async () => {

                const server = Hapi.server();

                const registerTwice = async () => {

                    await server.register({
                        plugin: Lalalambda,
                        options: {
                            lambdaify: 'x'
                        }
                    });

                    await server.register({
                        plugin: Lalalambda,
                        options: {
                            lambdaify: 'y'
                        }
                    });
                };

                await expect(registerTwice()).to.reject(`Lalalambda's lambdaify registration option can only be specified once.`);
            });

            it('can be configured using a lambda id.', async () => {

                const server = Hapi.server();

                await server.register({
                    plugin: Lalalambda,
                    options: {
                        lambdaify: 'x'
                    }
                });

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda.id).to.equal('x');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'any',
                                path: '/{proxy+}'
                            }
                        },
                        {
                            http: {
                                method: 'any',
                                path: '/'
                            }
                        }
                    ]
                });
            });

            it('can be configured using a lambda config.', async () => {

                const server = Hapi.server();

                await server.register({
                    plugin: Lalalambda,
                    options: {
                        lambdaify: {
                            id: 'x',
                            options: {
                                runtime: 'nodejs12.x'
                            }
                        }
                    }
                });

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda.id).to.equal('x');
                expect(lambda.settings).to.equal({
                    runtime: 'nodejs12.x',
                    events: [
                        {
                            http: {
                                method: 'any',
                                path: '/{proxy+}'
                            }
                        },
                        {
                            http: {
                                method: 'any',
                                path: '/'
                            }
                        }
                    ]
                });
            });

            it('can be configured using a lambda config with events specified as a function.', async () => {

                const server = Hapi.server();

                await server.register({
                    plugin: Lalalambda,
                    options: {
                        lambdaify: {
                            id: 'x',
                            options: {
                                events: ([{ http }]) => ([
                                    {
                                        http: {
                                            ...http,
                                            async: true
                                        }
                                    }
                                ])
                            }
                        }
                    }
                });

                const lambda = server.plugins.lalalambda.lambdas.get('x');

                expect(lambda.id).to.equal('x');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'any',
                                path: '/{proxy+}',
                                async: true
                            }
                        }
                    ]
                });
            });

            it('defaults to { id: \'server\' } when set to true.', async () => {

                const server = Hapi.server();

                await server.register({
                    plugin: Lalalambda,
                    options: {
                        lambdaify: true
                    }
                });

                const lambda = server.plugins.lalalambda.lambdas.get('server');

                expect(lambda.id).to.equal('server');
                expect(lambda.settings).to.equal({
                    events: [
                        {
                            http: {
                                method: 'any',
                                path: '/{proxy+}'
                            }
                        },
                        {
                            http: {
                                method: 'any',
                                path: '/'
                            }
                        }
                    ]
                });
            });
        });

        describe('http handler', () => {

            before(async () => {

                // Warm-up serverless-offline to avoid timing issues during tests
                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                await Helpers.offline(serverless, () => null).run();
            });

            it('handles a simple request with query params.', async (flags) => {

                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                const server = await Helpers.getLalalambdaServer(serverless);
                flags.onCleanup = Helpers.useServer('offline-canvas', server);

                await server.stop();

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        plugins: {
                            lalalambda: 'simple'    // Each test needs its own ids due to require() cache
                        },
                        handler: ({ query }) => ({ a: query.b })
                    }
                });

                await server.initialize();

                await Helpers.offline(serverless, async (offline) => {

                    const { result } = await offline.server.inject('/?b=b');

                    expect(result).to.equal('{"a":"b"}');

                }).run();
            });

            it('handles multiple headers.', async (flags) => {

                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                const server = await Helpers.getLalalambdaServer(serverless);
                flags.onCleanup = Helpers.useServer('offline-canvas', server);

                await server.stop();

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        plugins: {
                            lalalambda: 'headers-multiple'
                        },
                        handler: ({ headers }) => headers
                    }
                });

                await server.initialize();

                await Helpers.offline(serverless, async (offline) => {

                    const { result } = await offline.server.inject({
                        method: 'get',
                        url: '/',
                        headers: {
                            'x-a': 'test-x',
                            'x-b': ['test-x'],
                            'x-c': ['test-x', 'test-y']
                        }
                    });

                    expect(JSON.parse(result)).to.contain({
                        'x-a': 'test-x',
                        'x-b': 'test-x',
                        'x-c': ['test-x', 'test-y']
                    });

                }).run();
            });

            it('handles missing headers.', async (flags) => {

                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                const server = await Helpers.getLalalambdaServer(serverless);
                flags.onCleanup = Helpers.useServer('offline-canvas', server);

                await server.stop();

                server.route({
                    method: 'get',
                    path: '/',
                    options: {
                        plugins: {
                            lalalambda: 'headers-missing'
                        },
                        handler: ({ headers }) => headers
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('headers-missing');
                const { handler } = lambda;
                lambda.handler = (evt, ...args) => {

                    evt.multiValueHeaders = null;

                    return handler(evt, ...args);
                };

                await Helpers.offline(serverless, async (offline) => {

                    const { result } = await offline.server.inject({
                        method: 'get',
                        url: '/',
                        headers: {
                            ensure: 'i get cleared'
                        }
                    });

                    // We can't force hapi to inject without basic headers,
                    // but we can check that we cleared additional headers
                    // from the originating request.

                    expect(JSON.parse(result)).to.only.contain(['user-agent', 'host']);

                }).run();
            });

            it('handles binary vs non-binary responses.', async (flags) => {

                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                const server = await Helpers.getLalalambdaServer(serverless);
                flags.onCleanup = Helpers.useServer('offline-canvas', server);

                await server.stop();

                server.route({
                    method: 'get',
                    path: '/type-no-charset',
                    options: {
                        plugins: {
                            lalalambda: 'binary1'
                        },
                        handler: (request, h) => h.response(Buffer.from('binary1'))
                    }
                });

                server.route({
                    method: 'get',
                    path: '/type-empty',
                    options: {
                        plugins: {
                            lalalambda: 'binary2'
                        },
                        handler: (request, h) => {

                            const response = h.response('binary2').type('');

                            response._contentType = null;

                            return response;
                        }
                    }
                });

                server.route({
                    method: 'get',
                    path: '/encoding-identity',
                    options: {
                        plugins: {
                            lalalambda: 'binary3'
                        },
                        handler: (request, h) => h.response('binary3').header('content-encoding', 'identity')
                    }
                });

                server.route({
                    method: 'get',
                    path: '/encoding-gzip',
                    options: {
                        plugins: {
                            lalalambda: 'binary4'
                        },
                        handler: (request, h) => h.response(Zlib.gzipSync('binary4')).header('content-encoding', 'gzip')
                    }
                });

                await server.initialize();

                await Helpers.offline(serverless, async (offline) => {

                    const { result: result1 } = await offline.server.inject('/type-no-charset');
                    expect(result1).to.equal('binary1');

                    // Note that the type doesn't come-down empty here even though it's interpreted as empty by this plugin.
                    // That's because serverless-offline can't unset the header. We had to dip into hapi internals to unset this header.
                    const { result: result2 } = await offline.server.inject('/type-empty');
                    expect(result2).to.equal('binary2');

                    const { result: result3 } = await offline.server.inject('/encoding-identity');
                    expect(result3).to.equal('binary3');

                    const { rawPayload } = await offline.server.inject('/encoding-gzip');
                    expect(Zlib.gunzipSync(rawPayload).toString()).to.equal('binary4');

                }).run();
            });

            it('handles base64 event payloads.', async (flags) => {

                const serverless = Helpers.makeServerless('offline-canvas', ['offline', 'start']);
                await serverless.init();
                const server = await Helpers.getLalalambdaServer(serverless);
                flags.onCleanup = Helpers.useServer('offline-canvas', server);

                await server.stop();

                server.route({
                    method: 'post',
                    path: '/',
                    options: {
                        plugins: {
                            lalalambda: 'base64'
                        },
                        handler: ({ payload }) => payload
                    }
                });

                await server.initialize();

                const lambda = server.plugins.lalalambda.lambdas.get('base64');
                const { handler } = lambda;
                lambda.handler = (evt, ...args) => {

                    evt.body = Buffer.from(evt.body).toString('base64');
                    evt.isBase64Encoded = true;

                    return handler(evt, ...args);
                };

                await Helpers.offline(serverless, async (offline) => {

                    const { result } = await offline.server.inject({
                        method: 'post',
                        url: '/',
                        payload: {
                            some: 'json'
                        }
                    });

                    expect(result).to.equal('{"some":"json"}');

                }).run();
            });
        });
    });

    describe('the serverless plugin', () => {

        it('requires an AWS provider.', async () => {

            const serverless = Helpers.makeServerless('bad-provider', ['print']);

            await expect(serverless.init()).to.reject(/Lalalambda requires using the serverless AWS provider\./);
        });

        it('requires the nodejs runtime (incorrect).', async () => {

            const serverless = Helpers.makeServerless('bad-runtime', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject('Lambda "bad-runtime-lambda" must be configured with a nodejs runtime.');
        });

        it('requires the nodejs runtime (missing).', async () => {

            const serverless = Helpers.makeServerless('bad-runtime-missing', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject('Lambda "bad-runtime-missing-lambda" must be configured with a nodejs runtime.');
        });

        it('requires the nodejs runtime >=12.', async () => {

            const serverless = Helpers.makeServerless('bad-runtime-version', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject('Lambda "bad-runtime-version-lambda" must be configured with a nodejs runtime >=12.');
        });

        it('checks per-lambda nodejs runtime.', async () => {

            const serverless = Helpers.makeServerless('runtime-per-lambda', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.not.reject();
        });

        it('merges serverless and hapi lambda configs.', async () => {

            const serverless = Helpers.makeServerless('config-merge', ['print']);

            await serverless.init();
            await serverless.run();

            const config1 = serverless.service.getFunction('config-merge-lambda-one');
            const config2 = serverless.service.getFunction('config-merge-lambda-two');

            expect(config1).to.equal({
                name: 'my-service-dev-config-merge-lambda-one',
                include: ['include.js'],
                exclude: ['exclude.js'],
                events: [{ http: { method: 'get', path: '/one' } }],
                memorySize: 512,
                handler: '_lalalambda/config-merge-lambda-one.handler'
            });

            expect(config2).to.equal({
                name: 'my-service-dev-config-merge-lambda-two',
                runtime: 'nodejs12.x',
                include: ['also-include.js', 'include.js'],
                exclude: ['also-exclude.js', 'exclude.js'],
                events: [
                    { http: { method: 'post', path: '/two' } },
                    { http: { method: 'get', path: '/two' } }
                ],
                timeout: 20,
                memorySize: 512,
                handler: '_lalalambda/config-merge-lambda-two.handler'
            });
        });

        it('fails when server file does not exist', async () => {

            const serverless = Helpers.makeServerless('missing-server-file', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject(`No server found! The current project must export { deployment: async () => server } from ${Path.join(__dirname, '/closet/missing-server-file/server.')}`);
        });

        it('can load the server file with file extension from a custom path', async () => {

            const serverless = Helpers.makeServerless('server-file-location-with-file-extension', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.not.reject();
        });

        it('can load the server file without file extension from a custom path', async () => {

            const serverless = Helpers.makeServerless('server-file-location-without-file-extension', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.not.reject();
        });

        it('fails when deployment does not exist.', async () => {

            const serverless = Helpers.makeServerless('bad-deployment-missing', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject(/No server found/);
        });

        it('fails when deployment has wrong exports.', async () => {

            const serverless = Helpers.makeServerless('bad-deployment-exports', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject(/No server found/);
        });

        it('fails when deployment throws while being required.', async () => {

            const serverless = Helpers.makeServerless('bad-deployment-error', ['print']);

            await serverless.init();

            await expect(serverless.run()).to.reject(/Cannot find module 'does-not-exist'/);
        });

        it('can locally invoke a lambda registered by hapi.', async () => {

            const serverless = Helpers.makeServerless('invoke', ['invoke', 'local', '--function', 'invoke-lambda']);

            await serverless.init();

            const output = await serverless.run();

            expect(output).to.contain(`"success": "invoked"`);
        });

        it('can locally invoke a lambda registered by hapi to a custom serverPath.', async () => {

            const serverless = Helpers.makeServerless('invoke-custom-server-path', ['invoke', 'local', '--function', 'invoke-lambda']);

            await serverless.init();

            const output = await serverless.run();

            expect(output).to.contain(`"success": "invoked"`);
        });

        it('can locally invoke a lambda registered by hapi to a custom serverPath containing a single quote.', async () => {

            const serverless = Helpers.makeServerless('invoke-custom-server-path-escaped', ['invoke', 'local', '--function', 'invoke-lambda']);

            await serverless.init();

            const output = await serverless.run();

            expect(output).to.contain(`"success": "invoked"`);
        });

        it('invokes lambdas registered by hapi with server and bound context.', async () => {

            const serverless = Helpers.makeServerless('invoke-context', ['invoke', 'local', '--function', 'invoke-context-lambda', '--data', '{"an":"occurrence"}']);

            await serverless.init();

            const output = await serverless.run();
            const result = JSON.parse(output);

            expect(result).to.only.contain(['plugins', 'bind', 'event', 'ctx']);
            expect(result.plugins).to.equal(['@hapipal/lalalambda']);
            expect(result.bind).to.equal({ some: 'data' });
            expect(result.event).to.equal({ an: 'occurrence' });
            expect(result.ctx).to.contain({ functionName: 'my-service-dev-invoke-context-lambda' });
        });

        it('can provide info on lambdas registered by hapi.', { timeout: 10000 }, async (flags) => {

            const serverless = Helpers.makeServerless('info', ['info']);

            await serverless.init();

            const provider = serverless.getProvider('aws');

            const { request } = provider;
            const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

            process.env.AWS_ACCESS_KEY_ID = 'x';
            process.env.AWS_SECRET_ACCESS_KEY = 'x';

            flags.onCleanup = () => {

                Object.assign(provider, { request });
                Object.assign(process.env, { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY });
            };

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

        it('interoperates with the offline plugin.', async () => {

            const serverless = Helpers.makeServerless('offline', ['offline', 'start']);

            await serverless.init();

            await Helpers.offline(serverless, async (offline) => {

                const { result: result1 } = await offline.server.inject('/one');
                const { result: result2 } = await offline.server.inject('/two');

                expect(result1).to.contain(`"success":"offlined-one"`);
                expect(result2).to.contain(`"success":"offlined-two"`);

            }).run();
        });

        it('can package lambdas with proper handlers.', async (flags) => {

            const serverless = Helpers.makeServerless('package', ['package']);

            await serverless.init();
            await serverless.run();

            const zip = new StreamZip({
                file: Path.join(__dirname, 'closet', 'package', '.serverless', 'my-service.zip'),
                storeEntries: true
            });

            flags.onCleanup = async () => {

                await rimraf(Path.join(__dirname, 'closet', 'package', '.serverless'));

                zip.close();
            };

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
                const Lalalambda = require('@hapipal/lalalambda');

                exports.handler = Lalalambda.handler('package-lambda', Path.resolve(__dirname, '../server'));
            `));

            const cfFile = await readFile(Path.join(__dirname, 'closet', 'package', '.serverless', 'cloudformation-template-update-stack.json'));
            const cfTemplate = JSON.parse(cfFile.toString());

            const lambdaTemplate = Object.values(cfTemplate.Resources)
                .find((resource) => resource.Type === 'AWS::Lambda::Function');

            expect(lambdaTemplate).to.exist();
            expect(lambdaTemplate.Properties).to.contain({
                FunctionName: 'my-service-dev-package-lambda',
                Handler: '_lalalambda/package-lambda.handler',
                Runtime: 'nodejs12.x'
            });
        });
    });
});
