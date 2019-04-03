'use strict';

const HapiSide = require('./hapi');
const ServerlessSide = require('./serverless');

module.exports = exports = class LalalambdaServerlessPlugin extends ServerlessSide.Plugin {};

exports.handler = ServerlessSide.handler;

exports.plugin = HapiSide.plugin;
