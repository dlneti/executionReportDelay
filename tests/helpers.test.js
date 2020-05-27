const { mapParamsToQuery } = require('../lib/helpers.js');


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
