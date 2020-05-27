const {
    createOrder,
    getOpenOrders,
    cancelOrders,
    initExchange,
    getAccountInfo,
} = require('../src/binance.js');

const marketParams = {
    type: 'MARKET',
    side: 'SELL',
    recvWindow: 5000,
    symbol: 'BNBBUSD',
    quantity: 100
}
const limitParams = {
    type: 'LIMIT',
    side: 'BUY',
    recvWindow: 5000,
    symbol: 'BNBBUSD',
    quantity: 100,
    priceModifier: 1,
    timeInForce: 'GTC'
}

describe('createOrder call', () => {
    test('empty params returns false', async() => {
        let order = await createOrder();
        expect(order).toBe(false);
    })
})