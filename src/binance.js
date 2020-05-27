// local
const { fetchApi: _fetch} = require('./exchange');
const { helpers: { saveExchangeData, readExchangeData } } = require('../lib')


// ================= metadata functions START =================


const initExchange = async () => {
    const data = await _getExchangeData()
    await saveExchangeData({...data, last_saved: new Date().getTime()})    // save to fs
    return data
}

const getAccountInfo = async () => {
    const data = await _fetch({
        endpoint: "account", 
        authRequired: true,
        signatureRequired: true,
        params: {}
    })
    
    return data;
}

const _getExchangeInfo = async () => {
    // read cached data
    const cached = readExchangeData();

    if (new Date().getTime() - cached.last_saved > 1000 * 60 * 60 * 24) {       // 1 day
        return cached.exchange;
    }

    let exchangeInfo = await _fetch({endpoint: 'exchangeInfo'});

    if (!exchangeInfo.ok) {
        return false;
    }

    return exchangeInfo.data;
}

const _getExchangeData = async () => {
    let exchange = await _getExchangeInfo();
    return {exchange: exchange}
}

// ================= metadata functions END =================


// ================= trade functions START =================

const createOrder = async params => {
    if (params.type === 'LIMIT') {
        params = await _transformLimitOrder(params)     // transform params for limit order
    }

    if (!params) {
        return false;
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

const _getFilter = (name, arr) => {
    return arr.filter(item => item.filterType === name)[0];
}

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
    // subscribeStream: subscribeStream,
    createOrder: createOrder,
    getOpenOrders: getOpenOrders,
    cancelOrders: cancelOrders,
    initExchange: initExchange,
    getAccountInfo: getAccountInfo,
}