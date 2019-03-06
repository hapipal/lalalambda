'use strict';

const Path = require('path');
const Util = require('util');
const Joi = require('joi');
const Fs = require('fs');
const Hoek = require('hoek');
const Rimraf = require('rimraf');
const Package = require('../package.json');

const internals = {};
const BUILD_FOLDER = '_lalalambda';

module.exports = exports = class LalalambdaServerlessPlugin {

    constructor(sls) {

        const { servicePath } = sls.config;

        let server;

        const initialize = async () => {

            server = await internals.getServer(servicePath);

            Hoek.assert(server.plugins.lalalambda, 'Lalalambda needs to be registered as a plugin on your hapi server.');
        };

        const updateServerlessFnConfig = () => {

            Hoek.assert(server, 'Lalalambda must be initialized.');

            const { lambdas } = server.plugins.lalalambda;

            for (const id of lambdas.keys()) {
                sls.service.functions[id] = sls.service.functions[id] || {};
            }

            // Sets default keys on each function
            sls.service.setFunctionNames(sls.processedInput.options);

            for (const id of lambdas.keys()) {

                const fnConfig = sls.service.getFunction(id);

                Hoek.assert(!fnConfig.handler, `Lambda "${id}" already has a handler configured in the serverless config.`);

                const { settings } = lambdas.get(id);

                Hoek.merge(fnConfig, {
                    ...settings,
                    handler: Path.posix.join(BUILD_FOLDER, `${id}.handler`)
                });
            }
        };

        const cleanup = async () => {

            await internals.rimraf(Path.join(servicePath, BUILD_FOLDER));
        };

        const writeHandlers = async () => {

            Hoek.assert(server, 'Lalalambda must be initialized.');

            const { lambdas } = server.plugins.lalalambda;

            await cleanup();
            await internals.mkdir(Path.join(servicePath, BUILD_FOLDER));

            for (const id of lambdas.keys()) {
                await internals.writeFile(
                    Path.join(servicePath, BUILD_FOLDER, `${id}.js`),
                    internals.entrypoint(id)
                );
            }
        };

        // This is a hack around serverless, but it's small and only applies to local invocation,
        // so we'll deal with it and recognize that it may break or need maintenance.

        const loadHooks = sls.pluginManager.loadHooks;
        sls.pluginManager.loadHooks = (pluginInstance) => {

            loadHooks.call(sls.pluginManager, pluginInstance);

            if (pluginInstance === this) {

                sls.pluginManager.loadHooks = loadHooks;

                const loadEnvVarsHooks = sls.pluginManager.hooks['before:invoke:local:loadEnvVars'];

                // Move our hook up to the front.
                loadEnvVarsHooks.splice(0, 0, ...loadEnvVarsHooks.splice(-1));
            }
        };

        // Currently catering to AWS
        this.provider = sls.getProvider('aws');

        this.hooks = {
            'before:info:info': async () => {

                await initialize();

                updateServerlessFnConfig();
            },
            'before:package:setupProviderConfiguration': async () => {

                await initialize();

                updateServerlessFnConfig();
            },
            'before:package:setupProviderConfiguration': async () => {

                await initialize();

                updateServerlessFnConfig();
            },
            'before:package:createDeploymentArtifacts': async () => {

                await writeHandlers();
            },
            'after:package:createDeploymentArtifacts': async () => {

                await cleanup();
            },
            'before:invoke:local:loadEnvVars': async () => {

                await initialize();

                updateServerlessFnConfig();

                await writeHandlers();
            },
            'after:invoke:local:invoke': async () => {

                await cleanup();
            },
            'before:invoke:invoke': async () => {

                await initialize();

                updateServerlessFnConfig();
            }
        };
    }
};

// hapi plugin

exports.plugin = {
    pkg: Package,
    once: true,
    register(server) {

        server.expose('lambdas', new Map());

        server.decorate('server', 'lambda', function (lambdas) {

            lambdas = [].concat(lambdas);
            lambdas.forEach((lambda) => {

                const { id, options, ...others } = Joi.attempt(lambda, internals.lambdaSchema);

                Hoek.assert(!server.plugins.lalalambda.lambdas.has(id), `Lambda "${id}" already exists.`);

                const handler = others.handler || options.handler;
                delete options.handler;

                server.plugins.lalalambda.lambdas.set(id, {
                    id,
                    handler,
                    server: this,
                    settings: options
                });
            });
        });
    }
};

exports.handler = (id, path) => {

    const makeHandler = (async () => {

        const server = await internals.getServer(path);

        const lambda = server.plugins.lalalambda.lambdas.get(id);

        if (!lambda) {
            throw new Error(`Lambda "${id}" not found.`);
        }

        const { handler, server: srv } = lambda;

        return handler.bind(srv.realm.settings.bind || null, srv);
    })();

    return async (...args) => {

        const maybeCb = args[args.length - 1];

        if (typeof maybeCb === 'function') {
            try {
                const handler = await makeHandler;
                return maybeCb(null, await handler(...args.slice(0, -1)));
            }
            catch (err) {
                return maybeCb(err);
            }
        }
        else {
            const handler = await makeHandler;
            return await handler(...args);
        }
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

        if (typeof srv.deployment !== 'function') {
            throw new Error(`No server found! The current project must export { deployment: async () => server } from ${root}/server.`);
        }

        const server = await srv.deployment();

        await server.initialize();

        return server;
    }
    catch (err) {

        if (err.code === 'MODULE_NOT_FOUND' && err.message.includes(path)) {
            throw new Error(`No server found! The current project must export { deployment: async () => server } from ${root}/server.`);
        }

        throw err;
    }
};

// eslint-disable-next-line hapi/hapi-scope-start
internals.entrypoint = (id) => `'use strict';

const Path = require('path');
const Lalalambda = require('lalalambda');

exports.handler = Lalalambda.handler('${id}', Path.resolve(__dirname, '..'));
`;
