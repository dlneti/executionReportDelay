const arg = require('arg');

const app = require('./app');

const processArgs = rawArgs => {
    const args = arg(
        {   
            // Types
            '--delay': Number,
    
            // Aliases
            '-d': '--delay'
        },
    )

    return {
        delay: args['--delay'] || 10000
    }
}

const cli = args => {
    const options = processArgs(args);
    // console.log(options);
    app.start();
}

module.exports = cli;