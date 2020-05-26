const fuzzy = require('fuzzy');
const { Separator } = require('inquirer');

const mainAction = () => ([
    {
        type: "list",
        name: "main",
        message: "MENU\n",
        choices: [
            // {
            //     "name": "Create order",
            //     "value": "createOrder",
            // },
            {
                "name": "Start delay check",
                "value": "delayCheck",
                "short": "Delay check"
            },
            new Separator(),
            {
                "name": "See balances",
                "value": "balances",
                "short": "Balances" 
            },
            {
                "name": "Get open orders",
                "value": "getOpenOrders",
                "short": "Open orders" 
            },
            {
                "name": "Cancel open orders",
                "value": "cancelOrder",
            },
            // {
            //     "name": "Close stream",
            //     "value": "closeStream",
            // },
            // {
            //     "name": "Subscribe to user stream",
            //     "value": "stream",
            //     "short": "Subscribe stream"
            // },
            new Separator(),
            {
                "name": "Exit",
                "value": "done"
            }
        ]
    }
]);

const createOrder = pairs => ([
    symbol(pairs),
    {
        type: 'input',
        name: 'delay',
        message: 'Delay in milliseconds',
        validate: input => +input !== NaN && +input > 0 ? true : "Delay must be a positive number",
    },
    {
        type: 'list',
        name: 'side',
        message: 'Select side',
        choices: [
            'BUY',
            'SELL'
        ],
    },
    // {
    //     type: 'list',
    //     name: 'type',
    //     message: 'Select type',
    //     choices: ['MARKET', 'LIMIT'],
    // },
    {
        type: 'input',
        name: 'priceModifier',
        message: 'Price modifier. Returns current symbol price multiplied by modifier (e.g. 1.1 for 10% increase)',
        when: answers => answers.type !== 'MARKET',
    },
    {
        name: 'quantity',
        message: 'Quantity (int)',
        validate: input => +input && +input !== NaN ? true : "Input must be a number"
    },
]);

const symbol = symbols => (
    {
        type: 'autocomplete',
        name: 'symbol',
        message: 'Symbol',
        // validate: input => symbols.filter(item => item === input).length === 1 ? true : "Symbol not supported",
        source: async (answers, input) => {
            input = input || ''
            let fuzzyResult = fuzzy.filter(input, symbols)
            return fuzzyResult.map(result => result.original)
        }
    }
)

module.exports = {
    mainAction: mainAction,
    createOrder: createOrder,
    symbol: symbol,
}