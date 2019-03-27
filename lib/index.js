'use strict';

const Querystring = require('querystring');
const Path = require('path');
const Util = require('util');
const Joi = require('joi');
const Fs = require('fs');
const Hoek = require('hoek');
const Rimraf = require('rimraf');
const Somever = require('somever');
const Package = require('../package.json');

const internals = {};
const BUILD_FOLDER = '_lalalambda';

module.exports = exports = class LalalambdaServerlessPlugin {

    constructor(sls) {

        this.sls = sls;

        // Set during initialize()
        this.server = null;

        // Currently catering to AWS
        Hoek.assert(sls.service.provider.name === 'aws', 'Lalalambda requires using the serverless AWS provider.');

        this.provider = sls.getProvider('aws');

        // Override run() in order to configure serverless in time to run any command

        const { run } = sls;

        sls.run = async (...args) => {

            await this.initialize();

            this.updateServerlessFnConfig();

            return await run.call(sls, ...args);
        };

        this.hooks = {
            'before:package:createDeploymentArtifacts': async () => await this.writeHandlers(),
            'after:package:createDeploymentArtifacts': async () => await this.cleanup(),
            'before:invoke:local:loadEnvVars': async () => await this.writeHandlers(),
            'after:invoke:local:invoke': async () => await this.cleanup(),
            'before:offline:start:init': async () => await this.writeHandlers(),
            'after:offline:start:end': async () => await this.cleanup()
        };
    }

    async initialize() {

        const { servicePath } = this.sls.config;

        const server = this.server = await internals.getServer(servicePath);

        Hoek.assert(server.plugins.lalalambda, 'Lalalambda needs to be registered as a plugin on your hapi server.');
    };

    updateServerlessFnConfig() {

        const { sls, server } = this;

        Hoek.assert(server, 'Lalalambda must be initialized.');

        const { lambdas } = server.plugins.lalalambda;

        for (const id of lambdas.keys()) {

            sls.service.functions[id] = sls.service.functions[id] || {};

            const fnConfig = sls.service.getFunction(id);

            Hoek.assert(!fnConfig.handler, `Lambda "${id}" already has a handler configured in the serverless config.`);

            const { settings } = lambdas.get(id);

            Hoek.merge(fnConfig, {
                ...settings,
                handler: Path.posix.join(BUILD_FOLDER, `${id}.handler`)
            });

            const runtime = fnConfig.runtime || sls.service.provider.runtime;

            Hoek.assert(runtime && runtime.startsWith('nodejs'), `Lambda "${id}" must be configured with a nodejs runtime.`);
            Hoek.assert(Somever.match(runtime.slice(6), '>=8.10'), `Lambda "${id}" must be configured with a nodejs runtime >=8.10.`);
        }
    };

    async cleanup() {

        const { servicePath } = this.sls.config;

        await internals.rimraf(Path.join(servicePath, BUILD_FOLDER));
    };

    async writeHandlers() {

        const { server } = this;

        Hoek.assert(server, 'Lalalambda must be initialized.');

        const { servicePath } = this.sls.config;
        const { lambdas } = server.plugins.lalalambda;

        await this.cleanup();
        await internals.mkdir(Path.join(servicePath, BUILD_FOLDER));

        for (const id of lambdas.keys()) {
            await internals.writeFile(
                Path.join(servicePath, BUILD_FOLDER, `${id}.js`),
                internals.entrypoint(id)
            );
        }
    };
};

// hapi plugin

