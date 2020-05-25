const fetch = require('node-fetch');
const WebSocket = require('ws');
const chalk = require('chalk');
const { createSign, createHmac } = require('crypto')
const { readFile } = require('fs').promises
const path = require('path')    // because of dotenv -- remove later
require('dotenv').config({path: path.resolve(__dirname, '../.env')});   //for DEBUG ... later move to root file

const API_KEY = process.env.API_KEY;
const PROTOCOL_API = "https://"
const PROTOCOL_STREAM = "wss://"
const ROOT_URL = "testnet.binance.vision";
// const ROOT_URL = "api.binance.com";
const API_URI = "/api/v3";
const STREAM_URI = "/stream";

const getExchangeInfo = async () => {
    const data = await _fetchAPI({endpoint: "exchangeInfo"})
    // console.log(data);
    return data
}

const getAccountInfo = async () => {
    const data = await _fetchAPI({
        endpoint: "account", 
        authRequired: true,
        signatureRequired: true,
        params: {}
    })

    return data;
}

const createOrder= async params => {

    if (params.type === 'LIMIT') {
        let curPrice = await getSymbolPrice(params.symbol);
        console.log(curPrice)

        // TODO add price transformation to comply with filters

        params.price = (+curPrice.price * +params.priceModifier).toFixed(8)
        delete params.priceModifier

        params.timeInForce = 'GTC'
    }

    console.log(params)

    const order = await _fetchAPI({
        endpoint: 'order',
        authRequired: true,
        signatureRequired: true,
        method: 'POST',
        params: params
    })

    return order
}

const getOpenOrders = async symbol => {
    const orders = await _fetchAPI({
        endpoint: 'openOrders',
        authRequired: true,
        signatureRequired: true,
        params: {
            symbol: symbol
        }
    })

    return orders
}

const cancelOrders = async symbol => {
    const orders = await _fetchAPI({
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
    const res = await _fetchAPI({
        endpoint: 'ticker/price',
        params: {
            symbol: symbol
        }
    })

    return res
}

const _fetchData = async ({
    params = {},
    headers = {},
    // body = {},
    method = 'GET',   
    endpoint,
    apiUri,
    authRequired = false,
    signatureRequired = false,
}) => {
    // sanity checks
    if (!endpoint) {
        console.log(chalk.red("Please provide an endpoint"))
        return false
    }

    if (!apiUri) {
        console.log(chalk.red("Please provide a URI"))
        return false
    }

    let url = `${PROTOCOL_API}${ROOT_URL}${apiUri}/${endpoint}`;
    
    if (authRequired) {
        if (signatureRequired) {
            params.signature = await _signRequest(params);    // create signature
            // params.signature = await _signRequestHMAC(params);    // create signature
        }

        headers["X-MBX-APIKEY"] = API_KEY;                // add header with api key
    }

    
    
    const queryString = _mapParamsToQuery(params);
    
    
    // if (method === 'POST') {
    //     body = {...params}
    // } else {
    if (queryString.length > 1) {
        url += `?${queryString}`;
    }
    // }

    // console.log({headers, params, body, url, method})

    try {
        let response = await fetch(url, {
            method: method,
            headers: headers,
        });

        if (response.status !== 200) {
            
            try{
                return await response.json();
            } catch (err) {
                console.log({
                    status: response.status, 
                    message: response.statusText,
                    url: response.url
                })

                return false;
            }
        }

        let json = await response.json();

        return json
    } catch (err) {
        console.log(chalk.red(err));
        return false;
    }
}

const _fetchAPI = async args => {
    if (args.signatureRequired) {
        args.params.timestamp = new Date().getTime();   // add timestamp to requests with auth
    }
    return await _fetchData({...args, apiUri: API_URI})
}

const _signRequestHMAC = async params => {
    const queryString = _mapParamsToQuery(params);

    // console.log("Signing " + queryString)
    // console.log(SECRET_KEY)
    
    const signature = createHmac('sha256', SECRET_KEY.toString())
                    .update(queryString)
                    .digest('hex');

    return signature;
}
const _signRequest = async params => {
    const queryString = _mapParamsToQuery(params);

    // console.log("Signing " + queryString)
    
    const sign = createSign('SHA256');
    sign.update(queryString);
    sign.end();
    
    const pk = await readFile(`${__dirname}/../keys/app-prv-key.pem`);
    const signature = sign.sign(pk, 'base64');
    const encoded = encodeURIComponent(signature.toString());

    return encoded;
}

const _mapParamsToQuery = params => {
    // return empty string if params are empty
    if (Object.keys(params).length === 0) {
        return "";
    }

    return Object.keys(params).map(key => `${key}=${params[key]}`).join('&');
}


const _getListenKey = async () => {
    const key = await _fetchAPI({
        endpoint: 'userDataStream',
        method: 'POST',
        authRequired: true,
        params: {}
    })

    if (!key) {
        console.log(chalk.red("Getting listenKey failed!"))
        return {...context};
    }

    return key.listenKey;
}

const _keepAlive = async key => {
    const refreshed = await _fetchAPI({
        endpoint: 'userDataStream',
        method: 'PUT',
        authRequired: true,
        signatureRequired: false,
        params: {listenKey: key}
    });

    if (!refreshed) {
        console.log(chalk.red("Getting listeKey failed!"))
        return false;
    }

    return refreshed.listenKey;
}

const subscribeStream = async ({user = false, obs}) => {
    let listenKey, streamStarted;
    let url = `${PROTOCOL_STREAM}${ROOT_URL}${STREAM_URI}`;

    if (user) {
        listenKey = await _getListenKey();
        url += `?streams=${listenKey}`;
    }

    const ws = new WebSocket(url);


    ws.on('open', () => {
        streamStarted = new Date();
        obs.next({name: 'streamStarted'})
    })
    
    ws.on('close', (code, reason) => {
        console.log({code, reason})
    })
    
    ws.on('message', data => {
        // console.log(data)
        
        obs.next({
            name: 'data',
            data: JSON.parse(data)
            
        })
    })

    ws.on('error', error => {
        console.log(chalk.red(error))
    })

    ws.on('ping', data => {
        console.log("Received ping " + JSON.stringify(data))
        ws.pong(data);

        // check if need to send keepAlive
        let timedelta = new Date() - streamStarted;
        if (timedelta > 1000 * 60 * 30) {
            console.log("Sending keepAlive request")
            listenKey = _keepAlive(listenKey);
        }
    })

    return ws
}

module.exports = {
    getAccountInfo: getAccountInfo,
    subscribeStream: subscribeStream,
    createOrder: createOrder,
    getOpenOrders: getOpenOrders,
    cancelOrders: cancelOrders,
    getExchangeInfo: getExchangeInfo
}