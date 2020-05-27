const inquirer = require('inquirer');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
const Rx = require('rxjs')
const chalk = require('chalk')

// local imports
const { initExchange, 
        createOrder,
        getOpenOrders,
        cancelOrders,
        getAccountInfo
} = require('./binance');
const { subscribeStream } = require('./exchange');
const { questions } = require('../lib');

// globals
const obs = new Rx.Subject();    // observable

const start = async () => {
    // load data needed for app to work
    // start userStream in the background

    let [ws, { exchange }] = await Promise.all([
        subscribeStream(true, obs),
        initExchange()
    ])

    if (!exchange) {
        _log(chalk.red(`Error fetching exchange data! ${JSON.stringify(exchange)}`))
        return false
    }

    if (!ws) {
        _log(chalk.red(`Error connecting to stream!`))
        return false
    }
    
    await _start(ws, exchange);
}

const exit = () => {
    _log(chalk.blue("Thank you for visiting! Come again... 👋"), pad=true);
    process.exit(0);
}

const _start = async (ws, exchange) => {
    let streamData = {orders: [], delay: 0};

    _log(chalk.blue("Welcome to trade delay monitor"), pad=true)

    obs.subscribe(
        async (event) => {
            let delay;
            switch (event.name) {
                case 'streamStarted':
                    // 'open' event from stream 
                    break;
                case 'data':
                    // data frame coming from stream

                    let eventData = {...event.data.data}        // get data from data frame
                    delay = _handleStreamData(eventData);     // calculate delay for this data frame

                    // only delays for matched trades data frames will be saved
                    if (delay.delay) {
                        eventData.delay = delay.delay;                  
                        streamData = {                                  // save data frame with delay info for post processing
                            ...streamData, 
                            orders: [...streamData.orders, eventData]
                        }     
                    }

                    // last data frame from current trading session came, we can create delay report and return to main
                    if (delay.done) {
                        // handle delay reporting
                        const delayReport = await _getDelayReport(streamData);

                        let delays = chalk.redBright(_getTradeDelayString(delayReport.over));

                        // log report to user
                        let message = `Here is trades delay summary:\n`;
                        message += `min delay: ${delayReport.min} ms\n`;
                        message += `max delay: ${delayReport.max} ms\n`;
                        message += `avg delay: ${delayReport.avg} ms\n\n`;
                        message += `There were ${delayReport.over.length} data frames over delay limit of ${chalk.bold(streamData.delay)} ms:\n`;
                        message += `${delays}\n`;

                        _log(chalk.blue(message));
                        
                        // after we have delay reset the data for next check
                        streamData = {...streamData, orders: []};

                        // return to main menu
                        obs.next({name: 'main'});
                    }
                    break;
                case 'delayCheck':
                    // 1. Wait for the user stream to start if it hasn't yet
                    if (ws.readyState !== ws.OPEN) {
                        setTimeout(() => {
                            _log("waiting for stream start...")
                            obs.next(event)     // emit same event
                        }, 300)
                        break;
                    }
                    
                    // console.log("Stream is connected")

                    // 2. save delay from userInput
                    streamData.delay = event.data.delay;
                    
                    // 3. Submit Limit order with users input params
                    const limitParams = {...event.data.orderParams, type: 'LIMIT'}
                    _log(chalk.blue(`\nSubmitting limit order...`))
                    const limitOrder = await createOrder(limitParams);
                    
                    // sanity check
                    if (!limitOrder.ok) {
                        _log(chalk.red("Error creating order: ", JSON.stringify(limitOrder)));
                        _log(chalk.red(`Order params: ${JSON.stringify(limitParams)}`));
                        obs.next({name: 'main'});
                        break;
                    }

                    _log(chalk.green(`Order submitted:\n${_getTradeString(limitOrder.data)}\n`))

                    // 4. Submit market order on same symbol with same quantity to fully fill 
                    const marketParams = {
                        ...event.data.orderParams,
                        type: 'MARKET',
                        side: event.data.orderParams.side === 'BUY' ? 'SELL' : 'BUY'
                    }

                    // delete unneeded params
                    delete marketParams.price
                    delete marketParams.priceModifier
                    delete marketParams.timeInForce
                    _log(chalk.blue(`Submitting market order...`))
                    const marketOrder = await createOrder(marketParams);
                    
                    // sanity check
                    if (!marketOrder.ok) {
                        _log(chalk.red(`Error creating order: ${JSON.stringify(marketOrder)}\n`));
                        _log(chalk.red(`Order params: ${JSON.stringify(marketParams)}`));
                        obs.next({name: 'main'});
                        break;
                    }
                    _log(chalk.green(`Order submitted:\n${_getTradeString(marketOrder.data)}\n`))
                    
                    // listen to events from user stream

                    // 5. cancel any remaining open trades if left
                    setTimeout(async () => {
                        await cancelOrders(event.data.orderParams.symbol);
                    }, 2000)

                    break;
                case 'main':
                    // run main menu
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
            _log(`Error: ${err}`)
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
    let action = await _promptAction("mainAction");
    action = action.main;

    switch (action) {
        // exchange actions
        case 'balances':
            const accountInfo  = await getAccountInfo();
            if (!accountInfo.ok) {
                _log(chalk.red(`Error fetching balances: ${JSON.stringify(accountInfo)}`))
                obs.next({name: 'main'});
                break;
            }

            const { balances } = accountInfo.data;

            const parsed = balances
                .map(item => `${item.asset}: ${item.free}`)
                .join("\n");

            _log(chalk.green(parsed), pad=true);

            obs.next({name: 'main'})
            break;
        
        case 'delayCheck':
            const userInput = await _promptAction('createOrder', supportedPairs);
            // console.log(userInput)
            const delay = userInput.delay;
            delete userInput.delay

            let orderParams = {
                recvWindow: 5000,
                timeInForce: 'GTC'
            }
            orderParams = {...orderParams, ...userInput}
            obs.next({name: 'delayCheck', data: {orderParams: orderParams, delay: delay}})
            break;

        case 'cancelOrder':
            symbol = await _promptAction('symbol', supportedPairs);
            let hasOpenOrders = await getOpenOrders(symbol.symbol);

            if (!hasOpenOrders.ok) {
                _log(chalk.red(`Error fetching open orders for ${symbol.symbol}: ${JSON.stringify(hasOpenOrders)}`))
                obs.next({name: 'main'});
                break;
            }

            hasOpenOrders = hasOpenOrders.data;

            if (hasOpenOrders.length < 1) {
                _log(chalk.green(`No open orders for ${symbol.symbol}`), pad=true);
                obs.next({name: 'main'});
                break;
            }

            let cancel = await cancelOrders(symbol.symbol)
            if (!cancel.ok) {
                _log(chalk.green(`Error canceling orders for ${symbol.symbol}: ${cancel}`));
                obs.next({name: 'main'});
                break;
            }

            _log(chalk.green("Cancel succesfull"), pad=true)
            obs.next({name: 'main'})
            break;
        case 'getOpenOrders':
            symbol = await _promptAction('symbol', ["all", ...supportedPairs]);
            let openOrders = await getOpenOrders(symbol.symbol, all=symbol.symbol === "true"? true : false)

            if (!openOrders.ok) {
                _log(chalk.red(`Error getting open orders: ${JSON.stringify(openOrders)}`), pad=true)
                obs.next({name: 'main'})
                break;
            }

            openOrders = openOrders.data;
            
            if (openOrders.length) {
                _log(chalk.green(JSON.stringify(openOrders)), pad=true);
            } else {
                _log(chalk.green('No open orders found'), pad=true)
            }

            obs.next({name: 'main'})
            break;
        case 'done':
            // explicit exit
            obs.next({name: 'done'});
            break;
        default:
            _log(chalk.red(`Unrecognized action: ${action}`))
            obs.next({name: 'main'})
    }
}


const _handleStreamData = streamData => {
    let result = { done: false };           // default
    if (streamData.e === 'executionReport') {
        result = {...result, ..._handleExecutionReport(streamData)};
    }

    return result
}

const _handleExecutionReport = report => {
    let done = false;
    let delay = _getDelay(report.T);
    let tradeString = _getTradeDelayString([{...report, delay: delay}]);

    switch (report.x) {
        case 'EXPIRED':
            _log(chalk.redBright(`${report.x} - Order rejected! || ${tradeString}`))
            done = true;        // stop delay check on rejected market order
            break;
        case 'TRADE':
            if (report.X === 'PARTIALLY_FILLED') {
                _log(chalk.green(`${report.X} || ${tradeString}\n`))
                break;
            }
            _log(chalk.green(`${report.X} || ${tradeString}\n`))

            if (report.o === 'LIMIT' && report.x === 'TRADE') {
                done = true;   // this should be the last order update coming through
            }
            break;
        default:
            break;
    }

    return {delay: delay, done: done}
}

const _getDelayReport = reportData => {
    // filter unwanted events
    const orders = reportData.orders.filter(item => ['NEW', 'TRADE'].includes(item.x))
    const delaysOverLimit = orders.filter(item => item.delay >= +reportData.delay)
    
    // calculate delays
    const delays = orders.map(item => item.delay);

    const max = Math.max(...delays);
    const min = Math.min(...delays);
    const avg = delays.reduce((a,b) => a+b) / delays.length;


    if (delaysOverLimit.length > 0) {
        // TODO: save report to fs
    }

    return {
        min: min,
        max: max,
        avg: avg,
        over: delaysOverLimit
    }
}

const _getTradeDelayString = orders => {
    let delays = orders.map(item => {
        return `Trade ID: ${item.c} | Symbol: ${item.s} | Type: ${item.o} | Delay: ${chalk.bold(item.delay)} ms`;
    })

    return delays.join('\n');
}

const _getTradeString = order => {
    let orderString = [
        `Trade ID: ${order.clientOrderId}`,
        `Symbol: ${order.symbol}`,
        `Type: ${order.type}`,
        `Price: ${order.price}`,
        `Quantity: ${order.origQty}`,
    ]

    return orderString.join('\n')
}


const _promptAction = async (action, inputData) => {
    const qs = questions[action](inputData);
    const answers = await inquirer.prompt(qs);
    return answers;
}


// Helpers
const _getDelay = responseTime => {
    return new Date().getTime() - responseTime;
}

const _log = (input, pad=false) => {
    if (pad) {
        input = _padResponse(input);
    }
    console.log(input);
}

const _padResponse = text => `\n${text}\n`;

module.exports = {
    start: start
}