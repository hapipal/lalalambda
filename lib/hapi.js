'use strict';

const Querystring = require('querystring');
const Joi = require('joi');
const Hoek = require('hoek');
const Package = require('../package.json');

const internals = {};

exports.plugin = {
    pkg: Package,
    once: true,
    register(server, { lambdaify }) {

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

        if (lambdaify) {

            lambdaify = (lambdaify === true) ? {} :
                (typeof lambdaify === 'string') ? { id: lambdaify } : lambdaify;

            const defaultLambda = {
                id: lambdaify,
                options: {
                    events: [{
                        http: {
                            method: 'any',
                            path: '{proxy+}'
                        }
                    }],
                    handler: internals.httpHandler
                }
            };

            const lambdaConfig = Hoek.applyToDefaults(defaultLambda, lambdaify);

            server.lambda(lambdaConfig);
        }

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

                const pluginsLalalambda = (plugins.lalalambda === true) ? {} :
                    (typeof plugins.lalalambda === 'string') ? { id: plugins.lalalambda } : plugins.lalalambda;

                const defaultLambda = {
                    id,
                    options: {
                        handler: internals.httpHandler
                    }
                };

                const lambdaConfig = Hoek.applyToDefaults(defaultLambda, pluginsLalalambda);

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
                            method: method === '*' ? 'any' : method,
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

internals.lambdaSchema = Joi.object({
    id: Joi.string().required(),
    handler: Joi.func(),
    options: Joi.object().default({}).unknown().keys({
        handler: Joi.func()
    })
})
    .xor('handler', 'options.handler');

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
