'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Util = require('util');
const Lab = require('lab');
const Code = require('code');
const Bounce = require('bounce');
const Serverless = require('serverless');
// const Lalalambda = require('..');

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
});
