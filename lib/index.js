'use strict';

const Path = require('path');
const Util = require('util');
const Joi = require('joi');
const Fs = require('fs');
const Hoek = require('hoek');
const Rimraf = require('rimraf');
const Package = require('../package.json');

const BUILD_FOLDER = '_lalalambda';
const internals = {};

module.exports = exports = class LalalambdaServerlessPlugin {

    constructor(sls) {

        this.server = null;

        const { servicePath } = sls.config;

        const initialize = async () => {

            const { deployment } = require(`${servicePath}/server`);

            const server = await deployment();

            Hoek.assert(server.plugins.lalalambda, 'Lalalambda needs to be registered as a plugin on your hapi server.');

            this.server = server;
        };

        const cleanup = async () => await internals.rimraf(Path.join(servicePath, BUILD_FOLDER));

        const updateServerlessFnConfig = () => {

            Hoek.assert(this.server, 'Lalalambda must be initialized.');

            const { lambdas } = this.server.plugins.lalalambda;

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

        const writeHandlers = async () => {

            Hoek.assert(this.server, 'Lalalambda must be initialized.');

            const { lambdas } = this.server.plugins.lalalambda;

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

        this.hooks = {
            'before:package:setupProviderConfiguration': async () => {

                await initialize();

                updateServerlessFnConfig();
            },
            'before:package:createDeploymentArtifacts': writeHandlers,
            'after:package:createDeploymentArtifacts': cleanup,
            'before:invoke:local:loadEnvVars': async () => {

                await initialize();

                updateServerlessFnConfig();

                await writeHandlers();
            },
            'after:invoke:local:invoke': cleanup,
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

                const { id, handler: hndlr, options } = Joi.attempt(lambda, internals.lambdaSchema);

                Hoek.assert(!server.plugins.lalalambda.lambdas.has(id), `Lambda "${id}" already exists.`);

                const handler = hndlr || options.handler;
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

    const { deployment } = require(Path.join(path, 'server'));

    const makeHandler = (async () => {

        const server = await deployment();

        await server.initialize();

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

// eslint-disable-next-line hapi/hapi-scope-start
internals.entrypoint = (id) => `'use strict';

const Path = require('path');
const Lalalambda = require('lalalambda');

exports.handler = Lalalambda.handler('${id}', Path.resolve(__dirname, '..'));
`;
