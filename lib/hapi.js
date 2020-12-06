'use strict';

const Querystring = require('querystring');
const Joi = require('joi');
const Hoek = require('@hapi/hoek');
const Package = require('../package.json');

const internals = {};

exports.plugin = {
    pkg: Package,
    multiple: true,
    requirements: {
        hapi: '>=19'
    },
    register(server, { lambdaify }) {

        const rootState = internals.rootState(server.realm);

        if (!rootState.setup) {

            rootState.setup = true;

            server.expose('lambdas', new Map());

            server.decorate('server', 'lambda', function (lambdaConfigs) {

                return internals.lambda(this, lambdaConfigs);
            });

            server.ext('onPreStart', () => {

                server.table().forEach((route) => internals.maybeLambdaifyRoute(server, route));
            });
        }

        if (lambdaify) {

            Hoek.assert(!rootState.lambdaify, `Lalalambda's lambdaify registration option can only be specified once.`);

            rootState.lambdaify = true;

            internals.lambdaifyServer(server, lambdaify);
        }
    }
};

internals.lambda = (server, lambdaConfigs) => {

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
            server,
            settings: options
        });
    });
};

internals.lambdaSchema = Joi.object({
    id: Joi.string().required(),
    handler: Joi.func(),
    options: Joi.object().default({}).unknown().keys({
        handler: Joi.func()
    })
})
    .xor('handler', 'options.handler');

internals.maybeLambdaifyRoute = (server, route) => {

    const {
        method,
        path,
        params,
        fingerprint,
        public: {
            settings: { id, plugins, cors }
        }
    } = route;

    if (!plugins.lalalambda) {
        return;
    }

    const pluginsLalalambda = (plugins.lalalambda === true) ? {} :
        (typeof plugins.lalalambda === 'string') ? { id: plugins.lalalambda } : plugins.lalalambda;

    const defaultLambda = {
        id,
        options: {
            handler: internals.httpHandler
        }
    };

    const lambdaConfig = Hoek.applyToDefaults(defaultLambda, pluginsLalalambda);

    const makeEvents = () => {

        const hasDuplicateParams = params.some((param, i) => params.lastIndexOf(param) !== i);
        const hasPartialParams = (/[^/][?#]|[?#][^/]/).test(fingerprint);
        const hasNonEndingOptionalParam = (/\?\}./).test(path);

        Hoek.assert(!hasDuplicateParams, `Routes configured with lalalambda may not have multi-segment path params such as "${method} ${path}".`);
        Hoek.assert(!hasPartialParams, `Routes configured with lalalambda may not have partial-segment path params such as "${method} ${path}".`);
        Hoek.assert(!hasNonEndingOptionalParam, `Routes configured with lalalambda may not have an optional path param before the end of the path such as "${method} ${path}".`);

        let replaceCount = 0;

        const baseLambdaPath = fingerprint.replace(/[?#]/g, (match) => {

            // In fingerprint,
            // ? -> {param} and # -> {proxy+}

            const i = replaceCount++;

            return (match === '?') ? `{${params[i]}}` : '{proxy+}';
        });

        Hoek.assert(replaceCount === params.length);

        const hasEndingOptionalParam = (/[\?\*]\}$/).test(path);
        const removeEndingSegment = (segments) => segments.split('/').slice(0, -1).join('/') || '/';

        const lambdaPaths = []
            .concat(baseLambdaPath)
            .concat(hasEndingOptionalParam ? removeEndingSegment(baseLambdaPath) : []);

        return lambdaPaths.map((lambdaPath) => ({
            http: {
                method: method === '*' ? 'any' : method,
                path: lambdaPath,
                cors: cors && {
                    origins: cors.origin,
                    headers: cors.headers.concat(cors.additionalHeaders),
                    maxAge: cors.maxAge,
                    withCredentials: cors.credentials
                }
            }
        }));
    };

    if (!lambdaConfig.options.events) {
        lambdaConfig.options.events = makeEvents();
    }
    else if (typeof lambdaConfig.options.events === 'function') {
        lambdaConfig.options.events = lambdaConfig.options.events(makeEvents());
    }

    Hoek.assert(lambdaConfig.id, `The route "${method} ${path}" must be configured with an id for use with lalalambda.`);

    server.lambda(lambdaConfig);
};

internals.lambdaifyServer = (server, config) => {

    config = (config === true) ? { id: 'server' } :
        (typeof config === 'string') ? { id: config } : config;

    const defaultLambda = {
        options: {
            events: [
                {
                    http: {
                        method: 'any',
                        path: '/{proxy+}'
                    }
                },
                {
                    // The proxy+ param isn't greedy enough to capture the root
                    http: {
                        method: 'any',
                        path: '/'
                    }
                }
            ],
            handler: internals.httpHandler
        }
    };

    const lambdaConfig = Hoek.applyToDefaults(defaultLambda, config);

    if (typeof lambdaConfig.options.events === 'function') {
        lambdaConfig.options.events = lambdaConfig.options.events(defaultLambda.options.events);
    }

    Hoek.assert(lambdaConfig.id, `Lalalambda's lambdaify registration option must be configured with an id.`);

    server.lambda(lambdaConfig);
};

internals.httpHandler = async (event, context) => {

    const { server } = context;
    const querystring = Querystring.stringify(event.multiValueQueryStringParameters);

    const { statusCode, payload, rawPayload, headers } = await server.inject({
        method: event.httpMethod,
        url: `${event.path}?${querystring}`,
        payload: event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body,
        headers: Object.entries(event.multiValueHeaders || {})
            .reduce((collect, [name, value]) => ({
                ...collect,
                [name]: (value.length === 1) ? value[0] : value
            }), {}),
        plugins: {
            lalalambda: { event, context }
        }
    });

    const { 'content-type': type, 'content-encoding': encoding } = headers;
    const isBase64Encoded = Boolean(type && !type.match(/; *charset=/)) ||
        Boolean(encoding && encoding !== 'identity');

    return {
        statusCode,
        isBase64Encoded,
        body: isBase64Encoded ? rawPayload.toString('base64') : payload,
        multiValueHeaders: Object.entries(headers)
            .reduce((collect, [name, value]) => ({
                ...collect,
                [name]: [].concat(value)
            }), {})
    };
};

internals.rootState = (realm) => {

    while (realm.parent) {
        realm = realm.parent;
    }

    const state = realm.plugins.lalalambda = realm.plugins.lalalambda || {};

    return state;
};