exports.plugin = {
    pkg: Package,
    once: true,
    register(server) {

        server.expose('lambdas', new Map());

        server.decorate('server', 'lambda', function (lambdaConfigs) {

            const { lambdas } = server.plugins.lalalambda;

            lambdaConfigs = [].concat(lambdaConfigs);
            lambdaConfigs.forEach((lambdaConfig) => {

                const { id, options, ...others } = Joi.attempt(lambdaConfig, internals.lambdaSchema);

                Hoek.assert(!lambdas.has(id), `Lambda "${id}" has already been registered.`);

                const handler = others.handler || options.handler;
                delete options.handler;

                lambdas.set(id, {
                    id,
                    handler,
                    server: this,
                    settings: options
                });
            });
        });

        server.ext('onPreStart', () => {

            server.table().forEach((route) => {

                const {
                    method,
                    path,
                    params,
                    fingerprint,
                    public: {
                        realm,
                        settings: { id, plugins, cors }
                    }
                } = route;

                if (!plugins.lalalambda) {
                    return;
                }

                const defaultLambda = {
                    id,
                    options: {
                        handler: internals.httpHandler
                    }
                };

                const lambdaConfig = Hoek.applyToDefaults(defaultLambda, plugins.lalalambda);

                if (!lambdaConfig.options.hasOwnProperty('events')) {

                    const hasDuplicateParams = params.some((param, i) => params.lastIndexOf(param) !== i);
                    const hasPartialParams = (/[^/][?#]|[?#][^/]/).test(path);

                    Hoek.assert(!hasDuplicateParams, `Routes configured with lalalambda may not have multi-segment path params such as "${method} ${path}".`);
                    Hoek.assert(!hasPartialParams, `Routes configured with lalalambda may not have partial-segment path params such as "${method} ${path}".`);

                    let replaceCount = 0;

                    const lambdaPath = fingerprint.replace(/[?#]/g, (match) => {

                        // In fingerprint,
                        // ? -> {param} and # -> {proxy+}

                        const i = replaceCount++;

                        return (match === '?') ? `{${params[i]}}` : '{proxy+}';
                    });

                    const { prefix } = realm.modifiers.route;

                    lambdaConfig.options.events = [{
                        http: {
                            method,
                            path: prefix ? (prefix + ((lambdaPath !== '/') ? lambdaPath : '')) : lambdaPath,
                            cors: cors && {
                                origins: cors.origin,
                                headers: cors.headers.concat(cors.additionalHeaders),
                                maxAge: cors.maxAge,
                                withCredentials: cors.credentials
                            },
                            request: {
                                parameters: {
                                    // Mark optional path params
                                    paths: params
                                        .filter((param) => path.includes(`{${param}?}`))
                                        .reduce((collect, param) => ({ ...collect, [param]: false }), {})
                                }
                            }
                        }
                    }];

                    Hoek.assert(replaceCount === params.length);
                }

                Hoek.assert(lambdaConfig.id, `The route "${method} ${path}" must be configured with an id for use with lalalambda.`);

                server.lambda(lambdaConfig);
            });
        });
    }
};

exports.handler = (id, path) => {

    const setup = (async () => {

        const server = await internals.getServer(path);

        Hoek.assert(server.plugins.lalalambda, 'Lalalambda needs to be registered as a plugin on your hapi server.');

        const { lambdas } = server.plugins.lalalambda;

        Hoek.assert(lambdas.has(id), `Lambda "${id}" not found.`);

        const { handler, server: srv } = lambdas.get(id);

        return {
            server: srv,
            handler: handler.bind(srv.realm.settings.bind || null)
        };
    })();

    return async (evt, ctx) => {

        const { server, handler } = await setup;

        ctx.server = server;

        return await handler(evt, ctx);
    };
};

internals.lambdaSchema = Joi.object({
    id: Joi.string().required(),
    handler: Joi.func(),
    options: Joi.object().default({}).unknown().keys({
        handler: Joi.func()
    })
})
    .xor('handler', 'options.handler');

internals.mkdir = Util.promisify(Fs.mkdir);

internals.writeFile = Util.promisify(Fs.writeFile);

internals.rimraf = Util.promisify(Rimraf);

internals.getServer = async (root) => {

    const path = Path.join(root, 'server');

    try {

        const srv = require(path);

        Hoek.assert(typeof srv.deployment === 'function', `No server found! The current project must export { deployment: async () => server } from ${root}/server.`);

        const server = await srv.deployment();

        await server.initialize();

        return server;
    }
    catch (err) {

        Hoek.assert(err.code !== 'MODULE_NOT_FOUND' || !err.message.includes(path), `No server found! The current project must export { deployment: async () => server } from ${root}/server.`);

        throw err;
    }
};

// eslint-disable-next-line hapi/hapi-scope-start
internals.entrypoint = (id) => `'use strict';

const Path = require('path');
const Lalalambda = require('lalalambda');

exports.handler = Lalalambda.handler('${id}', Path.resolve(__dirname, '..'));
`;

internals.httpHandler = async (event, context) => {

    const { server } = context;
    const querystring = Querystring.stringify(event.multiValueQueryStringParameters);

    const { statusCode, rawPayload, headers } = await server.inject({
        method: event.httpMethod,
        url: `${event.path}?${querystring}`,
        payload: event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body,
        headers: Object.entries(event.multiValueHeaders)
            .reduce((collect, [name, value]) => ({
                ...collect,
                [name]: (value.length === 1) ? value[0] : value
            }), {}),
        plugins: {
            lalalambda: { event, context }
        }
    });

    return {
        statusCode,
        body: rawPayload.toString('base64'),
        isBase64Encoded: true,
        multiValueHeaders: headers
    };
};
