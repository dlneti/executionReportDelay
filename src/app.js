const inquirer = require('inquirer');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const Rx = require('rxjs')
const chalk = require('chalk')

const { getAccountInfo, 
        subscribeStream, 
        createOrder,
        getOpenOrders,
        cancelOrders,
        getExchangeInfo
} = require('./exchange');

const { questions } = require('../lib')

// const ui = new inquirer.ui.BottomBar();

const obs = new Rx.Subject();    // observable


const start = async () => {
    log(chalk.blue("Welcome to trade delay monitor"), pad=true)

    obs.subscribe(
        async (event) => {
            // console.log(event)
            let action, run;


            switch (event.name) {
                case 'streamStarted':
                    console.log(chalk.green("\nConnection to user stream successful!"))
                    await runMain(ws, account, exchange, action)
                    break;
                case 'data':
                    let streamData = event.data.data;

                    if (streamData.e === 'executionReport') {
                        switch (streamData.x) {
                            case 'EXPIRED':
                                log("Order has been rejected!");
                                // log(chalk.red(JSON.sstreamData))
                                console.log(streamData)
                                await runMain(ws, account, exchange)
                                break;
                            case 'TRADE':
                                if (streamData.X === 'PARTIALLY_FILLED') {
                                    console.log('PARTIAL_FILL')
                                    getDelay(streamData.T)
                                    break;
                                }
                                console.log('TRADE_COMPLETE');
                                getDelay(streamData.T)
                                await runMain(ws, account, exchange)
                                break;
                        
                            default:
                                break;
                        }
                    }

                    break;
                case 'createOrder':
                    log('', cls=true)   // clear screen
                    break;
                case 'main':
                    await runMain(ws, account, exchange);
                    break;
            
                default:
                    break;
            }
        },
        err => {                                            // error handler function
            console.log(`Error: ${err}`)
        },
        () => {                                             // completed handler function
            console.log("Exiting")
            exit()
        }
    )
    
    // data needed from exchange for app to work
    let [account, exchange] = await Promise.all([
        getAccountInfo(),
        getExchangeInfo()
    ]);                             // fetch all together


    // connect to user stream on app startup
    let ws;
    ws = await subscribeStream({user: true, obs: obs});

}

const runMain = async (stream, account, exchange, action) => {
    let symbol;
    
    const accountTokens = account.balances.map(e => e.asset);
    const supportedPairs = exchange.symbols.map(e => e.symbol);

    // prompt for action

    if (typeof action === 'undefined') {
        action = await promptAction("mainAction");
        action = action.main;
    }

    switch (action) {
        // exchange actions

        case 'balances':
            const { balances } = await getAccountInfo();

            const parsed = balances
                .map(item => `${item.asset}: ${item.free}`)
                .join("\n");

            log(chalk.green(parsed), pad=true);

            obs.next({name: 'main'})
            break;

        case 'closeStream':
            stream.close();
            break;

        case 'createOrder':

            const userInput = await promptAction('createOrder', supportedPairs);
            // console.log(userInput)
            let orderParams = {
                recvWindow: 10000
            }

            orderParams = {...orderParams, ...userInput}
            
            obs.next({name: 'createOrder'})

            const order = await createOrder(orderParams)

            // console.log({order})
            if (order.code) {
                log(chalk.red(`Order request failed!\n${JSON.stringify(order)}`), pad=true);
                obs.next({name: 'main'})
            }
            break;

        case 'cancelOrder':
            symbol = await promptAction('symbol', supportedPairs);
            const cancel = await cancelOrders(symbol.symbol)

            log(chalk.green("Cancel succesfull"), pad=true)

            obs.next({name: 'main'})

            break;

        case 'getOpenOrders':
            
            symbol = await promptAction('symbol', supportedPairs);
            const openOrders = await getOpenOrders(symbol.symbol)
            
            log(chalk.green(JSON.stringify(openOrders)));

            obs.next({name: 'main'})
            
            break;

        case 'done':
            // explicit exit
            obs.complete();
        default:
            console.log(chalk.red(`Unrecognized action: ${action.action}`))
    }

    return true
}

const exit = () => {
    console.log(chalk.blue("Bye bye 👋"));
    process.exit(0);
}


const promptAction = async (action, inputData) => {
    // console.log(questions)

    const qs = questions[action](inputData);
    const answers = await inquirer.prompt(qs);
    return answers;
}


// Helpers

const getDelay = responseTime => {
    console.log(responseTime)
    responseTime = +responseTime;       // convert to number
    // console.log(responseTime)

    let time_now = new Date().getTime();

    let delay = time_now - responseTime;
    console.log(delay)

    return delay;

}


const log = (input, pad=false, cls=false) => {
    if (cls) {
        console.log("\033[2J\033[0f")   // clear screen
    }

    if (pad) {
        input = _padResponse(input);
    }
    console.log(input);
}

const _padResponse = text => `\n${text}\n\n`;

module.exports = {
    start: start
}


// debug
// start().then(_ => {})