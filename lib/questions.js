const fuzzy = require('fuzzy');
const { Separator } = require('inquirer');

const mainAction = () => ([
    {
        type: "list",
        name: "main",
        message: "MENU\n",
        choices: [
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
            new Separator(),
            {
                "name": "Exit",
                "value": "done"
            }
        ]
    }
]);

const createOrder = pairs => ([
    {
        type: 'input',
        name: 'delay',
        message: 'Delay in milliseconds',
        default: 100,
        validate: input => +input !== NaN && +input > 0 ? true : "Delay must be a positive number",
    },
    symbol(pairs),
    {
        type: 'list',
        name: 'side',
        message: 'Select side',
        choices: [
            'BUY',
            'SELL'
        ],
    },
    {
        type: 'input',
        name: 'priceModifier',
        message: 'Price modifier. Returns current symbol price multiplied by modifier (e.g. 1.1 for 10% increase, 1 for current symbol price)',
        default: 1,
        validate: input => +input > 0 && +input !== NaN ? true : "Input must be a positive number",
        when: answers => answers.type !== 'MARKET',
    },
    {
        name: 'quantity',
        message: 'Quantity',
        validate: input => +input > 0 && +input !== NaN ? true : "Input must be a positive number"
    },
]);

const symbol = symbols => (
    {
        type: 'autocomplete',
        name: 'symbol',
        message: 'Symbol',
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