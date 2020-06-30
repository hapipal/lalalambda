'use strict';

const Path = require('path');
const Util = require('util');
const Fs = require('fs');
const Bounce = require('@hapi/bounce');
const Hoek = require('@hapi/hoek');
const Somever = require('@hapi/somever');
const Rimraf = require('rimraf');

const stat = Util.promisify(Fs.stat);

const internals = {};
const BUILD_FOLDER = '_lalalambda';

exports.Plugin = class {

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

        const rootOrPath = Path.resolve(servicePath, Hoek.reach(this.sls, 'service.custom.lalalambda.serverPath') || '');

        const server = this.server = await internals.getServer(rootOrPath);

        Hoek.assert(server.plugins.lalalambda, 'Lalalambda needs to be registered as a plugin on your hapi server.');
    }

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
    }

    async cleanup() {

        const { servicePath } = this.sls.config;

        await internals.rimraf(Path.join(servicePath, BUILD_FOLDER));
    }

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


internals.mkdir = Util.promisify(Fs.mkdir);

internals.writeFile = Util.promisify(Fs.writeFile);

internals.rimraf = Util.promisify(Rimraf);

internals.getServer = async (rootOrPath) => {

    let path = Path.join(rootOrPath, 'server');

    try {
        path = require.resolve(rootOrPath);
    }
    catch (err) { 
        Bounce.rethrow(err, 'system');
    }

    try {

        const srv = require(path);

        Hoek.assert(typeof srv.deployment === 'function', `No server found! The current project must export { deployment: async () => server } from ${path}.`);

        const server = await srv.deployment();

        await server.initialize();

        return server;
    }
    catch (err) {

        Hoek.assert(err.code !== 'MODULE_NOT_FOUND' || !err.message.includes(`'${path}'`), `No server found! The current project must export { deployment: async () => server } from ${path}.`);

        throw err;
    }
};

// eslint-disable-next-line @hapi/hapi/scope-start
internals.entrypoint = (id) => `'use strict';

const Path = require('path');
const Lalalambda = require('lalalambda');

exports.handler = Lalalambda.handler('${id}', Path.resolve(__dirname, '..'));
`;
