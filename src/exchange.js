const fetch = require('node-fetch');
const WebSocket = require('ws');
const chalk = require('chalk');
const { createSign, createHmac } = require('crypto')
const { readFile } = require('fs').promises;
const path = require('path');
require('dotenv').config({path: path.resolve(__dirname, '../.env')});

// setup
const API_KEY = process.env.API_KEY;
const PROTOCOL_API = "https://"
const PROTOCOL_STREAM = "wss://"
const ROOT_URL = "testnet.binance.vision";
const API_URI = "/api/v3";
const STREAM_URI = "/stream";


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
        console.log(chalk.red("Please provide an endpoint"))
        return false
    }

    if (!apiUri) {
        console.log(chalk.red("Please provide a URI"))
        return false
    }

    let url = `${PROTOCOL_API}${ROOT_URL}${apiUri}/${endpoint}`;
    
    if (authRequired) {
        headers["X-MBX-APIKEY"] = API_KEY;                // add header with api key
    }
    
    if (signatureRequired) {
        params.signature = await _signRequest(params);    // create signature
    }

    const queryString = _mapParamsToQuery(params);
    
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

const fetchApi = async args => {
    if (args.signatureRequired) {
        args.params.timestamp = new Date().getTime();   // add timestamp to requests with auth
    }
    return await _fetchData({...args, apiUri: API_URI})
}

const _signRequestHMAC = async params => {
    const queryString = _mapParamsToQuery(params);
    const signature = createHmac('sha256', SECRET_KEY.toString())
        .update(queryString)
        .digest('hex');

    return signature;
}
const _signRequest = async params => {
    const queryString = _mapParamsToQuery(params);
    
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
                listenKey = await _keepAlive(listenKey);
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