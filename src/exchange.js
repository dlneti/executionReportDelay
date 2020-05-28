const fetch = require('node-fetch');
const WebSocket = require('ws');
const chalk = require('chalk');
const { createSign, createHmac } = require('crypto')
const { readFile } = require('fs').promises;
const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

// local imports
const { helpers: { mapParamsToQuery } } = require('../lib');

// setup
const API_KEY = process.env.API_KEY;
const PROTOCOL_API = "https://"
const PROTOCOL_STREAM = "wss://"
const ROOT_URL = "testnet.binance.vision";
const API_URI = "/api/v3";
const STREAM_URI = "/stream";


/**
 * Submits a request to API with incoming parameters.
 * Handles auth automatically (see authRequired and signatureRequired params).
 * Maps request parameters to query string (empty string for empty params object).
 * POST request with body currently not supported.
 * 
 * Returns Object with either response data Object or error Object and 'ok' flag indicating if request failed or succeeded.
 * @param {Object} params request parameters                     // default empty 
 * @param {Object} headers request headers                       // default empty
 * @param {string} method request method                         // default 'GET'
 * @param {string} endpoint api endpoint                
 * @param {string} apiUri api uri, this is concatenated after root URL
 * @param {Boolean} authRequired if true, auth header will be added                                         // default false
 * @param {Boolean} signatureRequired if true signature and timestamp will be added to query string         // default false
 */
const _fetchData = async ({
    params = {},
    headers = {},
    method = 'GET',   
    endpoint,
    apiUri,
    authRequired = false,
    signatureRequired = false,
}) => {
    // sanity checks
    if (!endpoint) {
        console.log(chalk.red("No enpoint provided."))
        return false
    }

    if (!apiUri) {
        console.log(chalk.red("No API URI provided."))
        return false
    }

    let url = `${PROTOCOL_API}${ROOT_URL}${apiUri}/${endpoint}`;
    
    if (authRequired) {
        headers["X-MBX-APIKEY"] = API_KEY;                // add header with api key
    }
    
    if (signatureRequired) {
        params.timestamp = new Date().getTime();          // add timestamp to requests with auth
        params.signature = await _signRequest(params);    // create signature
    }

    const queryString = mapParamsToQuery(params);
    
    if (queryString.length > 1) {
        url += `?${queryString}`;
    }

    try {
        let response = await fetch(url, {
            method: method,
            headers: headers,
        });

        if (response.status !== 200) {
            let error;
            try{
                error = await response.json();
            } catch (err) {
                error = err;
            }
            return {ok: false, statusText: response.statusText, status: response.status, error: error};
        }

        let json = await response.json();
        return {ok: true, data: json};
    } catch (err) {
        return {ok: false, error: err}
    }
}


/**
 * Public wrapper function for _fetchApi method.
 * Returns response Object.
 * @param {Object} args request params
 */
const fetchApi = async args => {
    return await _fetchData({...args, apiUri: API_URI})
}

/**
 * Returns HMAC signature of request parameters parsed to queryString.
 * @param {Object} params request parameters.
 */
const _signRequestHMAC = async params => {
    const queryString = mapParamsToQuery(params);
    const signature = createHmac('sha256', SECRET_KEY.toString())
        .update(queryString)
        .digest('hex');

    return signature;
}

/**
 * Signs request parameters parsed to queryString with locall saved private key, converts to base64.
 * Returns URL encoded signature.
 * @param {Object} params request parameters
 */
const _signRequest = async params => {
    const queryString = mapParamsToQuery(params);
    
    const sign = createSign('SHA256');
    sign.update(queryString);
    sign.end();
    
    const pk = await readFile(`${__dirname}/../keys/app-prv-key.pem`);
    const signature = sign.sign(pk, 'base64');
    const encoded = encodeURIComponent(signature.toString());

    return encoded;
}


/**
 * Fetches listenKey (string) from binance 'userDataStream' endpoint.
 */
const _getListenKey = async () => {
    const key = await fetchApi({
        endpoint: 'userDataStream',
        method: 'POST',
        authRequired: true,
        params: {}
    })

    if (!key.ok) {
        console.log(chalk.red(`Getting listenKey failed: ${JSON.stringify(key)}`))
        return false;
    }

    return key.data.listenKey;
}

/**
 * Sends 'PUT' request to 'userDataStream' endpoint .
 * Endpoint returns valid listenKey.
 * Returns fresh listenKey.
 * @param {string} key listenKey
 */
const _keepAlive = async key => {
    const refreshed = await fetchApi({
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

/**
 * Public function, subscribes to Binance websocket stream.
 * Sends pong on every ping, also sends unsolicited pong frames to prevent from websocket from unexpected closing.
 * Sends keepAlive request every 30 mins.
 * Frames coming from websocket are emitted to the observable.
 * 
 * Returns websocket instance.
 * @param {Boolean} auth if true, subscribes to user data stream
 * @param {Rx.Subject} obs rx observable
 */
const subscribeStream = async (auth=true, obs) => {
    let listenKey, refreshTime, pongInterval;
    let url = `${PROTOCOL_STREAM}${ROOT_URL}${STREAM_URI}`;

    if (auth) {
        listenKey = await _getListenKey();
        if (!listenKey) {
            return false;
        }

        url += `?streams=${listenKey}`;
    }

    const ws = new WebSocket(url);

    ws.on('open', () => {
        refreshTime = new Date();
        obs.next({name: 'streamStarted'})

        // set pong interval to prevent 1006
        pongInterval = setInterval(async () => {
            ws.pong();

            // check if keepAlive to stream needs to be sent (every 30min)
            let timedelta = new Date() - refreshTime;
            if (timedelta > 1000 * 60 * 30) {
                console.log("Sending keepAlive request")
                listenKey = await _keepAlive(listenKey);        // sets a new listen key in case it changed
                refreshTime = new Date();
            }
        }, 1000 * 60)
    })
    
    ws.on('close', (code, reason) => {
        // console.log({code, reason})
        if (code === 1005) {
            // console.log('Stream closed OK')
        } else {
            console.error(chalk.red(`Unexpected stream close! ` + JSON.stringify({code, reason})))
        }

        clearInterval(pongInterval);
        obs.next({name: 'streamClosed'});   // emit streamClosed action
    })
    
    ws.on('message', data => {
        obs.next({
            name: 'data',
            data: JSON.parse(data)
            
        })
    })

    ws.on('error', error => {
        console.log(chalk.red(error))
    })

    ws.on('ping', data => {
        ws.pong();
    })

    return ws
}

module.exports = {
    fetchApi: fetchApi,
    subscribeStream: subscribeStream
}