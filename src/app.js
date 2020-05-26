const inquirer = require('inquirer');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const Rx = require('rxjs')
const chalk = require('chalk')

// local
const { initExchange, 
        // subscribeStream, 
        createOrder,
        getOpenOrders,
        cancelOrders,
        getAccountInfo
} = require('./binance');
const { subscribeStream } = require('./exchange');

const { questions, helpers: { readExchangeData } } = require('../lib');

// const ui = new inquirer.ui.BottomBar({
//     bottomBar: "First bottom bar message"
// });
// let i = 0;

// setInterval(() => {
//     ui.updateBottomBar("\n\nbottom bar message: " + i)
//     i++;

// }, 2000)

// globals
const obs = new Rx.Subject();    // observable

const start = async () => {
    let [ws, { exchange }] = await Promise.all([
        subscribeStream({user: true, obs: obs}),
        initExchange()
    ])

    _start(ws, exchange);
}


const _start = async (ws, exchange) => {
    let delay;

    log(chalk.blue("Welcome to trade delay monitor"), pad=true)

    obs.subscribe(
        async (event) => {
            // console.log(event)

            switch (event.name) {
                case 'streamStarted':
                    console.log(chalk.green("\nConnection to user stream successful!\n"))
                    // ui.log.write(chalk.green("\nConnection to user stream successful!"))
                    break;
                case 'data':
                    // handle socket stream data
                    _handleStreamData(event.data.data);
                    break;
                case 'delayCheck':
                    // 1. Wait for the user stream to start if it hasn't yet
                    if (ws.readyState !== ws.OPEN) {
                        setTimeout(() => {
                            console.log("waiting for stream start...")
                            obs.next(event)     // emit same event
                        }, 300)
                        break;
                    }
                    
                    // console.log("Stream is connected")
                    
                    // 2. Submit Limit order with users input params
                    const limitParams = {...event.data.orderParams, type: 'LIMIT'}
                    console.log("submitting limit order", {limitParams})
                    const limitOrder = await createOrder(limitParams);

                    // sanity check if order happened

                    // 3. wait a while
                    console.log("waiting for 5s")
                    await new Promise(resolve => {
                        setTimeout(() => {
                            resolve()
                        }, 5000)
                    })

                    // 4. Submit market order on same symbol with same quantity to fully fill 

                    const marketParams = {
                        ...event.data.orderParams,
                        type: 'MARKET',
                        side: event.data.orderParams.side === 'BUY' ? 'SELL' : 'BUY'
                    }
                    delete marketParams.price
                    delete marketParams.priceModifier
                    console.log("submitting market order", {marketParams})
                    const marketOrder = await createOrder(marketParams);

                    // listen to events from user stream


                    // 5. return measured delays (min, max, avg)

                    break;
                case 'main':
                    await runMain(exchange);
                    break;
                case 'done':
                    // close stream, which will emit streamClosed event on close
                    ws.close();
                    break;
                case 'streamClosed':
                    // streamClosed event -> we can safely exit the app
                    obs.complete();     // initiate teardown
                    break;
            
                default:
                    break;
            }
        },
        err => {                                            // error handler function
            console.log(`Error: ${err}`)
        },
        () => {                                             // completed handler function
            exit()
        }
    )

    await runMain(exchange);
}

const runMain = async exchange => {
    let symbol;
    
    const supportedPairs = exchange.symbols.map(e => e.symbol);

    // prompt for action

    let action = await promptAction("mainAction");
    action = action.main;

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
            // stream.close();
            obs.next({ name: 'closeStream' });
            break;
        
        case 'delayCheck':

            const userInput = await promptAction('createOrder', supportedPairs);
            // console.log(userInput)
            const delay = userInput.delay;
            delete userInput.delay

            let orderParams = {
                recvWindow: 5000
            }

            orderParams = {...orderParams, ...userInput}
            
            obs.next({name: 'delayCheck', data: {orderParams: orderParams, delay: delay}})
            // obs.next({name: 'delayCheck', data: {}})
            break;

        case 'cancelOrder':
            symbol = await promptAction('symbol', supportedPairs);


            const hasOpenOrders = await getOpenOrders(symbol.symbol);
            if (hasOpenOrders.length < 1) {
                log(chalk.green(`No open orders for ${symbol.symbol}`));
                obs.next({name: 'main'});
                break;
            }

            const cancel = await cancelOrders(symbol.symbol)

            log(chalk.green("Cancel succesfull"), pad=true)

            obs.next({name: 'main'})

            break;

        case 'getOpenOrders':
            symbol = await promptAction('symbol', ["all", ...supportedPairs]);
            const openOrders = await getOpenOrders(symbol.symbol, all=symbol.symbol === "true"? true : false)
            
            log(chalk.green(JSON.stringify(openOrders)));

            obs.next({name: 'main'})
            break;

        case 'done':
            // explicit exit
            obs.next({name: 'done'});
            break;
        default:
            console.log(chalk.red(`Unrecognized action: ${action.action}`))
            obs.next({name: 'main'})
    }

    return true
}


const _handleStreamData = streamData => {
    if (streamData.e === 'executionReport') {
        _handleExecutionReport(streamData);
    }
}

const _handleExecutionReport = report => {
    switch (report.x) {
        case 'EXPIRED':
            log(chalk.red("Order has been rejected!"));
            delay = getDelay(report.T)
            console.log(chalk.bold(chalk.red(`Delay was: ${delay} ms`)))
            
            // await runMain(exchange)
            break;
        case 'TRADE':
            if (report.X === 'PARTIALLY_FILLED') {
                console.log('PARTIAL_FILL')
                delay = getDelay(report.T)
                console.log(chalk.bold(chalk.red(`Delay was: ${delay} ms`)))
                break;
            }
            console.log('TRADE_COMPLETE');
            delay = getDelay(report.T)
            console.log(chalk.bold(chalk.red(`Delay was: ${delay} ms`)))
            // await runMain(exchange)
            break;
    
        default:
            break;
    }
}

const exit = () => {
    console.log(chalk.blue("Thank you for visiting! Come again... 👋"));
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
    // console.log(responseTime)

    // let time_now = new Date().getTime();
    // let delay = time_now - responseTime;
    // console.log(delay)
    
    // return delay;
    
    return new Date().getTime() - responseTime;
}


const log = (input, pad=false) => {
    if (pad) {
        input = _padResponse(input);
    }
    console.log(input);
}

const _padResponse = text => `\n${text}\n`;

module.exports = {
    start: start
}


// debug
// start().then(_ => {})