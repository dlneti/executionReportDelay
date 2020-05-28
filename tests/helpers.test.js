const { mapParamsToQuery, getPrivateKey } = require('../lib/helpers.js');

describe('mapParamsToQuery call', () => {
    test('returns valid query string', () => {
        let params = {
            key: 123456,
            price: 555,
            name: "testName"
        }
        expect(mapParamsToQuery(params)).toBe("key=123456&price=555&name=testName");
    })
    
    test('returns empty string on no input', () => {
        expect(mapParamsToQuery({})).toBe("");
        expect(mapParamsToQuery()).toBe("");
    })
})

describe('getPrivateKey call', () => {
    test('private key is in /test directory', () => {
        expect(typeof getPrivateKey() === 'undefined').toBe(false);
    })
})