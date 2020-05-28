// local
const { fetchApi: _fetch} = require('./exchange');
const { helpers: { saveExchangeData, readExchangeData } } = require('../lib')


// ================= metadata functions START =================


/**
 * Returns data from exchangeInfo endpoint.
 */
const initExchange = async () => {
    const data = await _getExchangeData()
    return data
}

/**
 * Returns account data from 'account' endpoint
 */
const getAccountInfo = async () => {
    const data = await _fetch({
        endpoint: "account", 
        authRequired: true,
        signatureRequired: true,
        params: {}
    })
    
    return data;
}

/**
 * Returns data from exchangeInfo api endpoint and saves to filesystem.
 * If data is already saved and not older than 1 day, then cached data is returned
 */
const _getExchangeInfo = async () => {
    // read cached data
    let cached;
    try {
        cached = await readExchangeData();
        if (new Date().getTime() - cached.last_saved > 1000 * 60 * 60 * 24) {       // 1 day
            return cached.exchange;
        }
    } catch (err) {
        // file doesnt exist yet
    }


    let exchangeInfo = await _fetch({endpoint: 'exchangeInfo'});

    if (!exchangeInfo.ok) {
        console.log(`Error fetching exchange data from 'exchangeInfo' endpoint ${JSON.stringify(exchangeInfo)}`);
        return false;
    }

    try {
        await saveExchangeData({...exchangeInfo.data, last_saved: new Date().getTime()})    // save fresh data to fs
    } catch (err) {
        console.log("Error saving file to FS!");
        console.log(err)
    }

    return exchangeInfo.data;
}

/**
 * wrapper function for getting required data for app startup
 * more things can be added here
 */
const _getExchangeData = async () => {
    let exchange = await _getExchangeInfo();
    return {exchange: exchange}
}

// ================= metadata functions END =================


// ================= trade functions START =================


/**
 * Submits new order
 * If the order type is 'LIMIT' the parameters are transformed to conform to exchange filters
 * @param {Object} params Object with parameters needed for new order
 */
const createOrder = async params => {
    if (!params) {
        return false;
    }

    if (params.type === 'LIMIT') {
        params = await _transformLimitOrder(params)     // transform params for limit order
    }

    // console.log(params)

    const order = await _fetch({
        endpoint: 'order',
        authRequired: true,
        signatureRequired: true,
        method: 'POST',
        params: params
    })

    return order
}


/**
 * Transforms the order parameters to be valid for 'LIMIT' order
 * If priceModifier parameter came, then the price is calculated as currentPrice * priceModifier
 * Applies filters on symbol based on settings in from exchangeInfo
 * 
 * Returns transformed parameters Object
 * @param {Object} order Order parameters to be transformed
 */
const _transformLimitOrder = async order => {
    const newParams = {...order};
    const price = await getSymbolPrice(order.symbol);         // get current order price
    if (!price.ok) {
        console.log(chalk.red(`Error fetching price for ${order.symbol}: ${JSON.stringify(price)}`))
        return false;
    }

    const curPrice = price.data.price;
    
    let inputPrice; 
    if(order.priceModifier)  { 
        inputPrice = curPrice * order.priceModifier
        delete newParams.priceModifier
     } else { 
        inputPrice = order.price;
     }
    
    // get settings for this symbol
    const { exchange: settings } = await _getExchangeData();
    if (!settings) {
        console.log(chalk.red(`Error fetching exchange info`))
        return false;
    }
    const symbolsFiltered = settings.symbols.filter(item => item.symbol === order.symbol);

    if (symbolsFiltered.length !== 1) {
        console.error(`Symbol ${order.symbol} not found!`)
        return false;
    }

    // check order against relevant filters and apply fix where needed
    const symbolSettings = symbolsFiltered[0];

    try {
        // PRICE_FILTER, applies fix to tickSize
        let fixedPrice = _priceFilter(inputPrice, _getFilter('PRICE_FILTER', symbolSettings.filters));
        newParams.price = fixedPrice;   // set valid price to newParams
        
        // PERCENT_PRICE
        let percentResult = _percentPrice(curPrice, _getFilter('PERCENT_PRICE', symbolSettings.filters));
    } catch (err) {
        console.error(chalk.red(err));
        return false;
    }
    
    return newParams;
}

/**
 * Checks if price is within valid range
 * Applies fix to price precision based on tickSize filter
 * Returns transformed price
 * @param {number} price Input price
 * @param {Object} filter Object with filter rules for this symbol
 */
const _priceFilter = (price, filter) => {
    // max price
    if (price > filter.maxPrice) {
        throw "Price too high!";
    }
    // min price
    if (price < filter.minPrice) {
        throw "Price too low!";
    }
    // fix tick size  
    const precision = filter.tickSize.indexOf(1) - 1;
    const fixedPrice = price
        .toLocaleString(undefined, {maximumFractionDigits: precision, minimumFractionDigits: precision})
        .replace(/,/, "");

    return fixedPrice
}

/**
 * Checks if price is within valid range
 * Returns true or throws error
 * @param {number} price Input price
 * @param {Object} filter Object with filter rules for this symbol
 */
const _percentPrice = (price, filter) => {
    // for simplicity assume weightedAverage is same or similar to last price
    if (price > price * filter.multiplierUp) {
        throw "Price too high!";
    }
    if (price < price * filter.multiplierDown) {
        throw "Price too low!";
    }

    return true;
}

/**
 * Returns filter from array of filters
 * @param {string} name name of filter to be returned
 * @param {Array} arr array of all filters
 */
const _getFilter = (name, arr) => {
    return arr.filter(item => item.filterType === name)[0];
}


/**
 * Returns array of open orders
 * @param {string} symbol
 * @param {Boolean} all true to get open orders for all coins, default false
 */
const getOpenOrders = async (symbol, all=false) => {
    let params = all ? {symbol: symbol} : {};
    
    const orders = await _fetch({
        endpoint: 'openOrders',
        authRequired: true,
        signatureRequired: true,
        params: params
    })

    return orders
}


/**
 * Cancels order for symbol
 * Returns response Object
 * @param {string} symbol 
 */
const cancelOrders = async symbol => {
    const orders = await _fetch({
        endpoint: 'openOrders',
        authRequired: true,
        signatureRequired: true,
        params: {
            symbol: symbol
        },
        method: 'DELETE',
    })

    return orders
}

/**
 * Returns object containing current price for symbol
 * @param {string} symbol 
 */
const getSymbolPrice = async symbol => {
    const res = await _fetch({
        endpoint: 'ticker/price',
        params: {
            symbol: symbol
        }
    })

    return res
}


// ================= trade functions END =================


module.exports = {
    createOrder: createOrder,
    getOpenOrders: getOpenOrders,
    cancelOrders: cancelOrders,
    initExchange: initExchange,
    getAccountInfo: getAccountInfo,
}