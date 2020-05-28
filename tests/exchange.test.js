const {
    fetchApi,
    subscribeStream,
} = require('../src/exchange.js');

const API_KEY = process.env.API_KEY;

const apiArgs = {
    endpoint: 'exchangeInfo',
    apiUri: 'api/v3',
}

describe('fetchApi call', () => {
    test('no endpoint returns false', async() => {
        let args = {...apiArgs};
        delete args.endpoint;
        let order = await fetchApi(args);
        expect(order).toBe(false);
    })

    test('response is object and has "ok" property', async () => {
        let order = await fetchApi(apiArgs);
        expect(order).toHaveProperty('ok');
    })
})

test("API_KEY is in .env file", () => {
    expect(typeof API_KEY === 'undefined').toBe(false);
})